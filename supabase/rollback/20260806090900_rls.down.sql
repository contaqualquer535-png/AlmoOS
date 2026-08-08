-- Rollback 0010 — RLS e privilégios
do $$
declare t text;
  tabelas text[] := array['locais','turmas','alocacoes','itens_checklist','verificacoes',
    'pendencias','plantas','classes_status','suprimentos','movimentos_suprimento',
    'inventario','movimentacoes_inventario','tarefas','chamados','relatorios','insights_ia'];
begin
  foreach t in array tabelas loop
    execute format('drop policy if exists %I on public.%I', 'operador_acesso_total_' || t, t);
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;
