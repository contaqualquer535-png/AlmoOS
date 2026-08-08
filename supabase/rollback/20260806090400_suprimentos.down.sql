-- Rollback 0005
drop table if exists public.movimentos_suprimento;
drop function if exists public.aplicar_movimento_no_saldo();
drop table if exists public.suprimentos;
