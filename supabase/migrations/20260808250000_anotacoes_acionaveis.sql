-- =============================================================
-- 0024 — Anotação vira trabalho
-- =============================================================
-- "Trocar pilha do relógio da sala C-212" contém local, item e material.
-- É linguagem, não aritmética — o tipo de coisa em que o modelo é bom e
-- o SQL é impotente.
--
-- A decisão de desenho: o modelo converte **uma vez**, na entrada. A
-- partir daí o resultado é dado estruturado como qualquer outro, e o
-- plano do dia, o roteiro e o relatório agregam em SQL. Nada volta a
-- depender de modelo.
--
-- Três mudanças:
--
--   1. materiais_da_pendencia vira materiais_planejados e passa a
--      aceitar tarefa, não só pendência. Sem isso a pilha da anotação
--      não entraria na tabela do roteiro.
--   2. anotacoes guarda o que a IA entendeu e o que criou, para a tela
--      poder dizer "isto foi interpretado" e você poder desfazer.
--   3. o roteiro soma as duas origens.
-- =============================================================

-- ---------- 1. Materiais servem para tarefa também ----------

alter table public.materiais_da_pendencia rename to materiais_planejados;

alter table public.materiais_planejados
  alter column pendencia_id drop not null,
  add column tarefa_id uuid references public.tarefas(id) on delete cascade;

alter table public.materiais_planejados
  add constraint materiais_tem_um_dono check (
    (pendencia_id is not null and tarefa_id is null)
    or (pendencia_id is null and tarefa_id is not null)
  );

create index materiais_planejados_tarefa_idx
  on public.materiais_planejados (tarefa_id) where tarefa_id is not null;

comment on table public.materiais_planejados is
  'O que levar para resolver uma pendência ou uma tarefa. Alimenta a tabela de materiais do roteiro.';

-- ---------- 2. Anotação interpretada ----------

alter table public.anotacoes
  add column tarefa_id      uuid references public.tarefas(id) on delete set null,
  add column interpretada_em timestamptz,
  -- O que o modelo entendeu, cru. Guardar permite mostrar na tela por
  -- que ele decidiu aquilo, e permite reprocessar se o prompt melhorar.
  add column interpretacao   jsonb;

comment on column public.anotacoes.interpretacao is
  'O que a IA extraiu do texto: local, item, materiais. Guardado para auditoria e reprocessamento.';

-- ---------- 3. Roteiro somando as duas origens ----------

create or replace function public.montar_roteiro(p_data date default current_date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with pendentes as (
    select
      p.id, p.local_id, l.codigo, l.bloco, l.ordem_bloco, l.ordem_visita,
      i.nome as item, p.observacao, p.aberta_em, (p_data - p.aberta_em) as dias,
      'pendencia'::text as origem
    from public.pendencias p
    join public.locais l          on l.id = p.local_id
    join public.itens_checklist i on i.id = p.item_id
    where p.fechada_em is null and p.aberta_em <= p_data and l.ativo
  ),
  tarefas_com_local as (
    select
      t.id, t.local_id, l.codigo, l.bloco, l.ordem_bloco, l.ordem_visita,
      'Tarefa'::text, t.titulo, t.criado_em::date, (p_data - t.criado_em::date),
      'tarefa'::text
    from public.tarefas t
    join public.locais l on l.id = t.local_id
    where t.status in ('pendente', 'em_andamento') and l.ativo
  ),
  tudo as (
    select * from pendentes
    union all
    select * from tarefas_com_local
  )
  select jsonb_build_object(
    'data', p_data,

    -- Materiais das duas origens, somados por descrição.
    'materiais', coalesce((
      select jsonb_agg(x order by x.descricao)
        from (
          select
            m.descricao,
            sum(m.quantidade) as quantidade,
            m.unidade,
            coalesce(
              string_agg(distinct l.codigo, ', ' order by l.codigo),
              'sem local definido'
            ) as onde,
            max(s.quantidade_atual) as em_estoque,
            bool_or(s.id is not null) as e_suprimento
          from public.materiais_planejados m
          left join public.pendencias p on p.id = m.pendencia_id
          left join public.tarefas    t on t.id = m.tarefa_id
          -- LEFT: tarefa sem local ("comprar café") também precisa ter
          -- o material na lista do que levar. Com join interno ela
          -- sumiria, e o operador sairia sem o item.
          left join public.locais l
            on l.id = coalesce(p.local_id, t.local_id)
          left join public.suprimentos s on s.id = m.suprimento_id
         where (p.id is not null and p.fechada_em is null and p.aberta_em <= p_data)
            or (t.id is not null and t.status in ('pendente', 'em_andamento'))
         group by m.descricao, m.unidade
        ) x
    ), '[]'::jsonb),

    'salas_sem_pendencia', coalesce((
      select jsonb_agg(l.codigo order by l.ordem_bloco, l.ordem_visita, l.codigo)
        from public.locais l
       where l.ativo and l.ronda_padrao
         and not exists (select 1 from tudo t where t.local_id = l.id)
    ), '[]'::jsonb),

    'blocos', coalesce((
      select jsonb_agg(b order by b.ordem)
        from (
          select
            t.bloco,
            min(t.ordem_bloco) as ordem,
            jsonb_agg(
              jsonb_build_object('codigo', s.codigo, 'turmas', s.turmas, 'itens', s.itens)
              order by s.ordem_visita nulls last, s.codigo
            ) as salas
          from tudo t
          join lateral (
            select
              t2.codigo,
              min(t2.ordem_visita) as ordem_visita,
              coalesce((
                select array_agg(tu.codigo order by tu.codigo)
                  from public.alocacoes a
                  join public.turmas tu on tu.id = a.turma_id
                 where a.local_id = t2.local_id
                   and a.data_inicio <= p_data
                   and (a.data_fim is null or a.data_fim > p_data)
              ), '{}') as turmas,
              jsonb_agg(
                jsonb_build_object(
                  'texto', coalesce(nullif(btrim(t2.observacao), ''), t2.item),
                  'item', t2.item,
                  'origem', t2.origem,
                  'dias', t2.dias
                ) order by t2.aberta_em
              ) as itens
            from tudo t2
            where t2.codigo = t.codigo
            group by t2.codigo, t2.local_id
          ) s on true
          group by t.bloco
        ) b
    ), '[]'::jsonb),

    'total_pendencias', (select count(*) from tudo),
    'total_salas',      (select count(distinct local_id) from tudo)
  );
$$;

-- ---------- 4. Anotações de um período ----------
-- Função à parte em vez de embutir em montar_relatorio: aquela já é
-- grande, e reescrevê-la inteira só para acrescentar um bloco
-- multiplicaria a chance de errar uma agregação existente.

create or replace function public.anotacoes_do_periodo(p_inicio date, p_fim date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.quando), '[]'::jsonb)
    from (
      select
        a.texto,
        a.criado_em::date as quando,
        l.codigo as local,
        (a.tarefa_id is not null) as virou_tarefa,
        (t.status = 'concluida') as concluida,
        a.fixada
      from public.anotacoes a
      left join public.locais l  on l.id = a.local_id
      left join public.tarefas t on t.id = a.tarefa_id
     where a.criado_em::date between p_inicio and p_fim
       and a.arquivada_em is null
    ) x;
$$;

revoke all on function public.anotacoes_do_periodo(date, date) from public, anon;
grant execute on function public.anotacoes_do_periodo(date, date) to authenticated;
