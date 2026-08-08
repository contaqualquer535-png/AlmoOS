-- =============================================================
-- 0002 — Locais, turmas e alocação temporal
-- =============================================================

-- btree_gist vive no schema "extensions" (convenção Supabase); sem isto,
-- a resolução do operador "=" para uuid dentro do EXCLUDE falha
-- dependendo do search_path com que a migration é aplicada.
set search_path = public, extensions;

-- Tabela única de ambientes físicos. Substitui a "salas" do rascunho:
-- almoxarifado deixa de ser a string mágica 'almoxarifado' espalhada
-- pelo inventário e passa a ser uma linha como qualquer outra.
create table public.locais (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,          -- 'C-212', 'ALMOX', 'BANH-KI'
  nome          text,                          -- rótulo humano opcional
  bloco         text,                          -- 'Bloco C', 'K Inferior', ...
  tipo          public.tipo_local not null default 'sala',
  -- Define se o local entra na ronda padrão de 8 itens (seg/qua/sex).
  -- Banheiros, apoio e teatro têm roteiro próprio e ficam de fora.
  ronda_padrao  boolean not null default true,
  ordem_visita  smallint,                      -- ordena o plano do dia dentro do bloco
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.locais is
  'Todo ambiente físico sob responsabilidade do operador, incluindo almoxarifado.';
comment on column public.locais.ronda_padrao is
  'true = recebe o checklist padrão de 8 itens na ronda de seg/qua/sex.';

create index locais_bloco_idx on public.locais (bloco) where ativo;
create index locais_tipo_idx  on public.locais (tipo)  where ativo;

create trigger locais_set_atualizado_em
  before update on public.locais
  for each row execute function public.set_atualizado_em();

-- ---------- Turmas ----------

create table public.turmas (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,   -- 'P1', 'D2', 'G3', 'Design'
  curso_turno   text,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger turmas_set_atualizado_em
  before update on public.turmas
  for each row execute function public.set_atualizado_em();

-- ---------- Alocação turma ↔ local, com vigência ----------

create table public.alocacoes (
  id          uuid primary key default gen_random_uuid(),
  turma_id    uuid not null references public.turmas(id) on delete cascade,
  local_id    uuid not null references public.locais(id) on delete restrict,
  data_inicio date not null,
  data_fim    date,                      -- null = vigente
  criado_em   timestamptz not null default now(),

  constraint alocacoes_periodo_valido
    check (data_fim is null or data_fim > data_inicio),

  -- Uma turma não pode estar em dois locais no mesmo período.
  -- Note que NÃO há restrição equivalente por local_id: uma mesma sala
  -- recebe turmas diferentes em turnos diferentes, e isso é legítimo.
  constraint alocacoes_turma_sem_sobreposicao
    exclude using gist (
      turma_id with =,
      daterange(data_inicio, data_fim, '[)') with &&
    )
);

create index alocacoes_vigentes_idx on public.alocacoes (local_id)
  where data_fim is null;
create index alocacoes_turma_idx on public.alocacoes (turma_id, data_inicio desc);

comment on table public.alocacoes is
  'Vínculo temporal turma↔local. data_fim null significa alocação vigente.';
