-- =============================================================
-- 0001 â€” ExtensÃµes, tipos enumerados e funÃ§Ãµes utilitÃ¡rias
-- Sistema de GestÃ£o CETEC / UCS
-- =============================================================
-- ConvenÃ§Ãµes adotadas em todo o schema:
--   * chaves primÃ¡rias uuid, geradas por gen_random_uuid()
--   * toda coluna de tempo Ã© timestamptz (UTC); datas de calendÃ¡rio
--     operacional (ronda, pendÃªncia) sÃ£o date
--   * colunas de auditoria: criado_em / atualizado_em / registrado_por
--   * enums nativos para conjuntos fechados do domÃ­nio;
--     tabelas de apoio para conjuntos que o operador pode ampliar
--     em tempo de execuÃ§Ã£o (ex.: itens_checklist, suprimentos)
-- Para acrescentar um valor a um enum posteriormente:
--   ALTER TYPE public.<tipo> ADD VALUE 'novo';
--   (permitido dentro de transaÃ§Ã£o a partir do PG12, mas o novo
--    valor nÃ£o pode ser usado na mesma transaÃ§Ã£o â€” logo, sempre
--    em migration prÃ³pria e isolada)
-- =============================================================

create extension if not exists pgcrypto with schema extensions;
-- btree_gist Ã© requisito da constraint de nÃ£o-sobreposiÃ§Ã£o em alocacoes
create extension if not exists btree_gist with schema extensions;

-- ---------- Tipos de domÃ­nio ----------

-- Tipo de ambiente fÃ­sico. 'almoxarifado' e 'externo' existem aqui para
-- que inventÃ¡rio e movimentaÃ§Ã£o tenham origem/destino homogÃªneos
-- (ver docs/ADR.md, decisÃ£o 04).
create type public.tipo_local as enum (
  'sala',          -- sala de aula regular, entra na ronda padrÃ£o
  'banheiro',      -- checklist prÃ³prio
  'apoio',         -- sala dos professores, copa, etc.
  'teatro',        -- B-117 (Teatrinho)
  'almoxarifado',
  'externo'        -- fora do CETEC: manutenÃ§Ã£o, emprÃ©stimo a terceiros
);

-- CÃ³digos da planilha em uso, preservados: âœ“ / M / X / T
create type public.status_verificacao as enum (
  'ok',           -- âœ“
  'manutencao',   -- M
  'resolvido',    -- X
  'trocado'       -- T
);

-- Como uma pendÃªncia foi encerrada (espelha X / T)
create type public.tipo_resolucao as enum ('resolvido', 'trocado');

create type public.status_classe as enum ('ok', 'quebrada', 'faltando');

create type public.categoria_suprimento as enum ('copa', 'manutencao', 'limpeza');

create type public.tipo_movimento_suprimento as enum ('consumo', 'reposicao', 'ajuste');

create type public.tipo_movimentacao_inventario as enum (
  'emprestimo', 'devolucao', 'transferencia'
);

create type public.status_tarefa as enum ('pendente', 'em_andamento', 'concluida', 'cancelada');

create type public.prioridade_chamado as enum ('baixa', 'media', 'alta');

-- Chamado Ã© o que sai do CETEC (SEAMB / manutenÃ§Ã£o predial).
-- O ciclo de vida acompanha o trÃ¢mite externo (ver ADR, decisÃ£o 03).
create type public.status_chamado as enum (
  'rascunho',       -- redigido, ainda nÃ£o enviado
  'enviado',
  'em_atendimento',
  'concluido',
  'cancelado'
);

create type public.tipo_relatorio as enum ('diario', 'semanal', 'mensal');

-- ---------- FunÃ§Ãµes utilitÃ¡rias ----------

-- search_path fixo e vazio: exigÃªncia do linter do Supabase e proteÃ§Ã£o
-- contra sequestro de resoluÃ§Ã£o de nome. Todo objeto Ã© qualificado.
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

comment on function public.set_atualizado_em() is
  'Trigger BEFORE UPDATE genÃ©rica: mantÃ©m a coluna atualizado_em.';
-- =============================================================
-- 0002 â€” Locais, turmas e alocaÃ§Ã£o temporal
-- =============================================================

-- btree_gist vive no schema "extensions" (convenÃ§Ã£o Supabase); sem isto,
-- a resoluÃ§Ã£o do operador "=" para uuid dentro do EXCLUDE falha
-- dependendo do search_path com que a migration Ã© aplicada.
set search_path = public, extensions;

-- Tabela Ãºnica de ambientes fÃ­sicos. Substitui a "salas" do rascunho:
-- almoxarifado deixa de ser a string mÃ¡gica 'almoxarifado' espalhada
-- pelo inventÃ¡rio e passa a ser uma linha como qualquer outra.
create table public.locais (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,          -- 'C-212', 'ALMOX', 'BANH-KI'
  nome          text,                          -- rÃ³tulo humano opcional
  bloco         text,                          -- 'Bloco C', 'K Inferior', ...
  tipo          public.tipo_local not null default 'sala',
  -- Define se o local entra na ronda padrÃ£o de 8 itens (seg/qua/sex).
  -- Banheiros, apoio e teatro tÃªm roteiro prÃ³prio e ficam de fora.
  ronda_padrao  boolean not null default true,
  ordem_visita  smallint,                      -- ordena o plano do dia dentro do bloco
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.locais is
  'Todo ambiente fÃ­sico sob responsabilidade do operador, incluindo almoxarifado.';
comment on column public.locais.ronda_padrao is
  'true = recebe o checklist padrÃ£o de 8 itens na ronda de seg/qua/sex.';

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

-- ---------- AlocaÃ§Ã£o turma â†” local, com vigÃªncia ----------

create table public.alocacoes (
  id          uuid primary key default gen_random_uuid(),
  turma_id    uuid not null references public.turmas(id) on delete cascade,
  local_id    uuid not null references public.locais(id) on delete restrict,
  data_inicio date not null,
  data_fim    date,                      -- null = vigente
  criado_em   timestamptz not null default now(),

  constraint alocacoes_periodo_valido
    check (data_fim is null or data_fim > data_inicio),

  -- Uma turma nÃ£o pode estar em dois locais no mesmo perÃ­odo.
  -- Note que NÃƒO hÃ¡ restriÃ§Ã£o equivalente por local_id: uma mesma sala
  -- recebe turmas diferentes em turnos diferentes, e isso Ã© legÃ­timo.
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
  'VÃ­nculo temporal turmaâ†”local. data_fim null significa alocaÃ§Ã£o vigente.';
-- =============================================================
-- 0003 â€” Checklist da ronda, verificaÃ§Ãµes e pendÃªncias
-- =============================================================
-- SeparaÃ§Ã£o central do modelo (ADR, decisÃ£o 02):
--   verificacoes  = o que foi observado numa data (registro de campo)
--   pendencias    = o ciclo de vida do problema (aberta â†’ fechada)
-- A pendÃªncia Ã© derivada da verificaÃ§Ã£o por trigger; a aplicaÃ§Ã£o nunca
-- escreve em pendencias diretamente.
-- =============================================================

create table public.itens_checklist (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null unique,
  ordem  smallint not null default 0,   -- ordem de exibiÃ§Ã£o na ronda
  ativo  boolean not null default true
);

comment on table public.itens_checklist is
  'Itens da ronda padrÃ£o. Tabela (e nÃ£o enum) porque o operador pode incluir novos itens.';

-- ---------- VerificaÃ§Ãµes ----------

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

  -- IdempotÃªncia da sincronizaÃ§Ã£o offline: um registro por local+item+dia.
  -- CorreÃ§Ã£o no mesmo dia Ã© UPDATE (upsert), nÃ£o linha nova; o histÃ³rico
  -- entre dias Ã© o log. Ver ADR, decisÃ£o 02, nota sobre append-only.
  constraint verificacoes_unicas unique (local_id, item_id, data)
);

create index verificacoes_data_idx on public.verificacoes (data desc);
create index verificacoes_local_data_idx on public.verificacoes (local_id, data desc);
create index verificacoes_status_idx on public.verificacoes (status, data desc);

create trigger verificacoes_set_atualizado_em
  before update on public.verificacoes
  for each row execute function public.set_atualizado_em();

-- ---------- PendÃªncias ----------

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

-- No mÃ¡ximo uma pendÃªncia aberta por local+item. Ã‰ o que permite ao
-- trigger usar ON CONFLICT e ao relatÃ³rio contar sem deduplicar.
create unique index pendencias_uma_aberta_por_item
  on public.pendencias (local_id, item_id)
  where fechada_em is null;

create index pendencias_abertas_idx on public.pendencias (aberta_em)
  where fechada_em is null;

create trigger pendencias_set_atualizado_em
  before update on public.pendencias
  for each row execute function public.set_atualizado_em();

comment on table public.pendencias is
  'Ciclo de vida do problema detectado na ronda. Derivada de verificacoes por trigger â€” nÃ£o escrever diretamente.';

-- ---------- DerivaÃ§Ã£o verificaÃ§Ã£o â†’ pendÃªncia ----------

create or replace function public.aplicar_verificacao_na_pendencia()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- CorreÃ§Ã£o de lanÃ§amento: a verificaÃ§Ã£o deixou de ser 'manutencao'.
  -- Descarta a pendÃªncia que ela mesma abriu, se ainda estiver aberta.
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
    -- no ON CONFLICT a linha existente Ã© referenciada pelo nome da tabela,
    -- sem qualificaÃ§Ã£o de schema
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

  -- status 'ok' nÃ£o fecha pendÃªncia: o encerramento Ã© explÃ­cito (X ou T),
  -- preservando a convenÃ§Ã£o da planilha em uso.
  return new;
end;
$$;

create trigger verificacoes_derivam_pendencia
  after insert or update of status, observacao on public.verificacoes
  for each row execute function public.aplicar_verificacao_na_pendencia();

comment on function public.aplicar_verificacao_na_pendencia() is
  'MantÃ©m public.pendencias sincronizada com os lanÃ§amentos da ronda.';
-- =============================================================
-- 0004 â€” Planta do local (camada visual)
-- =============================================================
-- DecisÃ£o 01 do ADR: a planta Ã© documentaÃ§Ã£o visual, NÃƒO alimenta o
-- item "Mesas/Cadeiras" da ronda. NÃ£o hÃ¡ trigger ligando as duas
-- coisas, e Ã© intencional: a ronda continua sendo um toque por item.
-- =============================================================

create table public.plantas (
  local_id      uuid primary key references public.locais(id) on delete cascade,
  grid_cols     smallint not null check (grid_cols between 1 and 40),
  grid_rows     smallint not null check (grid_rows between 1 and 40),
  -- elementos: [{ "ref": "cl-01", "tipo": "classe", "x": 0, "y": 0 }, ...]
  -- tipo âˆˆ classe | quadro | porta | mesa_professor | projetor
  elementos     jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),

  constraint plantas_elementos_e_array check (jsonb_typeof(elementos) = 'array')
);

create trigger plantas_set_atualizado_em
  before update on public.plantas
  for each row execute function public.set_atualizado_em();

comment on column public.plantas.elementos is
  'Array JSON de elementos posicionados no grid. "ref" Ã© a chave usada por classes_status.';

-- Log de estado por elemento. Ã‰ append-only: o estado atual Ã© a linha
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
-- =============================================================
-- 0005 â€” Suprimentos (copa, manutenÃ§Ã£o, limpeza)
-- =============================================================
-- MudanÃ§as em relaÃ§Ã£o ao rascunho:
--   * consumo_medio_dia deixa de ser coluna e passa a ser calculado
--     (vw_suprimentos_status) â€” coluna materializada envelhece em
--     silÃªncio e Ã© a primeira coisa a divergir do histÃ³rico
--   * a tabela de movimentos cobre consumo E reposiÃ§Ã£o; sem reposiÃ§Ã£o
--     o saldo nunca fecha
-- =============================================================

create table public.suprimentos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null unique,
  categoria        public.categoria_suprimento not null default 'copa',
  unidade          text not null default 'un',          -- 'un', 'pacote', 'kg'
  quantidade_atual numeric(12,3) not null default 0,
  ponto_reposicao  numeric(12,3) not null default 0 check (ponto_reposicao >= 0),
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

comment on column public.suprimentos.quantidade_atual is
  'Saldo derivado dos movimentos. Pode ficar negativo: isso significa reposiÃ§Ã£o nÃ£o registrada, e Ã© sinal a exibir, nÃ£o erro a bloquear (a captura Ã© offline e nÃ£o pode falhar em campo).';

create trigger suprimentos_set_atualizado_em
  before update on public.suprimentos
  for each row execute function public.set_atualizado_em();

create table public.movimentos_suprimento (
  id             uuid primary key default gen_random_uuid(),
  suprimento_id  uuid not null references public.suprimentos(id) on delete restrict,
  tipo           public.tipo_movimento_suprimento not null,
  -- Assinada: consumo Ã© negativo, reposiÃ§Ã£o positiva. A UI recebe nÃºmero
  -- positivo do operador; a camada de dados aplica o sinal.
  quantidade     numeric(12,3) not null check (quantidade <> 0),
  observacao     text,
  data           timestamptz not null default now(),
  registrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now(),

  constraint movimentos_sinal_coerente check (
    (tipo = 'consumo'   and quantidade < 0) or
    (tipo = 'reposicao' and quantidade > 0) or
    (tipo = 'ajuste')
  )
);

create index movimentos_suprimento_item_data_idx
  on public.movimentos_suprimento (suprimento_id, data desc);
create index movimentos_suprimento_data_idx
  on public.movimentos_suprimento (data desc);

-- Saldo mantido no banco, nÃ£o na aplicaÃ§Ã£o: o app mÃ³vel sincroniza em
-- lote e nÃ£o tem como calcular saldo confiÃ¡vel offline.
create or replace function public.aplicar_movimento_no_saldo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.suprimentos
       set quantidade_atual = quantidade_atual + new.quantidade
     where id = new.suprimento_id;

  elsif tg_op = 'UPDATE' then
    if old.suprimento_id <> new.suprimento_id then
      update public.suprimentos
         set quantidade_atual = quantidade_atual - old.quantidade
       where id = old.suprimento_id;
      update public.suprimentos
         set quantidade_atual = quantidade_atual + new.quantidade
       where id = new.suprimento_id;
    else
      update public.suprimentos
         set quantidade_atual = quantidade_atual - old.quantidade + new.quantidade
       where id = new.suprimento_id;
    end if;

  elsif tg_op = 'DELETE' then
    update public.suprimentos
       set quantidade_atual = quantidade_atual - old.quantidade
     where id = old.suprimento_id;
    return old;
  end if;

  return new;
end;
$$;

create trigger movimentos_suprimento_aplicam_saldo
  after insert or update or delete on public.movimentos_suprimento
  for each row execute function public.aplicar_movimento_no_saldo();
-- =============================================================
-- 0006 â€” InventÃ¡rio / almoxarifado
-- =============================================================
-- local_padrao_id e local_atual_id sÃ£o FKs para public.locais â€” o
-- almoxarifado Ã© uma linha lÃ¡ (decisÃ£o 04). NÃ£o hÃ¡ mais string mÃ¡gica.
-- =============================================================

create table public.inventario (
  id                 uuid primary key default gen_random_uuid(),
  codigo_barras      text unique,             -- patrimÃ´nio UCS; null para itens sem etiqueta
  item               text not null,
  descricao          text,
  local_padrao_id    uuid not null references public.locais(id) on delete restrict,
  local_atual_id     uuid not null references public.locais(id) on delete restrict,
  responsavel        text,                    -- preenchido enquanto emprestado
  emprestado_em      timestamptz,
  previsao_devolucao date,
  -- Coluna gerada: "emprestado" nunca pode divergir de "tem responsÃ¡vel".
  emprestado         boolean generated always as (responsavel is not null) stored,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),

  constraint inventario_emprestimo_coerente check (
    (responsavel is null     and emprestado_em is null)
    or (responsavel is not null and emprestado_em is not null)
  )
);

create index inventario_local_atual_idx on public.inventario (local_atual_id) where ativo;
create index inventario_emprestados_idx on public.inventario (previsao_devolucao)
  where emprestado and ativo;

create trigger inventario_set_atualizado_em
  before update on public.inventario
  for each row execute function public.set_atualizado_em();

create table public.movimentacoes_inventario (
  id                 uuid primary key default gen_random_uuid(),
  inventario_id      uuid not null references public.inventario(id) on delete cascade,
  tipo               public.tipo_movimentacao_inventario not null,
  local_origem_id    uuid references public.locais(id) on delete set null,
  local_destino_id   uuid not null references public.locais(id) on delete restrict,
  responsavel        text,
  previsao_devolucao date,
  observacao         text,
  data               timestamptz not null default now(),
  registrado_por     uuid references auth.users(id) on delete set null default auth.uid(),

  constraint movimentacoes_emprestimo_tem_responsavel check (
    tipo <> 'emprestimo' or responsavel is not null
  )
);

create index movimentacoes_inventario_item_idx
  on public.movimentacoes_inventario (inventario_id, data desc);

-- Aplica a movimentaÃ§Ã£o ao estado do item. MantÃ©m a movimentaÃ§Ã£o como
-- log e o inventÃ¡rio como projeÃ§Ã£o â€” a aplicaÃ§Ã£o registra o evento e
-- nÃ£o precisa lembrar de atualizar duas tabelas.
create or replace function public.aplicar_movimentacao_no_inventario()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.local_origem_id is null then
    select local_atual_id into new.local_origem_id
      from public.inventario where id = new.inventario_id;
  end if;

  if new.tipo = 'emprestimo' then
    update public.inventario
       set local_atual_id     = new.local_destino_id,
           responsavel        = new.responsavel,
           emprestado_em      = new.data,
           previsao_devolucao = new.previsao_devolucao
     where id = new.inventario_id;

  elsif new.tipo = 'devolucao' then
    update public.inventario
       set local_atual_id     = new.local_destino_id,
           responsavel        = null,
           emprestado_em      = null,
           previsao_devolucao = null
     where id = new.inventario_id;

  elsif new.tipo = 'transferencia' then
    -- transferÃªncia muda o local sem mexer no estado de emprÃ©stimo
    update public.inventario
       set local_atual_id = new.local_destino_id
     where id = new.inventario_id;
  end if;

  return new;
end;
$$;

-- BEFORE, para poder preencher local_origem_id na prÃ³pria linha do log.
create trigger movimentacoes_aplicam_inventario
  before insert on public.movimentacoes_inventario
  for each row execute function public.aplicar_movimentacao_no_inventario();
-- =============================================================
-- 0007 â€” Tarefas (internas) e chamados (externos)
-- =============================================================
-- DecisÃ£o 03 do ADR: tarefa Ã© o que o operador executa; chamado Ã© o que
-- sai do CETEC (SEAMB / manutenÃ§Ã£o predial). SÃ£o entidades diferentes
-- porque tÃªm ciclos de vida diferentes: a tarefa acaba quando ele
-- termina; o chamado depende de um terceiro e precisa de protocolo,
-- data de envio e acompanhamento.
-- =============================================================

create table public.tarefas (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  local_id      uuid references public.locais(id) on delete set null,  -- tarefa pode ser avulsa
  pendencia_id  uuid references public.pendencias(id) on delete set null,
  status        public.status_tarefa not null default 'pendente',
  observacao    text,                       -- o "onde parei"
  prazo         date,
  concluida_em  timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint tarefas_conclusao_coerente check (
    (status = 'concluida' and concluida_em is not null)
    or (status <> 'concluida' and concluida_em is null)
  )
);

create index tarefas_abertas_idx on public.tarefas (status, prazo nulls last)
  where status in ('pendente', 'em_andamento');

create trigger tarefas_set_atualizado_em
  before update on public.tarefas
  for each row execute function public.set_atualizado_em();

create table public.chamados (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null,
  descricao          text,
  local_id           uuid references public.locais(id) on delete set null,
  -- Origem opcional: quando o chamado nasce de um item marcado como M
  -- na ronda, a pendÃªncia fica rastreÃ¡vel de ponta a ponta.
  pendencia_id       uuid references public.pendencias(id) on delete set null,
  destino            text not null default 'SEAMB',
  protocolo_externo  text,                  -- nÃºmero devolvido pelo setor
  prioridade         public.prioridade_chamado not null default 'media',
  status             public.status_chamado not null default 'rascunho',
  aberto_em          timestamptz not null default now(),
  enviado_em         timestamptz,
  fechado_em         timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),

  constraint chamados_envio_coerente check (
    status = 'rascunho' or enviado_em is not null
  ),
  constraint chamados_fechamento_coerente check (
    (status in ('concluido', 'cancelado') and fechado_em is not null)
    or (status not in ('concluido', 'cancelado') and fechado_em is null)
  )
);

create index chamados_abertos_idx on public.chamados (prioridade, aberto_em)
  where status not in ('concluido', 'cancelado');
create index chamados_pendencia_idx on public.chamados (pendencia_id);

create trigger chamados_set_atualizado_em
  before update on public.chamados
  for each row execute function public.set_atualizado_em();
-- =============================================================
-- 0008 â€” RelatÃ³rios persistidos e insights de IA
-- =============================================================

create table public.relatorios (
  id             uuid primary key default gen_random_uuid(),
  tipo           public.tipo_relatorio not null,
  periodo_inicio date not null,
  periodo_fim    date not null,
  conteudo       jsonb not null,   -- agregaÃ§Ã£o congelada no momento da geraÃ§Ã£o
  gerado_em      timestamptz not null default now(),

  constraint relatorios_periodo_valido check (periodo_fim >= periodo_inicio)
);

-- Um relatÃ³rio por tipo e perÃ­odo: regerar substitui, nÃ£o acumula.
create unique index relatorios_periodo_unico
  on public.relatorios (tipo, periodo_inicio, periodo_fim);

comment on column public.relatorios.conteudo is
  'Snapshot dos dados agregados. Persistido de propÃ³sito: o relatÃ³rio da semana passada nÃ£o deve mudar quando um dado antigo Ã© corrigido.';

create table public.insights_ia (
  id           uuid primary key default gen_random_uuid(),
  gerado_em    timestamptz not null default now(),
  resumo       jsonb not null,      -- { pontos_atencao: [...], padroes_identificados: [...] }
  modelo       text not null,
  tokens_saida integer,             -- acompanhamento de custo
  erro         text,                -- preenchido quando a chamada falha; o job nÃ£o some em silÃªncio

  constraint insights_resumo_e_objeto check (jsonb_typeof(resumo) = 'object')
);

create index insights_ia_recentes_idx on public.insights_ia (gerado_em desc);
-- =============================================================
-- 0009 â€” Views de leitura e montagem do plano do dia
-- =============================================================
-- Todas as views usam security_invoker: sem isso, uma view no schema
-- public roda com os privilÃ©gios do dono e contorna o RLS das tabelas
-- de base. Ã‰ o erro clÃ¡ssico de RLS no Supabase.
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

-- ---------- PendÃªncias abertas, com idade ----------
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

-- ---------- Estoque: consumo mÃ©dio e previsÃ£o de esgotamento ----------
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
-- FunÃ§Ã£o e nÃ£o view: recebe a data como parÃ¢metro, o que permite
-- regerar o plano de um dia passado para conferÃªncia.
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
  'Monta o plano do dia em JSON. Fonte Ãºnica para a tela do dashboard e para o PDF imprimÃ­vel.';
-- =============================================================
-- 0010 â€” Row Level Security e privilÃ©gios
-- =============================================================
-- DecisÃ£o 05 do ADR: operador Ãºnico. A polÃ­tica Ã© "qualquer usuÃ¡rio
-- autenticado tem acesso total"; o anÃ´nimo nÃ£o tem nenhum.
--
-- Caminho de upgrade para mÃºltiplos operadores, se um dia for preciso:
-- criar public.operadores (user_id, papel) e trocar o USING de cada
-- polÃ­tica por um EXISTS nessa tabela. As policies estÃ£o nomeadas e
-- isoladas nesta migration justamente para que essa troca seja um
-- arquivo sÃ³. Nenhuma coluna precisa mudar â€” registrado_por jÃ¡ grava
-- auth.uid() desde o primeiro dia.
-- =============================================================

do $$
declare
  t text;
  tabelas text[] := array[
    'locais', 'turmas', 'alocacoes',
    'itens_checklist', 'verificacoes', 'pendencias',
    'plantas', 'classes_status',
    'suprimentos', 'movimentos_suprimento',
    'inventario', 'movimentacoes_inventario',
    'tarefas', 'chamados',
    'relatorios', 'insights_ia'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'operador_acesso_total_' || t, t
    );
  end loop;
end;
$$;

-- Views herdam o RLS das tabelas de base por causa do security_invoker,
-- mas o privilÃ©gio de SELECT ainda precisa ser retirado do anÃ´nimo.
do $$
declare
  v text;
  views text[] := array[
    'vw_locais_com_turmas', 'vw_pendencias_abertas', 'vw_suprimentos_status',
    'vw_classes_status_atual', 'vw_ronda_do_dia'
  ];
begin
  foreach v in array views loop
    execute format('revoke all on public.%I from anon', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end;
$$;

revoke all on function public.montar_plano_do_dia(date) from public, anon;
grant execute on function public.montar_plano_do_dia(date) to authenticated;
-- =============================================================
-- 0011 â€” Resumo da planta por local
-- =============================================================
-- Alimenta o Ã­ndice de /planta: uma linha por sala com planta,
-- contando classes e quantas estÃ£o fora de ordem hoje.
--
-- O join com os elementos Ã© LEFT LATERAL de propÃ³sito: uma planta
-- recÃ©m-criada tem elementos = '[]' e precisa continuar aparecendo na
-- lista, senÃ£o a sala some justamente quando falta desenhÃ¡-la.
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
  'Uma linha por local com planta: dimensÃµes do grid e contagem de classes quebradas/faltando segundo vw_classes_status_atual.';

revoke all on public.vw_plantas_resumo from anon;
grant select on public.vw_plantas_resumo to authenticated;
-- =============================================================
-- 0012 â€” Resumo da planta passa a listar todo ambiente
-- =============================================================
-- A 0011 fazia join com plantas, entÃ£o sÃ³ aparecia ambiente jÃ¡
-- desenhado. Como o seed sÃ³ desenha tipo = 'sala', banheiro,
-- almoxarifado e sala dos professores ficavam invisÃ­veis â€” e sem
-- aparecer na lista nÃ£o hÃ¡ por onde criar a planta deles.
--
-- Agora Ã© left join: todo ambiente ativo aparece, e `tem_planta` diz
-- quem jÃ¡ foi desenhado. EXTERNO fica de fora porque nÃ£o Ã© um espaÃ§o
-- fÃ­sico, Ã© o destino de quem saiu do CETEC.
--
-- Ã‰ create or replace: as colunas antigas mantÃªm nome, tipo e ordem, e
-- tem_planta entra no fim â€” as duas condiÃ§Ãµes que o Postgres exige.
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
  'Um ambiente fÃ­sico ativo por linha. tem_planta distingue o que jÃ¡ foi desenhado do que ainda nÃ£o.';
-- =============================================================
-- 0013 â€” AgregaÃ§Ã£o de perÃ­odo e sÃ©ries para grÃ¡fico
-- =============================================================
-- SeÃ§Ã£o 9 da especificaÃ§Ã£o: relatÃ³rio semanal e mensal. A agregaÃ§Ã£o
-- mora no banco, e nÃ£o na aplicaÃ§Ã£o, por trÃªs motivos:
--
--   1. A Edge Function de insights (etapa 6) precisa dos mesmos nÃºmeros
--      e nÃ£o vai reimplementÃ¡-los em TypeScript.
--   2. `relatorios.conteudo` guarda o snapshot congelado; quem congela
--      precisa ser a mesma expressÃ£o que a tela lÃª ao vivo, senÃ£o os
--      dois divergem em silÃªncio.
--   3. Contar linha em SQL Ã© barato; trazer as linhas para contar em JS
--      nÃ£o Ã©.
--
-- Todas recebem o perÃ­odo por parÃ¢metro, como montar_plano_do_dia: dÃ¡
-- para reconstruir o relatÃ³rio de qualquer semana passada.
-- =============================================================

-- ---------- RelatÃ³rio de um perÃ­odo ----------
create or replace function public.montar_relatorio(
  p_inicio date,
  p_fim    date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with dias_de_ronda as (
    -- Seg/qua/sex dentro do perÃ­odo. Ã‰ o denominador da cobertura:
    -- comparar contra todos os dias puniria o sistema pelo fim de semana.
    select d::date as dia
      from generate_series(p_inicio, p_fim, interval '1 day') as d
     where extract(isodow from d) in (1, 3, 5)
  ),
  esperado as (
    select
      (select count(*) from dias_de_ronda)
      * (select count(*) from public.locais where ativo and ronda_padrao)
      * (select count(*) from public.itens_checklist where ativo) as total
  ),
  feito as (
    select count(*) as total
      from public.verificacoes v
     where v.data between p_inicio and p_fim
  )
  select jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim',    p_fim,
    'dias_de_ronda',  (select count(*) from dias_de_ronda),

    'ronda', jsonb_build_object(
      'esperado', (select total from esperado),
      'feito',    (select total from feito),
      'cobertura', case
        when (select total from esperado) = 0 then null
        else round(
          (select total from feito)::numeric / (select total from esperado) * 100, 1)
      end
    ),

    -- DistribuiÃ§Ã£o dos quatro cÃ³digos da planilha no perÃ­odo.
    'verificacoes_por_status', coalesce((
      select jsonb_object_agg(status, n)
        from (
          select v.status::text as status, count(*) as n
            from public.verificacoes v
           where v.data between p_inicio and p_fim
           group by v.status
        ) s
    ), '{}'::jsonb),

    'pendencias', jsonb_build_object(
      'abertas_no_periodo', (
        select count(*) from public.pendencias
         where aberta_em between p_inicio and p_fim),
      'fechadas_no_periodo', (
        select count(*) from public.pendencias
         where fechada_em between p_inicio and p_fim),
      'resolvidas', (
        select count(*) from public.pendencias
         where fechada_em between p_inicio and p_fim
           and tipo_resolucao = 'resolvido'),
      'trocadas', (
        select count(*) from public.pendencias
         where fechada_em between p_inicio and p_fim
           and tipo_resolucao = 'trocado'),
      -- Fotografia no fim do perÃ­odo, nÃ£o no dia de hoje: o relatÃ³rio da
      -- semana passada nÃ£o pode mudar quando algo Ã© resolvido agora.
      'em_aberto_no_fim', (
        select count(*) from public.pendencias
         where aberta_em <= p_fim
           and (fechada_em is null or fechada_em > p_fim))
    ),

    -- Onde o problema se concentra. Ordenado pelo maior, que Ã© a leitura
    -- que interessa: qual bloco estÃ¡ consumindo o mÃªs.
    'por_bloco', coalesce((
      select jsonb_agg(x order by x.aberturas desc, x.bloco)
        from (
          select coalesce(l.bloco, 'Sem bloco') as bloco, count(*) as aberturas
            from public.pendencias p
            join public.locais l on l.id = p.local_id
           where p.aberta_em between p_inicio and p_fim
           group by 1
        ) x
    ), '[]'::jsonb),

    'por_item', coalesce((
      select jsonb_agg(x order by x.aberturas desc, x.item)
        from (
          select i.nome as item, count(*) as aberturas
            from public.pendencias p
            join public.itens_checklist i on i.id = p.item_id
           where p.aberta_em between p_inicio and p_fim
           group by 1
        ) x
    ), '[]'::jsonb),

    'suprimentos', coalesce((
      select jsonb_agg(x order by x.consumido desc, x.nome)
        from (
          select s.nome, s.unidade, sum(-m.quantidade) as consumido
            from public.movimentos_suprimento m
            join public.suprimentos s on s.id = m.suprimento_id
           where m.tipo = 'consumo'
             and m.data::date between p_inicio and p_fim
           group by s.nome, s.unidade
        ) x
    ), '[]'::jsonb),

    'chamados', jsonb_build_object(
      'abertos', (
        select count(*) from public.chamados
         where aberto_em::date between p_inicio and p_fim),
      'fechados', (
        select count(*) from public.chamados
         where fechado_em::date between p_inicio and p_fim),
      'em_aberto_no_fim', (
        select count(*) from public.chamados
         where aberto_em::date <= p_fim
           and (fechado_em is null or fechado_em::date > p_fim))
    ),

    'tarefas', jsonb_build_object(
      'criadas', (
        select count(*) from public.tarefas
         where criado_em::date between p_inicio and p_fim),
      'concluidas', (
        select count(*) from public.tarefas
         where concluida_em::date between p_inicio and p_fim)
    )
  );
$$;

comment on function public.montar_relatorio(date, date) is
  'Agrega um perÃ­odo em JSON. Fonte Ãºnica do relatÃ³rio persistido, da tela e da Edge Function de insights.';

-- ---------- Persistir o relatÃ³rio ----------
-- Congela o snapshot. O Ã­ndice Ãºnico (tipo, inÃ­cio, fim) faz o upsert
-- substituir: regerar corrige, nÃ£o acumula.
create or replace function public.gerar_relatorio(
  p_tipo   public.tipo_relatorio,
  p_inicio date,
  p_fim    date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.relatorios (tipo, periodo_inicio, periodo_fim, conteudo)
  values (p_tipo, p_inicio, p_fim, public.montar_relatorio(p_inicio, p_fim))
  on conflict (tipo, periodo_inicio, periodo_fim) do update
    set conteudo  = excluded.conteudo,
        gerado_em = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- SÃ©ries para os grÃ¡ficos da tela inicial ----------
-- Um dia por linha, incluindo os dias sem nenhum registro: uma sÃ©rie com
-- buracos vira um grÃ¡fico que mente sobre o que aconteceu.
create or replace function public.serie_ronda_por_dia(p_dias integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with calendario as (
    select d::date as dia
      from generate_series(
             current_date - (p_dias - 1),
             current_date,
             interval '1 day') as d
  ),
  esperado_por_dia as (
    select (select count(*) from public.locais where ativo and ronda_padrao)
         * (select count(*) from public.itens_checklist where ativo) as total
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'dia', c.dia,
             'dia_de_ronda', extract(isodow from c.dia) in (1, 3, 5),
             'feito', coalesce(v.n, 0),
             'esperado', case
               when extract(isodow from c.dia) in (1, 3, 5)
                 then (select total from esperado_por_dia)
               else 0
             end)
           order by c.dia), '[]'::jsonb)
    from calendario c
    left join (
      select data, count(*) as n
        from public.verificacoes
       group by data
    ) v on v.data = c.dia;
$$;

create or replace function public.serie_pendencias_por_bloco()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.abertas desc, x.bloco), '[]'::jsonb)
    from (
      select coalesce(l.bloco, 'Sem bloco') as bloco,
             count(*) as abertas,
             max(current_date - p.aberta_em) as dias_da_mais_antiga
        from public.pendencias p
        join public.locais l on l.id = p.local_id
       where p.fechada_em is null
       group by 1
    ) x;
$$;

-- ---------- PrivilÃ©gios ----------
do $$
declare
  f text;
  funcoes text[] := array[
    'public.montar_relatorio(date, date)',
    'public.gerar_relatorio(public.tipo_relatorio, date, date)',
    'public.serie_ronda_por_dia(integer)',
    'public.serie_pendencias_por_bloco()'
  ];
begin
  foreach f in array funcoes loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
-- =============================================================
-- 0014 â€” Contexto para os insights
-- =============================================================
-- SeÃ§Ã£o 7.1 da especificaÃ§Ã£o pede pontos de atenÃ§Ã£o priorizados. A
-- maior parte deles nÃ£o precisa de modelo nenhum: "chamado aberto hÃ¡ 18
-- dias" Ã© uma subtraÃ§Ã£o, nÃ£o uma inferÃªncia.
--
-- EntÃ£o esta funÃ§Ã£o devolve duas coisas separadas:
--
--   pontos_atencao â€” calculados aqui, determinÃ­sticos, sempre presentes.
--                    Aparecem na tela mesmo se a chamada ao modelo
--                    falhar ou nem existir.
--   dados          â€” material bruto agregado, para o modelo procurar
--                    padrÃ£o em cima. SÃ³ isso sai do banco na chamada
--                    externa.
--
-- Nada de identificÃ¡vel sai daqui: cÃ³digo de sala, nome de item e
-- contagem. Nome de responsÃ¡vel de emprÃ©stimo fica de fora de propÃ³sito.
-- =============================================================

create or replace function public.montar_contexto_para_insights()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with pontos as (
    -- Chamado encalhado no terceiro
    select
      'chamado_parado' as tipo,
      c.id             as referencia_id,
      format('Chamado "%s" para %s estÃ¡ aberto hÃ¡ %s dias',
             c.titulo, c.destino, current_date - c.aberto_em::date) as mensagem,
      case when current_date - c.aberto_em::date >= 30 then 'alta' else 'media' end as prioridade,
      current_date - c.aberto_em::date as peso
    from public.chamados c
    where c.status not in ('concluido', 'cancelado')
      and current_date - c.aberto_em::date >= 14

    union all

    -- Item marcado M que ninguÃ©m encerrou
    select
      'pendencia_antiga',
      p.id,
      format('%s em %s estÃ¡ pendente hÃ¡ %s dias',
             i.nome, l.codigo, current_date - p.aberta_em),
      case when current_date - p.aberta_em >= 30 then 'alta' else 'media' end,
      current_date - p.aberta_em
    from public.pendencias p
    join public.locais l          on l.id = p.local_id
    join public.itens_checklist i on i.id = p.item_id
    where p.fechada_em is null
      and current_date - p.aberta_em >= 14

    union all

    -- Estoque abaixo do ponto, ou com esgotamento previsto na semana
    select
      'suprimento_critico',
      s.id,
      case
        when s.abaixo_do_ponto then
          format('%s estÃ¡ em %s %s, abaixo do ponto de reposiÃ§Ã£o (%s)',
                 s.nome, s.quantidade_atual, s.unidade, s.ponto_reposicao)
        else
          format('%s deve acabar em %s dias, por volta de %s',
                 s.nome, s.dias_restantes, to_char(s.previsao_esgotamento, 'DD/MM'))
      end,
      case when s.abaixo_do_ponto then 'alta' else 'media' end,
      coalesce(30 - s.dias_restantes, 40)
    from public.vw_suprimentos_status s
    where s.abaixo_do_ponto
       or (s.dias_restantes is not null and s.dias_restantes <= 7)

    union all

    -- EmprÃ©stimo vencido
    select
      'devolucao_atrasada',
      inv.id,
      format('%s estÃ¡ com %s desde %s, devoluÃ§Ã£o prevista para %s',
             inv.item, inv.responsavel,
             to_char(inv.emprestado_em, 'DD/MM'),
             to_char(inv.previsao_devolucao, 'DD/MM')),
      'media',
      current_date - inv.previsao_devolucao
    from public.inventario inv
    where inv.ativo
      and inv.emprestado
      and inv.previsao_devolucao < current_date

    union all

    -- Tarefa com prazo estourado
    select
      'tarefa_atrasada',
      t.id,
      format('Tarefa "%s" venceu em %s', t.titulo, to_char(t.prazo, 'DD/MM')),
      'media',
      current_date - t.prazo
    from public.tarefas t
    where t.status in ('pendente', 'em_andamento')
      and t.prazo is not null
      and t.prazo < current_date

    union all

    -- Ronda do dia ainda nÃ£o fechada, e sÃ³ em dia de ronda
    select
      'ronda_incompleta',
      null::uuid,
      format('%s salas ainda sem lanÃ§amento na ronda de hoje', count(*)),
      'alta',
      100
    from public.locais l
    where extract(isodow from current_date) in (1, 3, 5)
      and l.ativo and l.ronda_padrao
      and not exists (
        select 1 from public.verificacoes v
         where v.local_id = l.id and v.data = current_date
      )
    having count(*) > 0
  )
  select jsonb_build_object(
    'gerado_para', current_date,
    'pontos_atencao', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'tipo', tipo,
                 'referencia_id', referencia_id,
                 'mensagem', mensagem,
                 'prioridade', prioridade)
               order by
                 case prioridade when 'alta' then 0 when 'media' then 1 else 2 end,
                 peso desc)
        from pontos
    ), '[]'::jsonb),

    -- Material para o modelo procurar padrÃ£o. Duas semanas e o mÃªs
    -- corrente: menos que isso nÃ£o dÃ¡ tendÃªncia, mais que isso vira
    -- prompt caro sem ganho.
    'dados', jsonb_build_object(
      'semana_atual', public.montar_relatorio(
        date_trunc('week', current_date)::date, current_date),
      'semana_anterior', public.montar_relatorio(
        (date_trunc('week', current_date) - interval '7 days')::date,
        (date_trunc('week', current_date) - interval '1 day')::date),
      'mes_corrente', public.montar_relatorio(
        date_trunc('month', current_date)::date, current_date),
      'chamados_recentes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'titulo', c.titulo,
                 'local', l.codigo,
                 'bloco', l.bloco,
                 'prioridade', c.prioridade,
                 'status', c.status,
                 'aberto_em', c.aberto_em::date)
               order by c.aberto_em desc)
          from public.chamados c
          left join public.locais l on l.id = c.local_id
         where c.aberto_em >= now() - interval '90 days'
      ), '[]'::jsonb)
    )
  );
$$;

comment on function public.montar_contexto_para_insights() is
  'Pontos de atenÃ§Ã£o determinÃ­sticos + agregados brutos. Os pontos nÃ£o dependem de modelo nenhum; os dados sÃ£o o que a Edge Function envia para a IA procurar padrÃ£o.';

revoke all on function public.montar_contexto_para_insights() from public, anon;
grant execute on function public.montar_contexto_para_insights() to authenticated;
grant execute on function public.montar_contexto_para_insights() to service_role;
-- =============================================================
-- 0015 â€” Mensagens do SERVi por chamado
-- =============================================================
-- O SERVi (OTRS da UCS) notifica tudo por e-mail, e o assunto sempre
-- carrega [Chamado#001538977]. Esse nÃºmero Ã© a chave: com ele, cada
-- mensagem encontra o chamado correspondente aqui dentro.
--
-- Resolve duas coisas que a lista do SERVi nÃ£o resolve:
--   * o histÃ³rico da conversa deixa de morrer na caixa de e-mail
--   * chamado que existe lÃ¡ e nÃ£o aqui passa a existir aqui sozinho,
--     e com isso entra nos pontos de atenÃ§Ã£o
-- =============================================================

create type public.direcao_mensagem as enum ('recebida', 'enviada');

create table public.mensagens_chamado (
  id          uuid primary key default gen_random_uuid(),
  chamado_id  uuid not null references public.chamados(id) on delete cascade,
  direcao     public.direcao_mensagem not null default 'recebida',
  assunto     text,
  remetente   text,
  corpo       text,
  recebido_em timestamptz not null default now(),
  -- Message-ID do e-mail. Ãšnico quando presente: o encaminhamento pode
  -- repetir, e reprocessar a mesma mensagem nÃ£o pode duplicar a linha.
  id_externo  text unique,
  criado_em   timestamptz not null default now()
);

create index mensagens_chamado_idx
  on public.mensagens_chamado (chamado_id, recebido_em desc);

comment on table public.mensagens_chamado is
  'HistÃ³rico de e-mail por chamado, casado pelo nÃºmero do SERVi no assunto.';

-- ---------- IngestÃ£o ----------

/**
 * Registra uma mensagem do SERVi, criando o chamado se ele ainda nÃ£o
 * existir aqui.
 *
 * Criar em vez de recusar Ã© deliberado: o operador abre chamado pela
 * tela do SERVi, nÃ£o por este sistema. Se a ingestÃ£o exigisse que o
 * chamado jÃ¡ existisse, ela sÃ³ funcionaria para os que ele lembrou de
 * cadastrar duas vezes â€” que sÃ£o justamente os que ele nÃ£o esquece.
 */
create or replace function public.registrar_mensagem_de_chamado(
  p_protocolo   text,
  p_assunto     text,
  p_remetente   text default null,
  p_corpo       text default null,
  p_recebido_em timestamptz default now(),
  p_id_externo  text default null,
  p_fila        text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chamado_id uuid;
  v_criou      boolean := false;
  v_titulo     text;
  v_fechou     boolean := false;
  v_mensagem   uuid;
begin
  if p_protocolo is null or btrim(p_protocolo) = '' then
    raise exception 'Mensagem sem nÃºmero de chamado no assunto.';
  end if;

  select id into v_chamado_id
    from public.chamados
   where protocolo_externo = btrim(p_protocolo);

  if v_chamado_id is null then
    -- TÃ­tulo vindo do assunto: tudo depois do Ãºltimo ": " costuma ser o
    -- assunto real do chamado no padrÃ£o do SERVi.
    v_titulo := nullif(btrim(regexp_replace(coalesce(p_assunto, ''),
                  '^.*?:\s*', '', 'g')), '');

    insert into public.chamados
      (titulo, destino, protocolo_externo, status, aberto_em, enviado_em)
    values (
      coalesce(v_titulo, 'Chamado ' || btrim(p_protocolo)),
      coalesce(nullif(btrim(coalesce(p_fila, '')), ''), 'SEAMB'),
      btrim(p_protocolo),
      'em_atendimento',
      p_recebido_em,
      p_recebido_em
    )
    returning id into v_chamado_id;

    v_criou := true;
  end if;

  -- Palavras que o SERVi usa quando encerra. Deliberadamente conservador:
  -- na dÃºvida o chamado continua aberto, porque fechar sozinho o que
  -- ainda tramita esconderia justamente o que estÃ¡ encalhado.
  v_fechou := coalesce(p_assunto, '') ~* '(fechamento|chamado fechado|encerrad)';

  if v_fechou then
    update public.chamados
       set status     = 'concluido',
           fechado_em = coalesce(fechado_em, p_recebido_em)
     where id = v_chamado_id
       and status not in ('concluido', 'cancelado');
  end if;

  -- Se a fila mudou de setor, o destino acompanha.
  if nullif(btrim(coalesce(p_fila, '')), '') is not null then
    update public.chamados set destino = btrim(p_fila) where id = v_chamado_id;
  end if;

  insert into public.mensagens_chamado
    (chamado_id, assunto, remetente, corpo, recebido_em, id_externo)
  values (v_chamado_id, p_assunto, p_remetente, p_corpo, p_recebido_em, p_id_externo)
  on conflict (id_externo) do nothing
  returning id into v_mensagem;

  return jsonb_build_object(
    'chamado_id',    v_chamado_id,
    'criou_chamado', v_criou,
    'fechou',        v_fechou,
    -- null quando a mensagem jÃ¡ existia: o chamador precisa distinguir
    -- "processei" de "jÃ¡ tinha processado antes".
    'mensagem_id',   v_mensagem
  );
end;
$$;

comment on function public.registrar_mensagem_de_chamado is
  'Casa uma mensagem do SERVi ao chamado pelo protocolo, criando-o se necessÃ¡rio. Idempotente pelo Message-ID.';

-- ---------- PrivilÃ©gios ----------
alter table public.mensagens_chamado enable row level security;
revoke all on public.mensagens_chamado from anon;
create policy operador_acesso_total_mensagens_chamado
  on public.mensagens_chamado for all to authenticated
  using (true) with check (true);

revoke all on function public.registrar_mensagem_de_chamado(
  text, text, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.registrar_mensagem_de_chamado(
  text, text, text, text, timestamptz, text, text) to authenticated;
grant execute on function public.registrar_mensagem_de_chamado(
  text, text, text, text, timestamptz, text, text) to service_role;
