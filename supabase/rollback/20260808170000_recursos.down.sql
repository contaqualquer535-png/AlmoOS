-- Reverte 0016 — recursos emprestáveis
drop view if exists public.vw_contagem_mobiliario;
drop view if exists public.vw_recursos_status;
drop table if exists public.emprestimos_recurso;
drop function if exists public.conferir_disponibilidade_do_recurso();
drop table if exists public.recursos;
