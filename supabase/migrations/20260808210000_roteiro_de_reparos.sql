-- =============================================================
-- 0020 — Roteiro de reparos
-- =============================================================
-- Reproduz o documento que o operador já usa: checklist de materiais a
-- separar antes de sair, mais a ordem de visita por bloco.
--
-- A parte difícil é a primeira tabela do documento. "Trocar pilha do
-- relógio (1 pilha AA)" tem o material dentro de texto livre, e para
-- agregar "4 pilhas AA — K307, B106, C207, C212" o material precisa ser
-- dado, não frase.
--
-- Daí `materiais_da_pendencia`. Ela aceita descrição livre em vez de
-- exigir vínculo com `suprimentos` porque metade do que se leva não é
-- suprimento: escada, alicate e chave de fenda são ferramentas que
-- voltam, e caixa acrílica é peça avulsa. Forçar tudo para dentro de
-- suprimentos poluiria o controle de estoque com coisas que não têm
-- saldo.
-- =============================================================

create table public.materiais_da_pendencia (
  id            uuid primary key default gen_random_uuid(),
  pendencia_id  uuid not null references public.pendencias(id) on delete cascade,
  descricao     text not null,
  quantidade    numeric(10,2) not null default 1 check (quantidade > 0),
  unidade       text not null default 'un',
  -- Opcional: quando o material for suprimento controlado, o vínculo
  -- permite conferir se há estoque antes de sair.
  suprimento_id uuid references public.suprimentos(id) on delete set null,
  criado_em     timestamptz not null default now()
);

create index materiais_da_pendencia_idx
  on public.materiais_da_pendencia (pendencia_id);

comment on table public.materiais_da_pendencia is
  'O que levar para resolver cada pendência. Alimenta a primeira tabela do roteiro de reparos.';

-- ---------- Ordem de visita entre blocos ----------
-- O roteiro em uso lista os blocos numa ordem que evita ir e voltar.
-- Isso é geografia do prédio, não algo derivável dos dados.
alter table public.locais
  add column ordem_bloco smallint not null default 50;

comment on column public.locais.ordem_bloco is
  'Ordem do bloco no roteiro de visita. Menor vem primeiro. Evita ir e voltar entre prédios.';

update public.locais set ordem_bloco = case bloco
  when 'K Inferior' then 10
  when 'K Superior' then 20
  when 'Bloco B'    then 30
  when 'Bloco C'    then 40
  else 50
end;

-- ---------- Montagem do roteiro ----------

create or replace function public.montar_roteiro(p_data date default current_date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with pendentes as (
    select
      p.id,
      p.local_id,
      l.codigo,
      l.bloco,
      l.ordem_bloco,
      l.ordem_visita,
      i.nome as item,
      p.observacao,
      p.aberta_em,
      (p_data - p.aberta_em) as dias
    from public.pendencias p
    join public.locais l          on l.id = p.local_id
    join public.itens_checklist i on i.id = p.item_id
    where p.fechada_em is null
      and p.aberta_em <= p_data
      and l.ativo
  ),
  -- Tarefas com local entram no roteiro: quem está indo até a sala
  -- resolve as duas coisas na mesma viagem.
  tarefas_com_local as (
    select
      t.id,
      t.local_id,
      l.codigo,
      l.bloco,
      l.ordem_bloco,
      l.ordem_visita,
      'Tarefa' as item,
      t.titulo as observacao,
      t.criado_em::date as aberta_em,
      (p_data - t.criado_em::date) as dias
    from public.tarefas t
    join public.locais l on l.id = t.local_id
    where t.status in ('pendente', 'em_andamento')
      and l.ativo
  ),
  tudo as (
    select * from pendentes
    union all
    select * from tarefas_com_local
  )
  select jsonb_build_object(
    'data', p_data,

    -- ---------- 1. O que levar ----------
    -- Agrupado por material, somando quantidade e listando onde é usado.
    -- É a tabela que o operador confere antes de sair da sala dele.
    'materiais', coalesce((
      select jsonb_agg(x order by x.descricao)
        from (
          select
            m.descricao,
            sum(m.quantidade) as quantidade,
            m.unidade,
            string_agg(distinct l.codigo, ', ' order by l.codigo) as onde,
            -- Se for suprimento controlado, avisa quando não há saldo:
            -- descobrir que acabou na frente da sala é tarde.
            max(s.quantidade_atual) as em_estoque,
            bool_or(s.id is not null) as e_suprimento
          from public.materiais_da_pendencia m
          join public.pendencias p on p.id = m.pendencia_id
          join public.locais l     on l.id = p.local_id
          left join public.suprimentos s on s.id = m.suprimento_id
         where p.fechada_em is null
           and p.aberta_em <= p_data
         group by m.descricao, m.unidade
        ) x
    ), '[]'::jsonb),

    -- ---------- Salas que não precisam de visita ----------
    -- Sai no documento porque poupa a conferência mental de "será que
    -- esqueci alguma?".
    'salas_sem_pendencia', coalesce((
      select jsonb_agg(l.codigo order by l.ordem_bloco, l.ordem_visita, l.codigo)
        from public.locais l
       where l.ativo and l.ronda_padrao
         and not exists (select 1 from tudo t where t.local_id = l.id)
    ), '[]'::jsonb),

    -- ---------- 2. Roteiro de execução ----------
    'blocos', coalesce((
      select jsonb_agg(b order by b.ordem)
        from (
          select
            t.bloco,
            min(t.ordem_bloco) as ordem,
            jsonb_agg(
              jsonb_build_object(
                'codigo', s.codigo,
                'turmas', s.turmas,
                'itens', s.itens
              ) order by s.ordem_visita nulls last, s.codigo
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

comment on function public.montar_roteiro(date) is
  'Monta o roteiro de reparos: materiais a levar, salas sem pendência e ordem de visita por bloco.';

-- ---------- Privilégios ----------
alter table public.materiais_da_pendencia enable row level security;
revoke all on public.materiais_da_pendencia from anon;
create policy operador_acesso_total_materiais_da_pendencia
  on public.materiais_da_pendencia for all to authenticated
  using (true) with check (true);

revoke all on function public.montar_roteiro(date) from public, anon;
grant execute on function public.montar_roteiro(date) to authenticated;
