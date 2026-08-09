-- Reverte 0024 — anotação vira trabalho
drop function if exists public.anotacoes_do_periodo(date, date);

alter table public.anotacoes
  drop column if exists interpretacao,
  drop column if exists interpretada_em,
  drop column if exists tarefa_id;

-- Materiais de tarefa não cabem no modelo antigo: apagar é o único
-- caminho, e por isso este rollback perde dado. Está aqui de propósito
-- para quem reverter saber o que custa.
delete from public.materiais_planejados where tarefa_id is not null;

alter table public.materiais_planejados
  drop constraint if exists materiais_tem_um_dono,
  drop column if exists tarefa_id;

alter table public.materiais_planejados
  alter column pendencia_id set not null;

alter table public.materiais_planejados rename to materiais_da_pendencia;
