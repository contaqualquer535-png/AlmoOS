-- Reverte 0025 — registro de uso da IA
drop function if exists public.resumo_do_uso_de_ia();
drop table if exists public.uso_de_ia;
