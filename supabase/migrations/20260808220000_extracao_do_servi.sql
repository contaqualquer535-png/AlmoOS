-- =============================================================
-- 0021 — Extração melhor dos e-mails do SERVi
-- =============================================================
-- Com e-mails reais em mãos, dá para parar de adivinhar. O corpo tem
-- campos rotulados:
--
--   Número: 001538414
--   Título: Tampas de Ralos
--   Descrição:
--   ...
--   Atendente: Sem atendente
--   GLOG::SEAMB
--
-- E no encerramento:
--
--   Assunto: Fechamento
--   GLOG::SMGE::Manutenção Geral
--
-- O que muda em relação à 0015:
--
--   * título sai de "Título:" em vez de ser recortado do assunto
--   * descrição é capturada e guardada
--   * a fila pega a linha inteira, então "Manutenção Geral" não perde
--     o "Geral" ao parar no espaço
--   * o encerramento também olha "Assunto: Fechamento" no corpo
-- =============================================================

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
  v_descricao  text;
  v_fila       text;
  v_fechou     boolean := false;
  v_mensagem   uuid;
  v_corpo      text := coalesce(p_corpo, '');
begin
  if p_protocolo is null or btrim(p_protocolo) = '' then
    raise exception 'Mensagem sem número de chamado no assunto.';
  end if;

  -- ---------- Extração dos campos rotulados ----------

  -- "Título: Tampas de Ralos" — a fonte confiável. O assunto só serve
  -- de reserva, porque nele o título vem depois de dois prefixos.
  v_titulo := nullif(btrim(
    (regexp_match(v_corpo, '(?im)^\s*T[íi]tulo:\s*(.+)$'))[1]
  ), '');

  if v_titulo is null then
    v_titulo := nullif(btrim(regexp_replace(
      regexp_replace(coalesce(p_assunto, ''), '\[[^\]]*\]\s*', '', 'g'),
      '^.*?:\s*', '', ''
    )), '');
  end if;

  -- Tudo entre "Descrição:" e o link de acompanhamento.
  v_descricao := nullif(btrim(
    (regexp_match(v_corpo,
      '(?is)Descri[çc][ãa]o:\s*(.+?)(?:Acompanhamento do chamado|Atendente:|GLOG::|$)'
    ))[1]
  ), '');

  -- A fila numa linha só. Capturar até o fim da linha, e não até o
  -- primeiro espaço, preserva nomes como "Manutenção Geral".
  v_fila := coalesce(
    nullif(btrim(p_fila), ''),
    nullif(btrim((regexp_match(v_corpo, '(?m)^\s*([A-Z]{2,}::[^\r\n]+?)\s*$'))[1]), '')
  );

  -- ---------- Encerramento ----------
  -- Duas fontes: o assunto ("Chamado encerrado") e o corpo, que traz
  -- "Assunto: Fechamento" na resposta do atendente. Continua
  -- conservador — na dúvida o chamado segue aberto, porque fechar
  -- sozinho o que ainda tramita esconderia o que está encalhado.
  v_fechou :=
    coalesce(p_assunto, '') ~* '(chamado encerrado|encerrad|fechamento|chamado fechado)'
    or v_corpo ~* '(?im)^\s*Assunto:\s*Fechamento\s*$'
    or v_corpo ~* 'Seu chamado foi encerrado';

  -- ---------- Chamado ----------

  select id into v_chamado_id
    from public.chamados
   where protocolo_externo = btrim(p_protocolo);

  if v_chamado_id is null then
    insert into public.chamados
      (titulo, descricao, destino, protocolo_externo, status, aberto_em, enviado_em)
    values (
      coalesce(v_titulo, 'Chamado ' || btrim(p_protocolo)),
      v_descricao,
      coalesce(v_fila, 'SEAMB'),
      btrim(p_protocolo),
      'em_atendimento',
      p_recebido_em,
      p_recebido_em
    )
    returning id into v_chamado_id;

    v_criou := true;
  else
    -- Completa o que faltava sem sobrescrever o que já está bom: a
    -- mensagem de abertura chega depois da de encerramento quando o
    -- histórico é importado fora de ordem.
    update public.chamados
       set titulo    = coalesce(nullif(titulo, 'Chamado ' || btrim(p_protocolo)), v_titulo, titulo),
           descricao = coalesce(descricao, v_descricao),
           destino   = coalesce(nullif(v_fila, ''), destino)
     where id = v_chamado_id;
  end if;

  if v_fechou then
    update public.chamados
       set status     = 'concluido',
           fechado_em = coalesce(fechado_em, p_recebido_em)
     where id = v_chamado_id
       and status not in ('concluido', 'cancelado');
  end if;

  -- ---------- Mensagem ----------

  insert into public.mensagens_chamado
    (chamado_id, assunto, remetente, corpo, recebido_em, id_externo)
  values (v_chamado_id, p_assunto, p_remetente, p_corpo, p_recebido_em, p_id_externo)
  on conflict (id_externo) do nothing
  returning id into v_mensagem;

  return jsonb_build_object(
    'chamado_id',    v_chamado_id,
    'criou_chamado', v_criou,
    'fechou',        v_fechou,
    'titulo',        v_titulo,
    'fila',          v_fila,
    'mensagem_id',   v_mensagem
  );
end;
$$;

-- ---------- Corrigir o que já entrou ----------
-- As mensagens de encerramento já estão gravadas; só o status do
-- chamado ficou para trás. Reprocessar pelo Gmail funcionaria, mas
-- daria trabalho à toa quando o dado já está aqui.
update public.chamados c
   set status = 'concluido',
       fechado_em = coalesce(c.fechado_em, m.recebido_em)
  from (
    select distinct on (chamado_id) chamado_id, recebido_em
      from public.mensagens_chamado
     where assunto ~* '(chamado encerrado|encerrad|fechamento|chamado fechado)'
        or corpo   ~* 'Seu chamado foi encerrado'
     order by chamado_id, recebido_em desc
  ) m
 where m.chamado_id = c.id
   and c.status not in ('concluido', 'cancelado');
