-- =============================================================
-- 0007 — Tarefas (internas) e chamados (externos)
-- =============================================================
-- Decisão 03 do ADR: tarefa é o que o operador executa; chamado é o que
-- sai do CETEC (SEAMB / manutenção predial). São entidades diferentes
-- porque têm ciclos de vida diferentes: a tarefa acaba quando ele
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
  -- na ronda, a pendência fica rastreável de ponta a ponta.
  pendencia_id       uuid references public.pendencias(id) on delete set null,
  destino            text not null default 'SEAMB',
  protocolo_externo  text,                  -- número devolvido pelo setor
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
