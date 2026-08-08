-- Reverte 0012 — volta o resumo a listar só ambiente com planta.
--
-- Restaura a definição da 0011 em vez de derrubar a view: no rollback
-- completo a 0011.down passa logo depois e a derruba de qualquer jeito,
-- mas reverter só esta migration precisa deixar o schema no estado
-- anterior, não sem a view.
create or replace view public.vw_plantas_resumo
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
    as classes_faltando,
  true as tem_planta
from public.locais l
join public.plantas p on p.local_id = l.id
left join lateral jsonb_array_elements(p.elementos) as e(valor) on true
left join public.vw_classes_status_atual cs
       on cs.local_id = l.id
      and cs.classe_ref = e.valor->>'ref'
where l.ativo
group by l.id, p.local_id;
