-- =============================================================
-- 0014 — Contexto para os insights
-- =============================================================
-- Seção 7.1 da especificação pede pontos de atenção priorizados. A
-- maior parte deles não precisa de modelo nenhum: "chamado aberto há 18
-- dias" é uma subtração, não uma inferência.
--
-- Então esta função devolve duas coisas separadas:
--
--   pontos_atencao — calculados aqui, determinísticos, sempre presentes.
--                    Aparecem na tela mesmo se a chamada ao modelo
--                    falhar ou nem existir.
--   dados          — material bruto agregado, para o modelo procurar
--                    padrão em cima. Só isso sai do banco na chamada
--                    externa.
--
-- Nada de identificável sai daqui: código de sala, nome de item e
-- contagem. Nome de responsável de empréstimo fica de fora de propósito.
-- =============================================================

create or replace function public.montar_contexto_para_insights()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with pontos as (
    -- Chamado encalhado no terceiro
    select
      'chamado_parado' as tipo,
      c.id             as referencia_id,
      format('Chamado "%s" para %s está aberto há %s dias',
             c.titulo, c.destino, current_date - c.aberto_em::date) as mensagem,
      case when current_date - c.aberto_em::date >= 30 then 'alta' else 'media' end as prioridade,
      current_date - c.aberto_em::date as peso
    from public.chamados c
    where c.status not in ('concluido', 'cancelado')
      and current_date - c.aberto_em::date >= 14

    union all

    -- Item marcado M que ninguém encerrou
    select
      'pendencia_antiga',
      p.id,
      format('%s em %s está pendente há %s dias',
             i.nome, l.codigo, current_date - p.aberta_em),
      case when current_date - p.aberta_em >= 30 then 'alta' else 'media' end,
      current_date - p.aberta_em
    from public.pendencias p
    join public.locais l          on l.id = p.local_id
    join public.itens_checklist i on i.id = p.item_id
    where p.fechada_em is null
      and current_date - p.aberta_em >= 14

    union all

    -- Estoque abaixo do ponto, ou com esgotamento previsto na semana
    select
      'suprimento_critico',
      s.id,
      case
        when s.abaixo_do_ponto then
          format('%s está em %s %s, abaixo do ponto de reposição (%s)',
                 s.nome, s.quantidade_atual, s.unidade, s.ponto_reposicao)
        else
          format('%s deve acabar em %s dias, por volta de %s',
                 s.nome, s.dias_restantes, to_char(s.previsao_esgotamento, 'DD/MM'))
      end,
      case when s.abaixo_do_ponto then 'alta' else 'media' end,
      coalesce(30 - s.dias_restantes, 40)
    from public.vw_suprimentos_status s
    where s.abaixo_do_ponto
       or (s.dias_restantes is not null and s.dias_restantes <= 7)

    union all

    -- Empréstimo vencido
    select
      'devolucao_atrasada',
      inv.id,
      format('%s está com %s desde %s, devolução prevista para %s',
             inv.item, inv.responsavel,
             to_char(inv.emprestado_em, 'DD/MM'),
             to_char(inv.previsao_devolucao, 'DD/MM')),
      'media',
      current_date - inv.previsao_devolucao
    from public.inventario inv
    where inv.ativo
      and inv.emprestado
      and inv.previsao_devolucao < current_date

    union all

    -- Tarefa com prazo estourado
    select
      'tarefa_atrasada',
      t.id,
      format('Tarefa "%s" venceu em %s', t.titulo, to_char(t.prazo, 'DD/MM')),
      'media',
      current_date - t.prazo
    from public.tarefas t
    where t.status in ('pendente', 'em_andamento')
      and t.prazo is not null
      and t.prazo < current_date

    union all

    -- Ronda do dia ainda não fechada, e só em dia de ronda
    select
      'ronda_incompleta',
      null::uuid,
      format('%s salas ainda sem lançamento na ronda de hoje', count(*)),
      'alta',
      100
    from public.locais l
    where extract(isodow from current_date) in (1, 3, 5)
      and l.ativo and l.ronda_padrao
      and not exists (
        select 1 from public.verificacoes v
         where v.local_id = l.id and v.data = current_date
      )
    having count(*) > 0
  )
  select jsonb_build_object(
    'gerado_para', current_date,
    'pontos_atencao', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'tipo', tipo,
                 'referencia_id', referencia_id,
                 'mensagem', mensagem,
                 'prioridade', prioridade)
               order by
                 case prioridade when 'alta' then 0 when 'media' then 1 else 2 end,
                 peso desc)
        from pontos
    ), '[]'::jsonb),

    -- Material para o modelo procurar padrão. Duas semanas e o mês
    -- corrente: menos que isso não dá tendência, mais que isso vira
    -- prompt caro sem ganho.
    'dados', jsonb_build_object(
      'semana_atual', public.montar_relatorio(
        date_trunc('week', current_date)::date, current_date),
      'semana_anterior', public.montar_relatorio(
        (date_trunc('week', current_date) - interval '7 days')::date,
        (date_trunc('week', current_date) - interval '1 day')::date),
      'mes_corrente', public.montar_relatorio(
        date_trunc('month', current_date)::date, current_date),
      'chamados_recentes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'titulo', c.titulo,
                 'local', l.codigo,
                 'bloco', l.bloco,
                 'prioridade', c.prioridade,
                 'status', c.status,
                 'aberto_em', c.aberto_em::date)
               order by c.aberto_em desc)
          from public.chamados c
          left join public.locais l on l.id = c.local_id
         where c.aberto_em >= now() - interval '90 days'
      ), '[]'::jsonb)
    )
  );
$$;

comment on function public.montar_contexto_para_insights() is
  'Pontos de atenção determinísticos + agregados brutos. Os pontos não dependem de modelo nenhum; os dados são o que a Edge Function envia para a IA procurar padrão.';

revoke all on function public.montar_contexto_para_insights() from public, anon;
grant execute on function public.montar_contexto_para_insights() to authenticated;
grant execute on function public.montar_contexto_para_insights() to service_role;
