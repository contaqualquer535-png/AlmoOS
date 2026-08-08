-- =============================================================
-- 0013 — Agregação de período e séries para gráfico
-- =============================================================
-- Seção 9 da especificação: relatório semanal e mensal. A agregação
-- mora no banco, e não na aplicação, por três motivos:
--
--   1. A Edge Function de insights (etapa 6) precisa dos mesmos números
--      e não vai reimplementá-los em TypeScript.
--   2. `relatorios.conteudo` guarda o snapshot congelado; quem congela
--      precisa ser a mesma expressão que a tela lê ao vivo, senão os
--      dois divergem em silêncio.
--   3. Contar linha em SQL é barato; trazer as linhas para contar em JS
--      não é.
--
-- Todas recebem o período por parâmetro, como montar_plano_do_dia: dá
-- para reconstruir o relatório de qualquer semana passada.
-- =============================================================

-- ---------- Relatório de um período ----------
create or replace function public.montar_relatorio(
  p_inicio date,
  p_fim    date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with dias_de_ronda as (
    -- Seg/qua/sex dentro do período. É o denominador da cobertura:
    -- comparar contra todos os dias puniria o sistema pelo fim de semana.
    select d::date as dia
      from generate_series(p_inicio, p_fim, interval '1 day') as d
     where extract(isodow from d) in (1, 3, 5)
  ),
  esperado as (
    select
      (select count(*) from dias_de_ronda)
      * (select count(*) from public.locais where ativo and ronda_padrao)
      * (select count(*) from public.itens_checklist where ativo) as total
  ),
  feito as (
    select count(*) as total
      from public.verificacoes v
     where v.data between p_inicio and p_fim
  )
  select jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim',    p_fim,
    'dias_de_ronda',  (select count(*) from dias_de_ronda),

    'ronda', jsonb_build_object(
      'esperado', (select total from esperado),
      'feito',    (select total from feito),
      'cobertura', case
        when (select total from esperado) = 0 then null
        else round(
          (select total from feito)::numeric / (select total from esperado) * 100, 1)
      end
    ),

    -- Distribuição dos quatro códigos da planilha no período.
    'verificacoes_por_status', coalesce((
      select jsonb_object_agg(status, n)
        from (
          select v.status::text as status, count(*) as n
            from public.verificacoes v
           where v.data between p_inicio and p_fim
           group by v.status
        ) s
    ), '{}'::jsonb),

    'pendencias', jsonb_build_object(
      'abertas_no_periodo', (
        select count(*) from public.pendencias
         where aberta_em between p_inicio and p_fim),
      'fechadas_no_periodo', (
        select count(*) from public.pendencias
         where fechada_em between p_inicio and p_fim),
      'resolvidas', (
        select count(*) from public.pendencias
         where fechada_em between p_inicio and p_fim
           and tipo_resolucao = 'resolvido'),
      'trocadas', (
        select count(*) from public.pendencias
         where fechada_em between p_inicio and p_fim
           and tipo_resolucao = 'trocado'),
      -- Fotografia no fim do período, não no dia de hoje: o relatório da
      -- semana passada não pode mudar quando algo é resolvido agora.
      'em_aberto_no_fim', (
        select count(*) from public.pendencias
         where aberta_em <= p_fim
           and (fechada_em is null or fechada_em > p_fim))
    ),

    -- Onde o problema se concentra. Ordenado pelo maior, que é a leitura
    -- que interessa: qual bloco está consumindo o mês.
    'por_bloco', coalesce((
      select jsonb_agg(x order by x.aberturas desc, x.bloco)
        from (
          select coalesce(l.bloco, 'Sem bloco') as bloco, count(*) as aberturas
            from public.pendencias p
            join public.locais l on l.id = p.local_id
           where p.aberta_em between p_inicio and p_fim
           group by 1
        ) x
    ), '[]'::jsonb),

    'por_item', coalesce((
      select jsonb_agg(x order by x.aberturas desc, x.item)
        from (
          select i.nome as item, count(*) as aberturas
            from public.pendencias p
            join public.itens_checklist i on i.id = p.item_id
           where p.aberta_em between p_inicio and p_fim
           group by 1
        ) x
    ), '[]'::jsonb),

    'suprimentos', coalesce((
      select jsonb_agg(x order by x.consumido desc, x.nome)
        from (
          select s.nome, s.unidade, sum(-m.quantidade) as consumido
            from public.movimentos_suprimento m
            join public.suprimentos s on s.id = m.suprimento_id
           where m.tipo = 'consumo'
             and m.data::date between p_inicio and p_fim
           group by s.nome, s.unidade
        ) x
    ), '[]'::jsonb),

    'chamados', jsonb_build_object(
      'abertos', (
        select count(*) from public.chamados
         where aberto_em::date between p_inicio and p_fim),
      'fechados', (
        select count(*) from public.chamados
         where fechado_em::date between p_inicio and p_fim),
      'em_aberto_no_fim', (
        select count(*) from public.chamados
         where aberto_em::date <= p_fim
           and (fechado_em is null or fechado_em::date > p_fim))
    ),

    'tarefas', jsonb_build_object(
      'criadas', (
        select count(*) from public.tarefas
         where criado_em::date between p_inicio and p_fim),
      'concluidas', (
        select count(*) from public.tarefas
         where concluida_em::date between p_inicio and p_fim)
    )
  );
$$;

comment on function public.montar_relatorio(date, date) is
  'Agrega um período em JSON. Fonte única do relatório persistido, da tela e da Edge Function de insights.';

-- ---------- Persistir o relatório ----------
-- Congela o snapshot. O índice único (tipo, início, fim) faz o upsert
-- substituir: regerar corrige, não acumula.
create or replace function public.gerar_relatorio(
  p_tipo   public.tipo_relatorio,
  p_inicio date,
  p_fim    date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.relatorios (tipo, periodo_inicio, periodo_fim, conteudo)
  values (p_tipo, p_inicio, p_fim, public.montar_relatorio(p_inicio, p_fim))
  on conflict (tipo, periodo_inicio, periodo_fim) do update
    set conteudo  = excluded.conteudo,
        gerado_em = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- Séries para os gráficos da tela inicial ----------
-- Um dia por linha, incluindo os dias sem nenhum registro: uma série com
-- buracos vira um gráfico que mente sobre o que aconteceu.
create or replace function public.serie_ronda_por_dia(p_dias integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with calendario as (
    select d::date as dia
      from generate_series(
             current_date - (p_dias - 1),
             current_date,
             interval '1 day') as d
  ),
  esperado_por_dia as (
    select (select count(*) from public.locais where ativo and ronda_padrao)
         * (select count(*) from public.itens_checklist where ativo) as total
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'dia', c.dia,
             'dia_de_ronda', extract(isodow from c.dia) in (1, 3, 5),
             'feito', coalesce(v.n, 0),
             'esperado', case
               when extract(isodow from c.dia) in (1, 3, 5)
                 then (select total from esperado_por_dia)
               else 0
             end)
           order by c.dia), '[]'::jsonb)
    from calendario c
    left join (
      select data, count(*) as n
        from public.verificacoes
       group by data
    ) v on v.data = c.dia;
$$;

create or replace function public.serie_pendencias_por_bloco()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.abertas desc, x.bloco), '[]'::jsonb)
    from (
      select coalesce(l.bloco, 'Sem bloco') as bloco,
             count(*) as abertas,
             max(current_date - p.aberta_em) as dias_da_mais_antiga
        from public.pendencias p
        join public.locais l on l.id = p.local_id
       where p.fechada_em is null
       group by 1
    ) x;
$$;

-- ---------- Privilégios ----------
do $$
declare
  f text;
  funcoes text[] := array[
    'public.montar_relatorio(date, date)',
    'public.gerar_relatorio(public.tipo_relatorio, date, date)',
    'public.serie_ronda_por_dia(integer)',
    'public.serie_pendencias_por_bloco()'
  ];
begin
  foreach f in array funcoes loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
