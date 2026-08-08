-- Rollback 0003
-- Ordem importa: a trigger vive em verificacoes e depende da função,
-- então a tabela cai antes da função.
drop table if exists public.pendencias;
drop table if exists public.verificacoes;
drop function if exists public.aplicar_verificacao_na_pendencia();
drop table if exists public.itens_checklist;
