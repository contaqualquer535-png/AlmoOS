-- Reverte 0017 — quantidade na ronda
drop view if exists public.vw_contagem_por_sala;
drop function if exists public.serie_contagem_do_item(uuid, uuid, integer);
alter table public.verificacoes drop column if exists quantidade;
alter table public.itens_checklist drop column if exists pede_quantidade;
