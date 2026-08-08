-- Rollback 0006
drop table if exists public.movimentacoes_inventario;
drop function if exists public.aplicar_movimentacao_no_inventario();
drop table if exists public.inventario;
