-- =============================================================
-- 0010 — Row Level Security e privilégios
-- =============================================================
-- Decisão 05 do ADR: operador único. A política é "qualquer usuário
-- autenticado tem acesso total"; o anônimo não tem nenhum.
--
-- Caminho de upgrade para múltiplos operadores, se um dia for preciso:
-- criar public.operadores (user_id, papel) e trocar o USING de cada
-- política por um EXISTS nessa tabela. As policies estão nomeadas e
-- isoladas nesta migration justamente para que essa troca seja um
-- arquivo só. Nenhuma coluna precisa mudar — registrado_por já grava
-- auth.uid() desde o primeiro dia.
-- =============================================================

do $$
declare
  t text;
  tabelas text[] := array[
    'locais', 'turmas', 'alocacoes',
    'itens_checklist', 'verificacoes', 'pendencias',
    'plantas', 'classes_status',
    'suprimentos', 'movimentos_suprimento',
    'inventario', 'movimentacoes_inventario',
    'tarefas', 'chamados',
    'relatorios', 'insights_ia'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'operador_acesso_total_' || t, t
    );
  end loop;
end;
$$;

-- Views herdam o RLS das tabelas de base por causa do security_invoker,
-- mas o privilégio de SELECT ainda precisa ser retirado do anônimo.
do $$
declare
  v text;
  views text[] := array[
    'vw_locais_com_turmas', 'vw_pendencias_abertas', 'vw_suprimentos_status',
    'vw_classes_status_atual', 'vw_ronda_do_dia'
  ];
begin
  foreach v in array views loop
    execute format('revoke all on public.%I from anon', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end;
$$;

revoke all on function public.montar_plano_do_dia(date) from public, anon;
grant execute on function public.montar_plano_do_dia(date) to authenticated;
