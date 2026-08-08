-- =============================================================
-- 0004 — Planta do local (camada visual)
-- =============================================================
-- Decisão 01 do ADR: a planta é documentação visual, NÃO alimenta o
-- item "Mesas/Cadeiras" da ronda. Não há trigger ligando as duas
-- coisas, e é intencional: a ronda continua sendo um toque por item.
-- =============================================================

create table public.plantas (
  local_id      uuid primary key references public.locais(id) on delete cascade,
  grid_cols     smallint not null check (grid_cols between 1 and 40),
  grid_rows     smallint not null check (grid_rows between 1 and 40),
  -- elementos: [{ "ref": "cl-01", "tipo": "classe", "x": 0, "y": 0 }, ...]
  -- tipo ∈ classe | quadro | porta | mesa_professor | projetor
  elementos     jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),

  constraint plantas_elementos_e_array check (jsonb_typeof(elementos) = 'array')
);

create trigger plantas_set_atualizado_em
  before update on public.plantas
  for each row execute function public.set_atualizado_em();

comment on column public.plantas.elementos is
  'Array JSON de elementos posicionados no grid. "ref" é a chave usada por classes_status.';

-- Log de estado por elemento. É append-only: o estado atual é a linha
-- mais recente por (local, ref), exposta em vw_classes_status_atual.
create table public.classes_status (
  id             uuid primary key default gen_random_uuid(),
  local_id       uuid not null references public.locais(id) on delete cascade,
  classe_ref     text not null,               -- 'cl-01', casa com elementos[].ref
  status         public.status_classe not null default 'ok',
  observacao     text,
  registrado_em  timestamptz not null default now(),
  registrado_por uuid references auth.users(id) on delete set null default auth.uid()
);

create index classes_status_atual_idx
  on public.classes_status (local_id, classe_ref, registrado_em desc);
