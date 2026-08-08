-- =============================================================
-- 0006 — Inventário / almoxarifado
-- =============================================================
-- local_padrao_id e local_atual_id são FKs para public.locais — o
-- almoxarifado é uma linha lá (decisão 04). Não há mais string mágica.
-- =============================================================

create table public.inventario (
  id                 uuid primary key default gen_random_uuid(),
  codigo_barras      text unique,             -- patrimônio UCS; null para itens sem etiqueta
  item               text not null,
  descricao          text,
  local_padrao_id    uuid not null references public.locais(id) on delete restrict,
  local_atual_id     uuid not null references public.locais(id) on delete restrict,
  responsavel        text,                    -- preenchido enquanto emprestado
  emprestado_em      timestamptz,
  previsao_devolucao date,
  -- Coluna gerada: "emprestado" nunca pode divergir de "tem responsável".
  emprestado         boolean generated always as (responsavel is not null) stored,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),

  constraint inventario_emprestimo_coerente check (
    (responsavel is null     and emprestado_em is null)
    or (responsavel is not null and emprestado_em is not null)
  )
);

create index inventario_local_atual_idx on public.inventario (local_atual_id) where ativo;
create index inventario_emprestados_idx on public.inventario (previsao_devolucao)
  where emprestado and ativo;

create trigger inventario_set_atualizado_em
  before update on public.inventario
  for each row execute function public.set_atualizado_em();

create table public.movimentacoes_inventario (
  id                 uuid primary key default gen_random_uuid(),
  inventario_id      uuid not null references public.inventario(id) on delete cascade,
  tipo               public.tipo_movimentacao_inventario not null,
  local_origem_id    uuid references public.locais(id) on delete set null,
  local_destino_id   uuid not null references public.locais(id) on delete restrict,
  responsavel        text,
  previsao_devolucao date,
  observacao         text,
  data               timestamptz not null default now(),
  registrado_por     uuid references auth.users(id) on delete set null default auth.uid(),

  constraint movimentacoes_emprestimo_tem_responsavel check (
    tipo <> 'emprestimo' or responsavel is not null
  )
);

create index movimentacoes_inventario_item_idx
  on public.movimentacoes_inventario (inventario_id, data desc);

-- Aplica a movimentação ao estado do item. Mantém a movimentação como
-- log e o inventário como projeção — a aplicação registra o evento e
-- não precisa lembrar de atualizar duas tabelas.
create or replace function public.aplicar_movimentacao_no_inventario()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.local_origem_id is null then
    select local_atual_id into new.local_origem_id
      from public.inventario where id = new.inventario_id;
  end if;

  if new.tipo = 'emprestimo' then
    update public.inventario
       set local_atual_id     = new.local_destino_id,
           responsavel        = new.responsavel,
           emprestado_em      = new.data,
           previsao_devolucao = new.previsao_devolucao
     where id = new.inventario_id;

  elsif new.tipo = 'devolucao' then
    update public.inventario
       set local_atual_id     = new.local_destino_id,
           responsavel        = null,
           emprestado_em      = null,
           previsao_devolucao = null
     where id = new.inventario_id;

  elsif new.tipo = 'transferencia' then
    -- transferência muda o local sem mexer no estado de empréstimo
    update public.inventario
       set local_atual_id = new.local_destino_id
     where id = new.inventario_id;
  end if;

  return new;
end;
$$;

-- BEFORE, para poder preencher local_origem_id na própria linha do log.
create trigger movimentacoes_aplicam_inventario
  before insert on public.movimentacoes_inventario
  for each row execute function public.aplicar_movimentacao_no_inventario();
