-- Reverte 0015 — mensagens do SERVi
drop function if exists public.registrar_mensagem_de_chamado(
  text, text, text, text, timestamptz, text, text);
drop table if exists public.mensagens_chamado;
drop type if exists public.direcao_mensagem;
