-- Reverte 0020 — roteiro de reparos
drop function if exists public.montar_roteiro(date);
drop table if exists public.materiais_da_pendencia;
alter table public.locais drop column if exists ordem_bloco;
