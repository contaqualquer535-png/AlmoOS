-- =============================================================
-- 0009 — Views de leitura e montagem do plano do dia
-- =============================================================
-- Todas as views usam security_invoker: sem isso, uma view no schema
-- public roda com os privilégios do dono e contorna o RLS das tabelas
-- de base. É o erro clássico de RLS no Supabase.
-- =============================================================

-- ---------- Turmas vigentes por local ----------
create view public.vw_locais_com_turmas
with (security_invoker = true) as
select
  l.id,
  l.codigo,
  l.nome,
  l.bloco,
  l.tipo,
  l.ronda_padrao,
  l.ordem_visita,
  l.ativo,
  coalesce(
    array_agg(t.codigo order by t.codigo) filter (where t.codigo is not null),
    '{}'
  ) as turmas_vigentes
from public.locais l
left join public.alocacoes a
       on a.local_id = l.id
      and a.data_inicio <= current_date
      and (a.data_fim is null or a.data_fim > current_date)
left join public.turmas t on t.id = a.turma_id
group by l.id;

-- ---------- Pendências abertas, com idade ----------
create view public.vw_pendencias_abertas
with (security_invoker = true) as
select
  p.id,
  p.local_id,
  l.codigo as local_codigo,
  l.bloco,
  l.ordem_visita,
  p.item_id,
  i.nome as item,
  p.aberta_em,
  (current_date - p.aberta_em) as dias_aberta,
  p.observacao,
  exists (
    select 1 from public.chamados c
     where c.pendencia_id = p.id
       and c.status not in ('concluido', 'cancelado')
  ) as tem_chamado_aberto
from public.pendencias p
join public.locais l          on l.id = p.local_id
join public.itens_checklist i on i.id = p.item_id
where p.fechada_em is null;

-- ---------- Estoque: consumo médio e previsão de esgotamento ----------
create view public.vw_suprimentos_status
with (security_invoker = true) as
with consumo_30d as (
  select
    suprimento_id,
    sum(-quantidade) as total_consumido
  from public.movimentos_suprimento
  where tipo = 'consumo'
    and data >= now() - interval '30 days'
  group by suprimento_id
)
select
  s.id,
  s.nome,
  s.categoria,
  s.unidade,
  s.quantidade_atual,
  s.ponto_reposicao,
  round(coalesce(c.total_consumido, 0) / 30.0, 3) as consumo_medio_dia,
  case
    when coalesce(c.total_consumido, 0) <= 0 then null
    else floor(s.quantidade_atual / (c.total_consumido / 30.0))::integer
  end as dias_restantes,
  case
    when coalesce(c.total_consumido, 0) <= 0 then null
    else current_date + floor(s.quantidade_atual / (c.total_consumido / 30.0))::integer
  end as previsao_esgotamento,
  (s.quantidade_atual <= s.ponto_reposicao) as abaixo_do_ponto
from public.suprimentos s
left join consumo_30d c on c.suprimento_id = s.id
where s.ativo;

-- ---------- Estado atual de cada classe na planta ----------
create view public.vw_classes_status_atual
with (security_invoker = true) as
select distinct on (cs.local_id, cs.classe_ref)
  cs.local_id,
  cs.classe_ref,
  cs.status,
  cs.observacao,
  cs.registrado_em
from public.classes_status cs
order by cs.local_id, cs.classe_ref, cs.registrado_em desc;

-- ---------- Locais que faltam na ronda do dia ----------
create view public.vw_ronda_do_dia
with (security_invoker = true) as
select
  l.id as local_id,
  l.codigo,
  l.bloco,
  l.ordem_visita,
  count(v.id) as itens_registrados,
  (select count(*) from public.itens_checklist where ativo) as itens_esperados
from public.locais l
left join public.verificacoes v
       on v.local_id = l.id
      and v.data = current_date
where l.ativo and l.ronda_padrao
group by l.id;

-- ---------- Plano do dia ----------
-- Função e não view: recebe a data como parâmetro, o que permite
-- regerar o plano de um dia passado para conferência.
create or replace function public.montar_plano_do_dia(p_data date default current_date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'data', p_data,
    'e_dia_de_ronda', extract(isodow from p_data) in (1, 3, 5),
    'pendencias', coalesce((
      select jsonb_agg(x order by x.bloco, x.ordem_visita nulls last, x.local_codigo)
        from (
          select p.id, l.codigo as local_codigo, l.bloco, l.ordem_visita,
                 i.nome as item, p.aberta_em,
                 (p_data - p.aberta_em) as dias_aberta, p.observacao
            from public.pendencias p
            join public.locais l          on l.id = p.local_id
            join public.itens_checklist i on i.id = p.item_id
           where p.fechada_em is null and p.aberta_em <= p_data
        ) x
    ), '[]'::jsonb),
    'suprimentos_criticos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', s.nome, 'quantidade_atual', s.quantidade_atual,
               'unidade', s.unidade, 'ponto_reposicao', s.ponto_reposicao))
        from public.suprimentos s
       where s.ativo and s.quantidade_atual <= s.ponto_reposicao
    ), '[]'::jsonb),
    'tarefas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'titulo', t.titulo, 'status', t.status,
               'prazo', t.prazo, 'observacao', t.observacao))
        from public.tarefas t
       where t.status in ('pendente', 'em_andamento')
    ), '[]'::jsonb),
    'chamados', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'titulo', c.titulo, 'prioridade', c.prioridade,
               'status', c.status, 'destino', c.destino,
               'dias_aberto', (p_data - c.aberto_em::date)))
        from public.chamados c
       where c.status not in ('concluido', 'cancelado')
    ), '[]'::jsonb),
    'locais_pendentes_de_ronda', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', l.codigo, 'bloco', l.bloco)
                       order by l.bloco, l.ordem_visita nulls last)
        from public.locais l
       where l.ativo and l.ronda_padrao
         and not exists (
           select 1 from public.verificacoes v
            where v.local_id = l.id and v.data = p_data
         )
    ), '[]'::jsonb)
  );
$$;

comment on function public.montar_plano_do_dia(date) is
  'Monta o plano do dia em JSON. Fonte única para a tela do dashboard e para o PDF imprimível.';
