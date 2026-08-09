-- =============================================================
-- 0017 — Quantidade na ronda, e desfazer o lançamento
-- =============================================================
-- Dois buracos que só apareceram no uso:
--
-- 1. Mesas e cadeiras não são pergunta de sim ou não. "Tem 30 cadeiras
--    aqui" é o dado que interessa, e ✓/M/X/T sozinho não guarda isso.
--
-- 2. Tocar no código errado não tinha desfazer. Como o índice único é
--    (local, item, data), o único jeito de corrigir era trocar por outro
--    código — e "nenhum código" era inalcançável.
--
-- A quantidade fica em `verificacoes` e não em `plantas` de propósito.
-- A planta é documentação visual e não é refeita toda semana (decisão
-- 01); a contagem da ronda é medição datada, e o valor está justamente
-- em poder comparar a de hoje com a de um mês atrás.
-- =============================================================

alter table public.itens_checklist
  add column pede_quantidade boolean not null default false;

comment on column public.itens_checklist.pede_quantidade is
  'Quando true, a ronda pede um número junto do código: quantas mesas, quantas cadeiras.';

alter table public.verificacoes
  add column quantidade integer
    check (quantidade is null or quantidade >= 0);

comment on column public.verificacoes.quantidade is
  'Contagem do item naquele dia. Null para item que não pede quantidade.';

update public.itens_checklist
   set pede_quantidade = true
 where nome in ('Mesas', 'Cadeiras');

-- ---------- Série de contagem por sala ----------
-- Permite ver a contagem de hoje ao lado da anterior. Sumir cadeira aos
-- poucos é o tipo de coisa que só aparece na comparação.
create or replace function public.serie_contagem_do_item(
  p_local_id uuid,
  p_item_id  uuid,
  p_limite   integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.data), '[]'::jsonb)
    from (
      select v.data, v.quantidade
        from public.verificacoes v
       where v.local_id = p_local_id
         and v.item_id = p_item_id
         and v.quantidade is not null
       order by v.data desc
       limit p_limite
    ) x;
$$;

revoke all on function public.serie_contagem_do_item(uuid, uuid, integer)
  from public, anon;
grant execute on function public.serie_contagem_do_item(uuid, uuid, integer)
  to authenticated;

-- ---------- Contagem mais recente por sala ----------
create or replace view public.vw_contagem_por_sala
with (security_invoker = true) as
select distinct on (v.local_id, v.item_id)
  v.local_id,
  l.codigo as local_codigo,
  l.bloco,
  v.item_id,
  i.nome as item,
  v.quantidade,
  v.data as contado_em
from public.verificacoes v
join public.locais l          on l.id = v.local_id
join public.itens_checklist i on i.id = v.item_id
where v.quantidade is not null
order by v.local_id, v.item_id, v.data desc;

comment on view public.vw_contagem_por_sala is
  'Última contagem conhecida de cada item contável, por sala.';

revoke all on public.vw_contagem_por_sala from anon;
grant select on public.vw_contagem_por_sala to authenticated;
