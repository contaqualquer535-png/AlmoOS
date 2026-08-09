-- =============================================================
-- 0025 — Registro de uso da IA
-- =============================================================
-- A API do Gemini não informa quanto resta da cota. Ela devolve, a cada
-- resposta, quantos tokens aquela chamada custou — e é só isso que dá
-- para saber.
--
-- Então o contador é nosso: uma linha por chamada, e a tela soma. Isso
-- responde "quanto eu já usei hoje", que é a pergunta útil. "Quanto
-- falta" continua sem resposta possível, e a tela diz isso em vez de
-- inventar uma barra de progresso sobre um limite que não conhecemos.
--
-- Serve também para diagnóstico: quando o assistente ficar lento ou
-- começar a recusar, o registro mostra se foi volume ou outra coisa.
-- =============================================================

create table public.uso_de_ia (
  id              uuid primary key default gen_random_uuid(),
  quando          timestamptz not null default now(),
  -- 'assistente', 'insight', 'interpretacao'. Texto e não enum: a lista
  -- vai crescer conforme novos usos aparecerem, e cada valor novo num
  -- enum exige migration isolada (decisão 08).
  contexto        text not null,
  modelo          text not null,
  tokens_entrada  integer,
  tokens_saida    integer,
  chamadas        integer not null default 1,
  erro            text
);

create index uso_de_ia_recente_idx on public.uso_de_ia (quando desc);

comment on table public.uso_de_ia is
  'Uma linha por chamada ao modelo. O Google não expõe cota restante; este é o único contador possível.';

-- ---------- Resumo do consumo ----------

create or replace function public.resumo_do_uso_de_ia()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'hoje', (
      select jsonb_build_object(
        'chamadas', coalesce(sum(chamadas), 0),
        'tokens_entrada', coalesce(sum(tokens_entrada), 0),
        'tokens_saida', coalesce(sum(tokens_saida), 0),
        'erros', count(*) filter (where erro is not null)
      )
      from public.uso_de_ia
      -- Fuso de Caxias: a cota do Google vira em horário do Pacífico,
      -- mas o operador pensa no dia dele. Divergência assumida.
      where (quando at time zone 'America/Sao_Paulo')::date
            = (now() at time zone 'America/Sao_Paulo')::date
    ),
    'ultima_hora', (
      select coalesce(sum(chamadas), 0)
        from public.uso_de_ia
       where quando >= now() - interval '1 hour'
    ),
    'mes', (
      select jsonb_build_object(
        'chamadas', coalesce(sum(chamadas), 0),
        'tokens_saida', coalesce(sum(tokens_saida), 0)
      )
      from public.uso_de_ia
      where quando >= date_trunc('month', now())
    ),
    'por_contexto', coalesce((
      select jsonb_object_agg(x.contexto, x.chamadas)
        from (
          select contexto, sum(chamadas) as chamadas
            from public.uso_de_ia
           where quando >= now() - interval '30 days'
           group by contexto
        ) x
    ), '{}'::jsonb)
  );
$$;

-- ---------- Privilégios ----------
alter table public.uso_de_ia enable row level security;
revoke all on public.uso_de_ia from anon;
create policy operador_acesso_total_uso_de_ia
  on public.uso_de_ia for all to authenticated
  using (true) with check (true);

revoke all on function public.resumo_do_uso_de_ia() from public, anon;
grant execute on function public.resumo_do_uso_de_ia() to authenticated;
grant execute on function public.resumo_do_uso_de_ia() to service_role;
