-- =============================================================
-- 0003 — Checklist da ronda, verificações e pendências
-- =============================================================
-- Separação central do modelo (ADR, decisão 02):
--   verificacoes  = o que foi observado numa data (registro de campo)
--   pendencias    = o ciclo de vida do problema (aberta → fechada)
-- A pendência é derivada da verificação por trigger; a aplicação nunca
-- escreve em pendencias diretamente.
-- =============================================================

create table public.itens_checklist (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null unique,
  ordem  smallint not null default 0,   -- ordem de exibição na ronda
  ativo  boolean not null default true
);

comment on table public.itens_checklist is
  'Itens da ronda padrão. Tabela (e não enum) porque o operador pode incluir novos itens.';

-- ---------- Verificações ----------

create table public.verificacoes (
  id              uuid primary key default gen_random_uuid(),
  local_id        uuid not null references public.locais(id) on delete restrict,
  item_id         uuid not null references public.itens_checklist(id) on delete restrict,
  data            date not null,
  status          public.status_verificacao not null,
  observacao      text,
  registrado_por  uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  sincronizado_em timestamptz,   -- preenchido quando o registro offline chega ao servidor

  -- Idempotência da sincronização offline: um registro por local+item+dia.
  -- Correção no mesmo dia é UPDATE (upsert), não linha nova; o histórico
  -- entre dias é o log. Ver ADR, decisão 02, nota sobre append-only.
  constraint verificacoes_unicas unique (local_id, item_id, data)
);

create index verificacoes_data_idx on public.verificacoes (data desc);
create index verificacoes_local_data_idx on public.verificacoes (local_id, data desc);
create index verificacoes_status_idx on public.verificacoes (status, data desc);

create trigger verificacoes_set_atualizado_em
  before update on public.verificacoes
  for each row execute function public.set_atualizado_em();

-- ---------- Pendências ----------

create table public.pendencias (
  id                       uuid primary key default gen_random_uuid(),
  local_id                 uuid not null references public.locais(id) on delete restrict,
  item_id                  uuid not null references public.itens_checklist(id) on delete restrict,
  aberta_em                date not null,
  fechada_em               date,
  tipo_resolucao           public.tipo_resolucao,
  verificacao_abertura_id  uuid references public.verificacoes(id) on delete set null,
  verificacao_fechamento_id uuid references public.verificacoes(id) on delete set null,
  observacao               text,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),

  constraint pendencias_fechamento_coerente check (
    (fechada_em is null and tipo_resolucao is null)
    or (fechada_em is not null and tipo_resolucao is not null)
  ),
  constraint pendencias_datas_coerentes check (
    fechada_em is null or fechada_em >= aberta_em
  )
);

-- No máximo uma pendência aberta por local+item. É o que permite ao
-- trigger usar ON CONFLICT e ao relatório contar sem deduplicar.
create unique index pendencias_uma_aberta_por_item
  on public.pendencias (local_id, item_id)
  where fechada_em is null;

create index pendencias_abertas_idx on public.pendencias (aberta_em)
  where fechada_em is null;

create trigger pendencias_set_atualizado_em
  before update on public.pendencias
  for each row execute function public.set_atualizado_em();

comment on table public.pendencias is
  'Ciclo de vida do problema detectado na ronda. Derivada de verificacoes por trigger — não escrever diretamente.';

-- ---------- Derivação verificação → pendência ----------

create or replace function public.aplicar_verificacao_na_pendencia()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Correção de lançamento: a verificação deixou de ser 'manutencao'.
  -- Descarta a pendência que ela mesma abriu, se ainda estiver aberta.
  if tg_op = 'UPDATE'
     and old.status = 'manutencao'
     and new.status is distinct from 'manutencao' then
    delete from public.pendencias
     where verificacao_abertura_id = new.id
       and fechada_em is null;
  end if;

  if new.status = 'manutencao' then
    insert into public.pendencias (
      local_id, item_id, aberta_em, verificacao_abertura_id, observacao
    )
    values (
      new.local_id, new.item_id, new.data, new.id, new.observacao
    )
    on conflict (local_id, item_id) where fechada_em is null
    -- no ON CONFLICT a linha existente é referenciada pelo nome da tabela,
    -- sem qualificação de schema
    do update set observacao = coalesce(excluded.observacao, pendencias.observacao);

  elsif new.status in ('resolvido', 'trocado') then
    update public.pendencias
       set fechada_em                = new.data,
           tipo_resolucao            = new.status::text::public.tipo_resolucao,
           verificacao_fechamento_id = new.id
     where local_id = new.local_id
       and item_id  = new.item_id
       and fechada_em is null;
  end if;

  -- status 'ok' não fecha pendência: o encerramento é explícito (X ou T),
  -- preservando a convenção da planilha em uso.
  return new;
end;
$$;

create trigger verificacoes_derivam_pendencia
  after insert or update of status, observacao on public.verificacoes
  for each row execute function public.aplicar_verificacao_na_pendencia();

comment on function public.aplicar_verificacao_na_pendencia() is
  'Mantém public.pendencias sincronizada com os lançamentos da ronda.';
