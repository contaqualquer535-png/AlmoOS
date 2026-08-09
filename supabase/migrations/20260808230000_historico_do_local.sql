-- =============================================================
-- 0022 — Histórico de um ambiente
-- =============================================================
-- "Na ronda de 01/08 havia 30 mesas, na de 03/08 havia 29, e no dia 02
-- eu troquei uma."
--
-- Essa frase cruza três tabelas: `verificacoes` guarda a contagem,
-- `pendencias` guarda o que abriu e fechou, e a troca aparece como
-- status 'trocado'. Cada uma sozinha conta um pedaço; a pergunta só é
-- respondida na linha do tempo.
--
-- Por isso a função devolve eventos heterogêneos num array só, ordenado
-- por data. Consultar tabela por tabela e cruzar na cabeça é justamente
-- o trabalho que o sistema deveria poupar.
-- =============================================================

create or replace function public.montar_historico_do_local(
  p_codigo text,
  p_dias   integer default 180
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with alvo as (
    select id, codigo, nome, bloco
      from public.locais
     where codigo = p_codigo
  ),
  desde as (
    select (current_date - p_dias)::date as data
  ),
  eventos as (
    -- Lançamento da ronda. A quantidade entra no detalhe quando existe,
    -- porque é ela que responde "quantas mesas havia naquele dia".
    select
      v.data as quando,
      'ronda'::text as tipo,
      v.status::text as subtipo,
      i.nome as titulo,
      trim(both ' · ' from concat_ws(' · ',
        case when v.quantidade is not null
             then v.quantidade || ' unidades' end,
        nullif(btrim(coalesce(v.observacao, '')), '')
      )) as detalhe,
      v.quantidade
    from public.verificacoes v
    join alvo l                   on l.id = v.local_id
    join public.itens_checklist i on i.id = v.item_id
    where v.data >= (select data from desde)

    union all

    -- Abertura de pendência
    select p.aberta_em, 'pendencia', 'aberta', i.nome,
           coalesce(p.observacao, 'sem observação'), null
      from public.pendencias p
      join alvo l                   on l.id = p.local_id
      join public.itens_checklist i on i.id = p.item_id
     where p.aberta_em >= (select data from desde)

    union all

    -- Encerramento, com o tipo de resolução: é o que distingue
    -- "consertaram" de "trocaram por outro".
    select p.fechada_em, 'pendencia', coalesce(p.tipo_resolucao::text, 'fechada'), i.nome,
           case p.tipo_resolucao
             when 'trocado'   then 'item trocado'
             when 'resolvido' then 'item consertado'
             else 'encerrada'
           end,
           null
      from public.pendencias p
      join alvo l                   on l.id = p.local_id
      join public.itens_checklist i on i.id = p.item_id
     where p.fechada_em is not null
       and p.fechada_em >= (select data from desde)

    union all

    select c.aberto_em::date, 'chamado', c.status::text, c.titulo,
           concat_ws(' · ', c.destino, nullif(c.protocolo_externo, '')), null
      from public.chamados c
      join alvo l on l.id = c.local_id
     where c.aberto_em::date >= (select data from desde)

    union all

    select t.criado_em::date, 'tarefa', t.status::text, t.titulo,
           coalesce(t.observacao, ''), null
      from public.tarefas t
      join alvo l on l.id = t.local_id
     where t.criado_em::date >= (select data from desde)

    union all

    -- Patrimônio que entrou ou saiu daqui
    select m.data::date, 'inventario', m.tipo::text, inv.item,
           concat_ws(' · ',
             case when m.local_destino_id = (select id from alvo)
                  then 'chegou' else 'saiu' end,
             nullif(m.responsavel, '')),
           null
      from public.movimentacoes_inventario m
      join public.inventario inv on inv.id = m.inventario_id
     where (m.local_destino_id = (select id from alvo)
            or m.local_origem_id = (select id from alvo))
       and m.data::date >= (select data from desde)

    union all

    -- Recurso emprestado para cá
    select e.retirado_em::date, 'recurso', 'retirada', r.nome,
           concat_ws(' · ', e.quantidade || ' un',
                     coalesce(e.responsavel, 'sem responsável')),
           e.quantidade
      from public.emprestimos_recurso e
      join public.recursos r on r.id = e.recurso_id
      join alvo l on l.id = e.local_id
     where e.retirado_em::date >= (select data from desde)

    union all

    -- Estado de classe marcado na planta
    select cs.registrado_em::date, 'classe', cs.status::text, cs.classe_ref,
           coalesce(cs.observacao, ''), null
      from public.classes_status cs
      join alvo l on l.id = cs.local_id
     where cs.registrado_em::date >= (select data from desde)
  )
  select jsonb_build_object(
    'local', (select jsonb_build_object(
                'id', id, 'codigo', codigo, 'nome', nome, 'bloco', bloco)
              from alvo),

    'eventos', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'quando', quando,
                 'tipo', tipo,
                 'subtipo', subtipo,
                 'titulo', titulo,
                 'detalhe', nullif(detalhe, ''))
               order by quando desc, tipo)
        from eventos
    ), '[]'::jsonb),

    -- Série de contagem por item contável, para o gráfico. Ordenada do
    -- mais antigo para o mais novo, que é como se lê uma linha.
    'contagens', coalesce((
      select jsonb_object_agg(x.item, x.serie)
        from (
          select i.nome as item,
                 jsonb_agg(jsonb_build_object('data', v.data, 'quantidade', v.quantidade)
                           order by v.data) as serie
            from public.verificacoes v
            join alvo l                   on l.id = v.local_id
            join public.itens_checklist i on i.id = v.item_id
           where v.quantidade is not null
             and v.data >= (select data from desde)
           group by i.nome
        ) x
    ), '{}'::jsonb),

    'janela_dias', p_dias
  );
$$;

comment on function public.montar_historico_do_local(text, integer) is
  'Linha do tempo de um ambiente: ronda, pendências, chamados, tarefas, patrimônio, recursos e classes, em ordem.';

revoke all on function public.montar_historico_do_local(text, integer) from public, anon;
grant execute on function public.montar_historico_do_local(text, integer) to authenticated;
