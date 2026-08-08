-- =============================================================
-- 0011 — Resumo da planta por local
-- =============================================================
-- Alimenta o índice de /planta: uma linha por sala com planta,
-- contando classes e quantas estão fora de ordem hoje.
--
-- O join com os elementos é LEFT LATERAL de propósito: uma planta
-- recém-criada tem elementos = '[]' e precisa continuar aparecendo na
-- lista, senão a sala some justamente quando falta desenhá-la.
-- =============================================================

create view public.vw_plantas_resumo
with (security_invoker = true) as
select
  l.id            as local_id,
  l.codigo,
  l.nome,
  l.bloco,
  l.ordem_visita,
  p.grid_cols,
  p.grid_rows,
  p.atualizado_em,
  -- Subconsulta escalar em vez de mais um join: agregar turma junto com
  -- os elementos do grid multiplicaria as linhas e estragaria a contagem
  -- de classes.
  coalesce((
    select array_agg(t.codigo order by t.codigo)
      from public.alocacoes a
      join public.turmas t on t.id = a.turma_id
     where a.local_id = l.id
       and a.data_inicio <= current_date
       and (a.data_fim is null or a.data_fim > current_date)
  ), '{}') as turmas_vigentes,
  count(*) filter (where e.valor->>'tipo' = 'classe')::integer
    as total_classes,
  count(*) filter (where e.valor->>'tipo' = 'classe' and cs.status = 'quebrada')::integer
    as classes_quebradas,
  count(*) filter (where e.valor->>'tipo' = 'classe' and cs.status = 'faltando')::integer
    as classes_faltando
from public.locais l
join public.plantas p on p.local_id = l.id
left join lateral jsonb_array_elements(p.elementos) as e(valor) on true
left join public.vw_classes_status_atual cs
       on cs.local_id = l.id
      and cs.classe_ref = e.valor->>'ref'
where l.ativo
group by l.id, p.local_id;

comment on view public.vw_plantas_resumo is
  'Uma linha por local com planta: dimensões do grid e contagem de classes quebradas/faltando segundo vw_classes_status_atual.';

revoke all on public.vw_plantas_resumo from anon;
grant select on public.vw_plantas_resumo to authenticated;
