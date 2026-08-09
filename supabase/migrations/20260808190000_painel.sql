-- =============================================================
-- 0018 — Agregações do painel
-- =============================================================
-- Uma função só, devolvendo tudo que a tela inicial precisa além do que
-- já existe. Segue a forma de montar_plano_do_dia pelo mesmo motivo: a
-- home faria dez idas ao banco para montar dez cartões, e cada ida custa
-- latência que se acumula na percepção de lentidão.
-- =============================================================

create or replace function public.montar_painel(p_dias_de_historico integer default 90)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with desde as (
    select (current_date - p_dias_de_historico)::date as data
  ),
  -- Duas contagens mais recentes de cada item contável, para a variação.
  contagens as (
    select
      v.local_id,
      v.item_id,
      v.quantidade,
      v.data,
      row_number() over (partition by v.local_id, v.item_id order by v.data desc) as posicao
    from public.verificacoes v
    where v.quantidade is not null
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'janela_dias', p_dias_de_historico,

    -- ---------- Onde o problema se concentra ----------
    'ranking_itens', coalesce((
      select jsonb_agg(x order by x.aberturas desc, x.item)
        from (
          select i.nome as item, count(*) as aberturas
            from public.pendencias p
            join public.itens_checklist i on i.id = p.item_id
           where p.aberta_em >= (select data from desde)
           group by i.nome
           order by count(*) desc
           limit 8
        ) x
    ), '[]'::jsonb),

    'ranking_locais', coalesce((
      select jsonb_agg(x order by x.aberturas desc, x.codigo)
        from (
          select
            l.codigo,
            l.bloco,
            count(*) as aberturas,
            -- Os itens que mais aparecem naquela sala: sem isso o
            -- ranking diz onde doer, mas não o quê.
            string_agg(distinct i.nome, ', ' order by i.nome) as itens
          from public.pendencias p
          join public.locais l          on l.id = p.local_id
          join public.itens_checklist i on i.id = p.item_id
         where p.aberta_em >= (select data from desde)
         group by l.codigo, l.bloco
         order by count(*) desc
         limit 8
        ) x
    ), '[]'::jsonb),

    -- ---------- Idade do que está aberto ----------
    'idade_pendencias', (
      select jsonb_build_object(
        'ate_7',   count(*) filter (where current_date - aberta_em <= 7),
        'de_7_14', count(*) filter (where current_date - aberta_em between 8 and 14),
        'de_14_30',count(*) filter (where current_date - aberta_em between 15 and 30),
        'mais_30', count(*) filter (where current_date - aberta_em > 30)
      )
      from public.pendencias where fechada_em is null
    ),

    -- ---------- Ganhando ou perdendo ----------
    -- Abertas contra fechadas por semana. É o único número que diz se a
    -- situação melhora; o total em aberto sozinho não distingue "muito
    -- trabalho e dando conta" de "acumulando".
    'semanas', coalesce((
      select jsonb_agg(x order by x.semana)
        from (
          select
            s.semana,
            (select count(*) from public.pendencias p
              where p.aberta_em >= s.semana and p.aberta_em < s.semana + 7) as abertas,
            (select count(*) from public.pendencias p
              where p.fechada_em >= s.semana and p.fechada_em < s.semana + 7) as fechadas
          from (
            -- O cast para date acontece aqui, e não lá embaixo, porque
            -- generate_series devolve timestamptz e "timestamptz + 7"
            -- não existe. Com date, o + 7 é soma de dias.
            select gs::date as semana
              from generate_series(
                     date_trunc('week', current_date) - interval '7 weeks',
                     date_trunc('week', current_date),
                     interval '1 week') as gs
          ) s
        ) x
    ), '[]'::jsonb),

    -- ---------- Agenda dos próximos 14 dias ----------
    -- Junta o que vence de quatro origens diferentes. Separadas, cada
    -- uma exige lembrar de conferir; juntas, é uma lista só.
    'vencimentos', coalesce((
      select jsonb_agg(x order by x.quando, x.descricao)
        from (
          select
            e.previsao_devolucao as quando,
            'recurso' as tipo,
            format('Devolver %s %s', e.quantidade, r.nome) as descricao,
            coalesce(e.responsavel, 'sem responsável') as detalhe
          from public.emprestimos_recurso e
          join public.recursos r on r.id = e.recurso_id
         where e.devolvido_em is null
           and e.previsao_devolucao is not null
           and e.previsao_devolucao <= current_date + 14

          union all

          select t.prazo, 'tarefa', t.titulo, coalesce(l.codigo, 'sem local')
            from public.tarefas t
            left join public.locais l on l.id = t.local_id
           where t.status in ('pendente', 'em_andamento')
             and t.prazo is not null
             and t.prazo <= current_date + 14

          union all

          select inv.previsao_devolucao, 'inventario',
                 format('Devolver %s', inv.item),
                 coalesce(inv.responsavel, 'sem responsável')
            from public.inventario inv
           where inv.ativo and inv.emprestado
             and inv.previsao_devolucao is not null
             and inv.previsao_devolucao <= current_date + 14

          union all

          select s.previsao_esgotamento, 'suprimento',
                 format('%s deve acabar', s.nome),
                 format('%s %s em estoque', s.quantidade_atual, s.unidade)
            from public.vw_suprimentos_status s
           where s.previsao_esgotamento is not null
             and s.previsao_esgotamento <= current_date + 14
        ) x
    ), '[]'::jsonb),

    -- ---------- Chamados por fila do SERVi ----------
    'chamados_por_fila', coalesce((
      select jsonb_agg(x order by x.abertos desc, x.fila)
        from (
          select destino as fila, count(*) as abertos
            from public.chamados
           where status not in ('concluido', 'cancelado')
           group by destino
        ) x
    ), '[]'::jsonb),

    'dias_medios_ate_fechar', (
      select round(avg(fechado_em::date - aberto_em::date), 1)
        from public.chamados
       where fechado_em is not null
         and aberto_em >= (select data from desde)
    ),

    -- ---------- Mobiliário e o que sumiu ----------
    'contagem_atual', coalesce((
      select jsonb_object_agg(x.item, x.total)
        from (
          select i.nome as item, sum(c.quantidade) as total
            from contagens c
            join public.itens_checklist i on i.id = c.item_id
           where c.posicao = 1
           group by i.nome
        ) x
    ), '{}'::jsonb),

    -- Só o que diminuiu. Cadeira sumindo aos poucos é invisível no
    -- total e evidente na diferença.
    'perdas_de_contagem', coalesce((
      select jsonb_agg(x order by x.diferenca, x.codigo)
        from (
          select
            l.codigo,
            i.nome as item,
            atual.quantidade as agora,
            anterior.quantidade as antes,
            (atual.quantidade - anterior.quantidade) as diferenca,
            atual.data as contado_em
          from contagens atual
          join contagens anterior
            on anterior.local_id = atual.local_id
           and anterior.item_id = atual.item_id
           and anterior.posicao = 2
          join public.locais l          on l.id = atual.local_id
          join public.itens_checklist i on i.id = atual.item_id
         where atual.posicao = 1
           and atual.quantidade < anterior.quantidade
        ) x
    ), '[]'::jsonb),

    -- ---------- Consumo semanal ----------
    'consumo_semanal', coalesce((
      select jsonb_agg(x order by x.nome, x.semana)
        from (
          select s.nome, date_trunc('week', m.data)::date as semana,
                 sum(-m.quantidade) as consumido
            from public.movimentos_suprimento m
            join public.suprimentos s on s.id = m.suprimento_id
           where m.tipo = 'consumo'
             and m.data >= now() - interval '8 weeks'
           group by s.nome, date_trunc('week', m.data)
        ) x
    ), '[]'::jsonb)
  );
$$;

comment on function public.montar_painel(integer) is
  'Tudo que a tela inicial precisa além do plano do dia, numa consulta só.';

revoke all on function public.montar_painel(integer) from public, anon;
grant execute on function public.montar_painel(integer) to authenticated;
grant execute on function public.montar_painel(integer) to service_role;
