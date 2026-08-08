-- Rollback 0009 — views e plano do dia
drop function if exists public.montar_plano_do_dia(date);
drop view if exists public.vw_ronda_do_dia;
drop view if exists public.vw_classes_status_atual;
drop view if exists public.vw_suprimentos_status;
drop view if exists public.vw_pendencias_abertas;
drop view if exists public.vw_locais_com_turmas;
