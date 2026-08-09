-- =============================================================
-- 0026 — O almoxarifado como um lugar só
-- =============================================================
-- Três tabelas guardam coisa que fica na mesma sala:
--
--   suprimentos  consumível, tem saldo, não volta
--   recursos     emprestável por quantidade, volta
--   inventario   peça única com patrimônio, volta
--
-- Elas continuam separadas porque as regras são de fato diferentes
-- (decisão 12) — o saldo de café é mantido por trigger, a extensão tem
-- retirada aberta, o projetor tem responsável e previsão. Fundi-las
-- numa tabela deixaria dois terços das colunas nulas em dois terços das
-- linhas, que foi exatamente o erro que a decisão 04 corrigiu.
--
-- Mas o operador abre a porta do almoxarifado e vê uma coisa só. Então
-- a **leitura** é unificada, e só ela.
--
-- A relação não é simétrica: tudo que é suprimento ou recurso está no
-- almoxarifado, e nem tudo que está no almoxarifado é suprimento — o
-- projetor patrimoniado fica lá e não tem saldo nem ponto de reposição.
-- =============================================================

create or replace view public.vw_almoxarifado
with (security_invoker = true) as

-- ---------- Suprimentos ----------
select
  'suprimento'::text                as natureza,
  s.id,
  s.nome,
  s.categoria::text                 as detalhe,
  s.unidade,
  s.quantidade_atual                as quantidade,
  s.ponto_reposicao                 as minimo,
  s.abaixo_do_ponto                 as em_falta,
  null::text                        as codigo_barras,
  null::text                        as com_quem,
  0                                 as fora,
  s.dias_restantes
from public.vw_suprimentos_status s

union all

-- ---------- Recursos ----------
select
  'recurso',
  r.id,
  r.nome,
  case
    when r.quantidade_emprestada > 0
      then r.quantidade_emprestada || ' fora'
    else 'tudo no lugar'
  end,
  r.unidade,
  r.quantidade_disponivel,
  r.minimo_desejado,
  r.abaixo_do_minimo,
  null,
  null,
  r.quantidade_emprestada,
  null
from public.vw_recursos_status r

union all

-- ---------- Patrimônio ----------
-- Uma linha por peça: aqui a quantidade é sempre 1 e o que interessa é
-- onde está e com quem.
select
  'patrimonio',
  inv.id,
  inv.item,
  coalesce(l.codigo, 'sem local'),
  'un',
  1,
  0,
  (inv.emprestado and inv.previsao_devolucao < current_date),
  inv.codigo_barras,
  inv.responsavel,
  case when inv.emprestado then 1 else 0 end,
  null
from public.inventario inv
left join public.locais l on l.id = inv.local_atual_id
where inv.ativo;

comment on view public.vw_almoxarifado is
  'Leitura unificada do que existe no almoxarifado. As três tabelas de origem continuam separadas; só a visão é uma.';

revoke all on public.vw_almoxarifado from anon;
grant select on public.vw_almoxarifado to authenticated;

-- ---------- Resumo ----------

create or replace function public.resumo_do_almoxarifado()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'suprimentos', (
      select jsonb_build_object(
        'itens', count(*),
        'em_falta', count(*) filter (where em_falta))
      from public.vw_almoxarifado where natureza = 'suprimento'),
    'recursos', (
      select jsonb_build_object(
        'tipos', count(*),
        'disponiveis', coalesce(sum(quantidade), 0),
        'fora', coalesce(sum(fora), 0),
        'em_falta', count(*) filter (where em_falta))
      from public.vw_almoxarifado where natureza = 'recurso'),
    'patrimonio', (
      select jsonb_build_object(
        'itens', count(*),
        'emprestados', coalesce(sum(fora), 0),
        'atrasados', count(*) filter (where em_falta))
      from public.vw_almoxarifado where natureza = 'patrimonio')
  );
$$;

revoke all on function public.resumo_do_almoxarifado() from public, anon;
grant execute on function public.resumo_do_almoxarifado() to authenticated;
