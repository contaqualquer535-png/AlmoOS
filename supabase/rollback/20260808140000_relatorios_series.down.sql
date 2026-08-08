-- Reverte 0013 — agregação de período e séries
drop function if exists public.serie_pendencias_por_bloco();
drop function if exists public.serie_ronda_por_dia(integer);
drop function if exists public.gerar_relatorio(public.tipo_relatorio, date, date);
drop function if exists public.montar_relatorio(date, date);
