-- =============================================================
-- 0001 — Extensões, tipos enumerados e funções utilitárias
-- Sistema de Gestão CETEC / UCS
-- =============================================================
-- Convenções adotadas em todo o schema:
--   * chaves primárias uuid, geradas por gen_random_uuid()
--   * toda coluna de tempo é timestamptz (UTC); datas de calendário
--     operacional (ronda, pendência) são date
--   * colunas de auditoria: criado_em / atualizado_em / registrado_por
--   * enums nativos para conjuntos fechados do domínio;
--     tabelas de apoio para conjuntos que o operador pode ampliar
--     em tempo de execução (ex.: itens_checklist, suprimentos)
-- Para acrescentar um valor a um enum posteriormente:
--   ALTER TYPE public.<tipo> ADD VALUE 'novo';
--   (permitido dentro de transação a partir do PG12, mas o novo
--    valor não pode ser usado na mesma transação — logo, sempre
--    em migration própria e isolada)
-- =============================================================

create extension if not exists pgcrypto with schema extensions;
-- btree_gist é requisito da constraint de não-sobreposição em alocacoes
create extension if not exists btree_gist with schema extensions;

-- ---------- Tipos de domínio ----------

-- Tipo de ambiente físico. 'almoxarifado' e 'externo' existem aqui para
-- que inventário e movimentação tenham origem/destino homogêneos
-- (ver docs/ADR.md, decisão 04).
create type public.tipo_local as enum (
  'sala',          -- sala de aula regular, entra na ronda padrão
  'banheiro',      -- checklist próprio
  'apoio',         -- sala dos professores, copa, etc.
  'teatro',        -- B-117 (Teatrinho)
  'almoxarifado',
  'externo'        -- fora do CETEC: manutenção, empréstimo a terceiros
);

-- Códigos da planilha em uso, preservados: ✓ / M / X / T
create type public.status_verificacao as enum (
  'ok',           -- ✓
  'manutencao',   -- M
  'resolvido',    -- X
  'trocado'       -- T
);

-- Como uma pendência foi encerrada (espelha X / T)
create type public.tipo_resolucao as enum ('resolvido', 'trocado');

create type public.status_classe as enum ('ok', 'quebrada', 'faltando');

create type public.categoria_suprimento as enum ('copa', 'manutencao', 'limpeza');

create type public.tipo_movimento_suprimento as enum ('consumo', 'reposicao', 'ajuste');

create type public.tipo_movimentacao_inventario as enum (
  'emprestimo', 'devolucao', 'transferencia'
);

create type public.status_tarefa as enum ('pendente', 'em_andamento', 'concluida', 'cancelada');

create type public.prioridade_chamado as enum ('baixa', 'media', 'alta');

-- Chamado é o que sai do CETEC (SEAMB / manutenção predial).
-- O ciclo de vida acompanha o trâmite externo (ver ADR, decisão 03).
create type public.status_chamado as enum (
  'rascunho',       -- redigido, ainda não enviado
  'enviado',
  'em_atendimento',
  'concluido',
  'cancelado'
);

create type public.tipo_relatorio as enum ('diario', 'semanal', 'mensal');

-- ---------- Funções utilitárias ----------

-- search_path fixo e vazio: exigência do linter do Supabase e proteção
-- contra sequestro de resolução de nome. Todo objeto é qualificado.
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
  'Trigger BEFORE UPDATE genérica: mantém a coluna atualizado_em.';
