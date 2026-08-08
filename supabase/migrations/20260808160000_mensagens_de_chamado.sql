-- =============================================================
-- 0015 — Mensagens do SERVi por chamado
-- =============================================================
-- O SERVi (OTRS da UCS) notifica tudo por e-mail, e o assunto sempre
-- carrega [Chamado#001538977]. Esse número é a chave: com ele, cada
-- mensagem encontra o chamado correspondente aqui dentro.
--
-- Resolve duas coisas que a lista do SERVi não resolve:
--   * o histórico da conversa deixa de morrer na caixa de e-mail
--   * chamado que existe lá e não aqui passa a existir aqui sozinho,
--     e com isso entra nos pontos de atenção
-- =============================================================

create type public.direcao_mensagem as enum ('recebida', 'enviada');

create table public.mensagens_chamado (
  id          uuid primary key default gen_random_uuid(),
  chamado_id  uuid not null references public.chamados(id) on delete cascade,
  direcao     public.direcao_mensagem not null default 'recebida',
  assunto     text,
  remetente   text,
  corpo       text,
  recebido_em timestamptz not null default now(),
  -- Message-ID do e-mail. Único quando presente: o encaminhamento pode
  -- repetir, e reprocessar a mesma mensagem não pode duplicar a linha.
  id_externo  text unique,
  criado_em   timestamptz not null default now()
);

create index mensagens_chamado_idx
  on public.mensagens_chamado (chamado_id, recebido_em desc);

comment on table public.mensagens_chamado is
  'Histórico de e-mail por chamado, casado pelo número do SERVi no assunto.';

-- ---------- Ingestão ----------

/**
 * Registra uma mensagem do SERVi, criando o chamado se ele ainda não
 * existir aqui.
 *
 * Criar em vez de recusar é deliberado: o operador abre chamado pela
 * tela do SERVi, não por este sistema. Se a ingestão exigisse que o
 * chamado já existisse, ela só funcionaria para os que ele lembrou de
 * cadastrar duas vezes — que são justamente os que ele não esquece.
 */
create or replace function public.registrar_mensagem_de_chamado(
  p_protocolo   text,
  p_assunto     text,
  p_remetente   text default null,
  p_corpo       text default null,
  p_recebido_em timestamptz default now(),
  p_id_externo  text default null,
  p_fila        text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chamado_id uuid;
  v_criou      boolean := false;
  v_titulo     text;
  v_fechou     boolean := false;
  v_mensagem   uuid;
begin
  if p_protocolo is null or btrim(p_protocolo) = '' then
    raise exception 'Mensagem sem número de chamado no assunto.';
  end if;

  select id into v_chamado_id
    from public.chamados
   where protocolo_externo = btrim(p_protocolo);

  if v_chamado_id is null then
    -- Título vindo do assunto: tudo depois do último ": " costuma ser o
    -- assunto real do chamado no padrão do SERVi.
    v_titulo := nullif(btrim(regexp_replace(coalesce(p_assunto, ''),
                  '^.*?:\s*', '', 'g')), '');

    insert into public.chamados
      (titulo, destino, protocolo_externo, status, aberto_em, enviado_em)
    values (
      coalesce(v_titulo, 'Chamado ' || btrim(p_protocolo)),
      coalesce(nullif(btrim(coalesce(p_fila, '')), ''), 'SEAMB'),
      btrim(p_protocolo),
      'em_atendimento',
      p_recebido_em,
      p_recebido_em
    )
    returning id into v_chamado_id;

    v_criou := true;
  end if;

  -- Palavras que o SERVi usa quando encerra. Deliberadamente conservador:
  -- na dúvida o chamado continua aberto, porque fechar sozinho o que
  -- ainda tramita esconderia justamente o que está encalhado.
  v_fechou := coalesce(p_assunto, '') ~* '(fechamento|chamado fechado|encerrad)';

  if v_fechou then
    update public.chamados
       set status     = 'concluido',
           fechado_em = coalesce(fechado_em, p_recebido_em)
     where id = v_chamado_id
       and status not in ('concluido', 'cancelado');
  end if;

  -- Se a fila mudou de setor, o destino acompanha.
  if nullif(btrim(coalesce(p_fila, '')), '') is not null then
    update public.chamados set destino = btrim(p_fila) where id = v_chamado_id;
  end if;

  insert into public.mensagens_chamado
    (chamado_id, assunto, remetente, corpo, recebido_em, id_externo)
  values (v_chamado_id, p_assunto, p_remetente, p_corpo, p_recebido_em, p_id_externo)
  on conflict (id_externo) do nothing
  returning id into v_mensagem;

  return jsonb_build_object(
    'chamado_id',    v_chamado_id,
    'criou_chamado', v_criou,
    'fechou',        v_fechou,
    -- null quando a mensagem já existia: o chamador precisa distinguir
    -- "processei" de "já tinha processado antes".
    'mensagem_id',   v_mensagem
  );
end;
$$;

comment on function public.registrar_mensagem_de_chamado is
  'Casa uma mensagem do SERVi ao chamado pelo protocolo, criando-o se necessário. Idempotente pelo Message-ID.';

-- ---------- Privilégios ----------
alter table public.mensagens_chamado enable row level security;
revoke all on public.mensagens_chamado from anon;
create policy operador_acesso_total_mensagens_chamado
  on public.mensagens_chamado for all to authenticated
  using (true) with check (true);

revoke all on function public.registrar_mensagem_de_chamado(
  text, text, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.registrar_mensagem_de_chamado(
  text, text, text, text, timestamptz, text, text) to authenticated;
grant execute on function public.registrar_mensagem_de_chamado(
  text, text, text, text, timestamptz, text, text) to service_role;
