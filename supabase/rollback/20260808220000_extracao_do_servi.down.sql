-- Reverte 0021 — volta a extração da 0015.
--
-- A 0015 já é um create or replace da mesma assinatura, então reaplicar
-- aquele arquivo restaura o comportamento anterior. Como o rollback
-- completo derruba a função logo em seguida, aqui basta o drop.
drop function if exists public.registrar_mensagem_de_chamado(
  text, text, text, text, timestamptz, text, text);
