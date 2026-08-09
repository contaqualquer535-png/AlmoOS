-- Reverte 0026 — visão unificada do almoxarifado
drop function if exists public.resumo_do_almoxarifado();
drop view if exists public.vw_almoxarifado;
