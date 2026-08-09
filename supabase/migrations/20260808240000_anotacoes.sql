-- =============================================================
-- 0023 — Anotações livres
-- =============================================================
-- Faltava o bloco de rascunho. Tudo no sistema exige forma: verificação
-- precisa de item e código, tarefa precisa de título, chamado precisa
-- de destino. Mas metade do que se anota no dia não tem forma ainda —
-- "o zelador falou que a fechadura da K-205 está dura", "perguntar ao
-- Sadi sobre a pintura".
--
-- Sem lugar para isso, essas frases vão para o papel e somem. A tabela
-- é deliberadamente frouxa: texto, e opcionalmente um local. Nada mais.
--
-- Fixar existe porque anotação sem hierarquia vira lista infinita onde
-- o que importa afunda.
-- =============================================================

create table public.anotacoes (
  id           uuid primary key default gen_random_uuid(),
  texto        text not null check (btrim(texto) <> ''),
  local_id     uuid references public.locais(id) on delete set null,
  fixada       boolean not null default false,
  arquivada_em timestamptz,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  registrado_por uuid references auth.users(id) on delete set null default auth.uid()
);

create index anotacoes_ativas_idx on public.anotacoes (criado_em desc)
  where arquivada_em is null;

create trigger anotacoes_set_atualizado_em
  before update on public.anotacoes
  for each row execute function public.set_atualizado_em();

comment on table public.anotacoes is
  'Rascunho livre do operador. Sem estrutura de propósito: o que ainda não virou tarefa nem chamado.';

-- ---------- Distribuição de mobiliário por sala ----------
-- Complementa a rosca de classes na tela inicial: a rosca diz quantas
-- existem e em que estado, esta view diz onde estão. Sala com 12
-- cadeiras e sala com 45 são realidades diferentes que o total esconde.
create or replace view public.vw_mobiliario_por_sala
with (security_invoker = true) as
with ultima as (
  select distinct on (v.local_id, v.item_id)
    v.local_id, v.item_id, v.quantidade, v.data
  from public.verificacoes v
  where v.quantidade is not null
  order by v.local_id, v.item_id, v.data desc
)
select
  l.id as local_id,
  l.codigo,
  l.bloco,
  l.ordem_visita,
  coalesce(max(u.quantidade) filter (where i.nome = 'Mesas'), 0)::integer    as mesas,
  coalesce(max(u.quantidade) filter (where i.nome = 'Cadeiras'), 0)::integer as cadeiras,
  max(u.data) as contado_em,
  -- Classes desenhadas na planta, para comparar o registrado com o
  -- contado: divergência entre os dois é sinal de planta desatualizada.
  coalesce((
    select count(*)
      from public.plantas p
      cross join lateral jsonb_array_elements(p.elementos) as e(valor)
     where p.local_id = l.id and e.valor->>'tipo' = 'classe'
  ), 0)::integer as classes_na_planta
from public.locais l
left join ultima u                on u.local_id = l.id
left join public.itens_checklist i on i.id = u.item_id
where l.ativo and l.tipo = 'sala'
group by l.id;

comment on view public.vw_mobiliario_por_sala is
  'Última contagem de mesas e cadeiras por sala, ao lado do que a planta registra.';

-- ---------- Privilégios ----------
alter table public.anotacoes enable row level security;
revoke all on public.anotacoes from anon;
create policy operador_acesso_total_anotacoes
  on public.anotacoes for all to authenticated
  using (true) with check (true);

revoke all on public.vw_mobiliario_por_sala from anon;
grant select on public.vw_mobiliario_por_sala to authenticated;
