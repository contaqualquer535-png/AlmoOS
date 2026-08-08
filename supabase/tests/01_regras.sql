-- Testes de comportamento. Cada bloco levanta exceção se a regra falhar.
-- Rodar depois das migrations + seed, num banco descartável.

\set ON_ERROR_STOP on

do $$
declare
  v_local uuid;
  v_item  uuid;
  v_pend  uuid;
  v_qtd   numeric;
  n       integer;
begin
  select id into v_local from public.locais where codigo = 'C-212';
  select id into v_item  from public.itens_checklist where nome = 'Projetor';

  -- 1. Um 'M' abre pendência
  insert into public.verificacoes (local_id, item_id, data, status, observacao)
  values (v_local, v_item, current_date - 10, 'manutencao', 'lâmpada do projetor queimada');

  select id into v_pend from public.pendencias
   where local_id = v_local and item_id = v_item and fechada_em is null;
  if v_pend is null then raise exception 'T1 falhou: M não abriu pendência'; end if;

  -- 2. Um segundo 'M' em outro dia não duplica a pendência
  insert into public.verificacoes (local_id, item_id, data, status)
  values (v_local, v_item, current_date - 8, 'manutencao');
  select count(*) into n from public.pendencias
   where local_id = v_local and item_id = v_item and fechada_em is null;
  if n <> 1 then raise exception 'T2 falhou: % pendências abertas, esperado 1', n; end if;

  -- 3. Um 'T' fecha a pendência com o tipo de resolução correto
  insert into public.verificacoes (local_id, item_id, data, status)
  values (v_local, v_item, current_date - 5, 'trocado');
  perform 1 from public.pendencias
   where id = v_pend and fechada_em = current_date - 5 and tipo_resolucao = 'trocado';
  if not found then raise exception 'T3 falhou: T não fechou a pendência'; end if;

  -- 4. Novo 'M' depois de fechada abre pendência nova (não reabre a antiga)
  insert into public.verificacoes (local_id, item_id, data, status)
  values (v_local, v_item, current_date - 2, 'manutencao');
  select count(*) into n from public.pendencias
   where local_id = v_local and item_id = v_item;
  if n <> 2 then raise exception 'T4 falhou: % pendências no total, esperado 2', n; end if;

  -- 5. Correção de lançamento: M → ok descarta a pendência que ele abriu
  update public.verificacoes set status = 'ok'
   where local_id = v_local and item_id = v_item and data = current_date - 2;
  select count(*) into n from public.pendencias
   where local_id = v_local and item_id = v_item and fechada_em is null;
  if n <> 0 then raise exception 'T5 falhou: correção não descartou a pendência'; end if;

  -- 6. Upsert idempotente da sincronização offline
  insert into public.verificacoes (local_id, item_id, data, status)
  values (v_local, v_item, current_date - 2, 'manutencao')
  on conflict (local_id, item_id, data) do update set status = excluded.status;
  select count(*) into n from public.verificacoes
   where local_id = v_local and item_id = v_item and data = current_date - 2;
  if n <> 1 then raise exception 'T6 falhou: upsert duplicou registro'; end if;

  raise notice 'Ronda/pendências: 6 testes OK';
end $$;

do $$
declare
  v_sup uuid;
  v_qtd numeric;
begin
  select id into v_sup from public.suprimentos where nome = 'Café';

  insert into public.movimentos_suprimento (suprimento_id, tipo, quantidade)
  values (v_sup, 'reposicao', 10);
  insert into public.movimentos_suprimento (suprimento_id, tipo, quantidade)
  values (v_sup, 'consumo', -0.5);

  select quantidade_atual into v_qtd from public.suprimentos where id = v_sup;
  if v_qtd <> 9.5 then raise exception 'T7 falhou: saldo %, esperado 9.5', v_qtd; end if;

  -- consumo com sinal positivo deve ser rejeitado
  begin
    insert into public.movimentos_suprimento (suprimento_id, tipo, quantidade)
    values (v_sup, 'consumo', 3);
    raise exception 'T8 falhou: consumo positivo foi aceito';
  exception when check_violation then null;
  end;

  raise notice 'Suprimentos: 2 testes OK';
end $$;

do $$
declare
  v_item   uuid;
  v_almox  uuid;
  v_sala   uuid;
  r        record;
begin
  select id into v_almox from public.locais where codigo = 'ALMOX';
  select id into v_sala  from public.locais where codigo = 'K-306';

  insert into public.inventario (codigo_barras, item, local_padrao_id, local_atual_id)
  values ('UCS-000123', 'Projetor Epson', v_almox, v_almox)
  returning id into v_item;

  insert into public.movimentacoes_inventario
    (inventario_id, tipo, local_destino_id, responsavel, previsao_devolucao)
  values (v_item, 'emprestimo', v_sala, 'Prof. Silva', current_date + 7);

  select * into r from public.inventario where id = v_item;
  if r.local_atual_id <> v_sala or not r.emprestado then
    raise exception 'T9 falhou: empréstimo não atualizou o item';
  end if;

  insert into public.movimentacoes_inventario (inventario_id, tipo, local_destino_id)
  values (v_item, 'devolucao', v_almox);

  select * into r from public.inventario where id = v_item;
  if r.emprestado or r.responsavel is not null then
    raise exception 'T10 falhou: devolução não limpou o empréstimo';
  end if;

  -- empréstimo sem responsável deve ser rejeitado
  begin
    insert into public.movimentacoes_inventario (inventario_id, tipo, local_destino_id)
    values (v_item, 'emprestimo', v_sala);
    raise exception 'T11 falhou: empréstimo sem responsável foi aceito';
  exception when check_violation then null;
  end;

  raise notice 'Inventário: 3 testes OK';
end $$;

do $$
declare
  v_turma uuid;
  v_a uuid; v_b uuid;
begin
  select id into v_turma from public.turmas where codigo = 'P1';
  select id into v_a from public.locais where codigo = 'C-204';

  begin
    insert into public.alocacoes (turma_id, local_id, data_inicio)
    values (v_turma, v_a, date '2026-09-01');
    raise exception 'T12 falhou: alocação sobreposta foi aceita';
  exception when exclusion_violation then null;
  end;

  raise notice 'Alocações: 1 teste OK';
end $$;

do $$
declare
  v_local uuid;
  r       record;
  n       integer;
begin
  select id into v_local from public.locais where codigo = 'C-212';

  -- 14. O seed desenhou a planta padrão
  select * into r from public.vw_plantas_resumo where local_id = v_local;
  if not found then raise exception 'T14 falhou: C-212 sem planta no resumo'; end if;
  if r.total_classes <> 30 then
    raise exception 'T14 falhou: % classes, esperado 30', r.total_classes;
  end if;
  -- A turma vigente vem por subconsulta escalar: se virasse join, cada
  -- turma multiplicaria as linhas e o total de classes acima quebraria.
  if not (r.turmas_vigentes @> array['P1']) then
    raise exception 'T14 falhou: C-212 sem a turma P1 vigente (%)', r.turmas_vigentes;
  end if;

  -- 15. classes_status é append-only: o estado atual é a linha mais recente
  insert into public.classes_status (local_id, classe_ref, status, registrado_em)
  values (v_local, 'cl-07', 'quebrada', now() - interval '2 days');
  insert into public.classes_status (local_id, classe_ref, status, registrado_em)
  values (v_local, 'cl-07', 'ok', now() - interval '1 day');

  select count(*) into n from public.classes_status
   where local_id = v_local and classe_ref = 'cl-07';
  if n <> 2 then raise exception 'T15 falhou: histórico perdeu linha (% de 2)', n; end if;

  select * into r from public.vw_classes_status_atual
   where local_id = v_local and classe_ref = 'cl-07';
  if r.status <> 'ok' then
    raise exception 'T15 falhou: estado atual %, esperado ok', r.status;
  end if;

  -- 16. O resumo conta só o estado vigente, não o histórico
  insert into public.classes_status (local_id, classe_ref, status)
  values (v_local, 'cl-11', 'faltando');

  select * into r from public.vw_plantas_resumo where local_id = v_local;
  if r.classes_quebradas <> 0 or r.classes_faltando <> 1 then
    raise exception 'T16 falhou: % quebradas / % faltando, esperado 0 / 1',
      r.classes_quebradas, r.classes_faltando;
  end if;

  -- 17. Planta com elementos vazios continua listada (left join lateral)
  update public.plantas set elementos = '[]'::jsonb where local_id = v_local;
  select * into r from public.vw_plantas_resumo where local_id = v_local;
  if not found or r.total_classes <> 0 then
    raise exception 'T17 falhou: planta vazia sumiu do resumo';
  end if;

  -- 18. Ambiente sem planta nenhuma também aparece, com tem_planta falso.
  -- É por essa linha que se chega ao editor: sem ela, banheiro e
  -- almoxarifado nunca poderiam ser desenhados.
  select * into r from public.vw_plantas_resumo
   where codigo = 'BANH-C';
  if not found then raise exception 'T18 falhou: BANH-C sumiu do resumo'; end if;
  if r.tem_planta then raise exception 'T18 falhou: BANH-C marcado como desenhado'; end if;

  -- EXTERNO não é espaço físico e não deve aparecer
  perform 1 from public.vw_plantas_resumo where codigo = 'EXTERNO';
  if found then raise exception 'T18 falhou: EXTERNO apareceu no resumo'; end if;

  raise notice 'Planta: 5 testes OK';
end $$;

do $$
declare
  plano jsonb;
begin
  plano := public.montar_plano_do_dia();
  if jsonb_typeof(plano -> 'pendencias') <> 'array' then
    raise exception 'T13 falhou: plano do dia sem array de pendências';
  end if;
  if (plano ->> 'e_dia_de_ronda') is null then
    raise exception 'T13 falhou: plano do dia sem flag de ronda';
  end if;
  raise notice 'Plano do dia: OK — %', jsonb_pretty(plano) ;
end $$;

do $$
declare
  rel   jsonb;
  serie jsonb;
  v_id  uuid;
  n     integer;
begin
  -- 19. O relatório enxerga o que os testes anteriores criaram.
  -- Os inserts da ronda foram feitos entre 10 e 2 dias atrás.
  rel := public.montar_relatorio(current_date - 30, current_date);

  if (rel #>> '{ronda,esperado}')::integer <= 0 then
    raise exception 'T19 falhou: esperado zerado — dias de ronda não contaram';
  end if;
  if (rel #>> '{pendencias,abertas_no_periodo}')::integer < 1 then
    raise exception 'T19 falhou: nenhuma pendência no período (%)', rel -> 'pendencias';
  end if;
  if jsonb_typeof(rel -> 'por_bloco') <> 'array' then
    raise exception 'T19 falhou: por_bloco não é array';
  end if;

  -- 20. O corte por data é fechado: período anterior a tudo vem zerado,
  -- mas com a estrutura completa — a tela não pode receber null.
  rel := public.montar_relatorio(date '2020-01-01', date '2020-01-07');
  if (rel #>> '{pendencias,abertas_no_periodo}')::integer <> 0 then
    raise exception 'T20 falhou: período vazio trouxe pendência';
  end if;
  if jsonb_typeof(rel -> 'suprimentos') <> 'array' then
    raise exception 'T20 falhou: período vazio não devolveu array de suprimentos';
  end if;

  -- 21. Regerar substitui em vez de acumular
  v_id := public.gerar_relatorio('semanal', current_date - 7, current_date);
  perform public.gerar_relatorio('semanal', current_date - 7, current_date);
  select count(*) into n from public.relatorios
   where tipo = 'semanal' and periodo_inicio = current_date - 7;
  if n <> 1 then raise exception 'T21 falhou: % relatórios, esperado 1', n; end if;

  -- 22. A série cobre todos os dias, inclusive os sem registro
  serie := public.serie_ronda_por_dia(30);
  if jsonb_array_length(serie) <> 30 then
    raise exception 'T22 falhou: série com % dias, esperado 30', jsonb_array_length(serie);
  end if;

  raise notice 'Relatórios: 4 testes OK';
end $$;
