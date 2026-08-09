-- =============================================================
-- 0019 — Previsões calculadas
-- =============================================================
-- "A IA precisa prever coisas." A maior parte do que se quer prever
-- aqui é aritmética sobre histórico, não inferência:
--
--   * quando o café acaba          → saldo ÷ consumo médio
--   * quando o projetor da K-302   → intervalo médio entre as
--     vai quebrar de novo             pendências anteriores do mesmo par
--   * o que vence esta semana      → soma de datas
--
-- Calcular isso em SQL tem três vantagens sobre pedir ao modelo: não
-- custa token, não alucina número, e o resultado é o mesmo toda vez.
-- O modelo entra depois, lendo estas previsões e procurando o que elas
-- não capturam — correlação entre coisas de tabelas diferentes.
-- =============================================================

create or replace function public.montar_previsoes()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  -- Intervalo entre aberturas sucessivas do mesmo item na mesma sala.
  -- Duas ocorrências não fazem padrão, mas fazem uma estimativa — e
  -- estimativa com data é mais acionável do que "costuma quebrar".
  reincidencia as (
    select
      p.local_id,
      p.item_id,
      count(*)                             as ocorrencias,
      max(p.aberta_em)                     as ultima,
      (max(p.aberta_em) - min(p.aberta_em))::numeric
        / nullif(count(*) - 1, 0)          as intervalo_medio
    from public.pendencias p
    group by p.local_id, p.item_id
    having count(*) >= 2
  ),
  -- Consumo das duas últimas semanas contra as duas anteriores. É o que
  -- distingue "gasta 3 por semana" de "está gastando cada vez mais".
  tendencia as (
    select
      s.id,
      s.nome,
      s.unidade,
      coalesce(sum(-m.quantidade) filter (
        where m.data >= now() - interval '14 days'), 0) as recente,
      coalesce(sum(-m.quantidade) filter (
        where m.data >= now() - interval '28 days'
          and m.data <  now() - interval '14 days'), 0) as anterior
    from public.suprimentos s
    left join public.movimentos_suprimento m
           on m.suprimento_id = s.id and m.tipo = 'consumo'
    where s.ativo
    group by s.id, s.nome, s.unidade
  )
  select jsonb_build_object(
    'gerado_em', now(),

    -- ---------- Vai quebrar de novo ----------
    'reincidencia', coalesce((
      select jsonb_agg(x order by x.previsto, x.local_codigo)
        from (
          select
            l.codigo as local_codigo,
            i.nome   as item,
            r.ocorrencias,
            round(r.intervalo_medio)::integer as intervalo_medio_dias,
            (r.ultima + round(r.intervalo_medio)::integer) as previsto,
            (r.ultima + round(r.intervalo_medio)::integer) - current_date as faltam
          from reincidencia r
          join public.locais l          on l.id = r.local_id
          join public.itens_checklist i on i.id = r.item_id
         where r.intervalo_medio is not null
           and r.intervalo_medio > 0
           -- Só o que a estimativa coloca nos próximos 45 dias, ou já
           -- passou do previsto. Previsão para daqui a oito meses não
           -- muda nenhuma decisão de hoje.
           and (r.ultima + round(r.intervalo_medio)::integer) <= current_date + 45
        ) x
    ), '[]'::jsonb),

    -- ---------- Estoque ----------
    'esgotamento', coalesce((
      select jsonb_agg(x order by x.dias_restantes nulls last, x.nome)
        from (
          select
            s.nome,
            s.quantidade_atual,
            s.unidade,
            s.dias_restantes,
            s.previsao_esgotamento,
            t.recente,
            t.anterior,
            case
              when t.anterior > 0
                then round((t.recente - t.anterior) / t.anterior * 100)
              else null
            end as variacao_percentual
          from public.vw_suprimentos_status s
          join tendencia t on t.id = s.id
         where s.dias_restantes is not null
           and s.dias_restantes <= 45
        ) x
    ), '[]'::jsonb),

    -- ---------- Consumo acelerando ----------
    -- Separado do esgotamento de propósito: um item pode ter estoque
    -- para meses e ainda assim estar dobrando de consumo, e é aí que
    -- convém perguntar por quê antes de virar urgência.
    'consumo_acelerando', coalesce((
      select jsonb_agg(x order by x.variacao desc)
        from (
          select
            t.nome,
            t.recente,
            t.anterior,
            round((t.recente - t.anterior) / t.anterior * 100) as variacao
          from tendencia t
         where t.anterior > 0
           and t.recente > t.anterior * 1.3
        ) x
    ), '[]'::jsonb),

    -- ---------- Salas em risco ----------
    -- Quem tem pendência aberta há muito tempo e histórico de repetir é
    -- candidata a chamado, não a mais uma ronda.
    'salas_criticas', coalesce((
      select jsonb_agg(x order by x.pendencias_abertas desc, x.dias_da_mais_antiga desc)
        from (
          select
            l.codigo as local_codigo,
            count(*) as pendencias_abertas,
            max(current_date - p.aberta_em) as dias_da_mais_antiga,
            bool_or(exists (
              select 1 from public.chamados c
               where c.pendencia_id = p.id
                 and c.status not in ('concluido', 'cancelado')
            )) as tem_chamado
          from public.pendencias p
          join public.locais l on l.id = p.local_id
         where p.fechada_em is null
         group by l.codigo
        having count(*) >= 2 or max(current_date - p.aberta_em) >= 21
        ) x
    ), '[]'::jsonb)
  );
$$;

comment on function public.montar_previsoes() is
  'Previsões aritméticas sobre o histórico: reincidência, esgotamento, aceleração de consumo, salas em risco. Nenhuma passa por modelo.';

revoke all on function public.montar_previsoes() from public, anon;
grant execute on function public.montar_previsoes() to authenticated;
grant execute on function public.montar_previsoes() to service_role;
