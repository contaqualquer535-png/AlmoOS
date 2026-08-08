-- =============================================================
-- 0012 — Resumo da planta passa a listar todo ambiente
-- =============================================================
-- A 0011 fazia join com plantas, então só aparecia ambiente já
-- desenhado. Como o seed só desenha tipo = 'sala', banheiro,
-- almoxarifado e sala dos professores ficavam invisíveis — e sem
-- aparecer na lista não há por onde criar a planta deles.
--
-- Agora é left join: todo ambiente ativo aparece, e `tem_planta` diz
-- quem já foi desenhado. EXTERNO fica de fora porque não é um espaço
-- físico, é o destino de quem saiu do CETEC.
--
-- É create or replace: as colunas antigas mantêm nome, tipo e ordem, e
-- tem_planta entra no fim — as duas condições que o Postgres exige.
-- =============================================================

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
  (p.local_id is not null) as tem_planta
from public.locais l
left join public.plantas p on p.local_id = l.id
left join lateral jsonb_array_elements(p.elementos) as e(valor) on true
left join public.vw_classes_status_atual cs
       on cs.local_id = l.id
      and cs.classe_ref = e.valor->>'ref'
where l.ativo
  and l.tipo <> 'externo'
group by l.id, p.local_id;

comment on view public.vw_plantas_resumo is
  'Um ambiente físico ativo por linha. tem_planta distingue o que já foi desenhado do que ainda não.';
