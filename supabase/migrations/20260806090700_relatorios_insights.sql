-- =============================================================
-- 0008 — Relatórios persistidos e insights de IA
-- =============================================================

create table public.relatorios (
  id             uuid primary key default gen_random_uuid(),
  tipo           public.tipo_relatorio not null,
  periodo_inicio date not null,
  periodo_fim    date not null,
  conteudo       jsonb not null,   -- agregação congelada no momento da geração
  gerado_em      timestamptz not null default now(),

  constraint relatorios_periodo_valido check (periodo_fim >= periodo_inicio)
);

-- Um relatório por tipo e período: regerar substitui, não acumula.
create unique index relatorios_periodo_unico
  on public.relatorios (tipo, periodo_inicio, periodo_fim);

comment on column public.relatorios.conteudo is
  'Snapshot dos dados agregados. Persistido de propósito: o relatório da semana passada não deve mudar quando um dado antigo é corrigido.';

create table public.insights_ia (
  id           uuid primary key default gen_random_uuid(),
  gerado_em    timestamptz not null default now(),
  resumo       jsonb not null,      -- { pontos_atencao: [...], padroes_identificados: [...] }
  modelo       text not null,
  tokens_saida integer,             -- acompanhamento de custo
  erro         text,                -- preenchido quando a chamada falha; o job não some em silêncio

  constraint insights_resumo_e_objeto check (jsonb_typeof(resumo) = 'object')
);

create index insights_ia_recentes_idx on public.insights_ia (gerado_em desc);
