-- Rollback 0001
drop function if exists public.set_atualizado_em();
drop type if exists public.tipo_relatorio;
drop type if exists public.status_chamado;
drop type if exists public.prioridade_chamado;
drop type if exists public.status_tarefa;
drop type if exists public.tipo_movimentacao_inventario;
drop type if exists public.tipo_movimento_suprimento;
drop type if exists public.categoria_suprimento;
drop type if exists public.status_classe;
drop type if exists public.tipo_resolucao;
drop type if exists public.status_verificacao;
drop type if exists public.tipo_local;
-- extensões não são removidas: podem ser usadas por outros objetos
