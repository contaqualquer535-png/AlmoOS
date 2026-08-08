-- =============================================================
-- 0005 — Suprimentos (copa, manutenção, limpeza)
-- =============================================================
-- Mudanças em relação ao rascunho:
--   * consumo_medio_dia deixa de ser coluna e passa a ser calculado
--     (vw_suprimentos_status) — coluna materializada envelhece em
--     silêncio e é a primeira coisa a divergir do histórico
--   * a tabela de movimentos cobre consumo E reposição; sem reposição
--     o saldo nunca fecha
-- =============================================================

create table public.suprimentos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null unique,
  categoria        public.categoria_suprimento not null default 'copa',
  unidade          text not null default 'un',          -- 'un', 'pacote', 'kg'
  quantidade_atual numeric(12,3) not null default 0,
  ponto_reposicao  numeric(12,3) not null default 0 check (ponto_reposicao >= 0),
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

comment on column public.suprimentos.quantidade_atual is
  'Saldo derivado dos movimentos. Pode ficar negativo: isso significa reposição não registrada, e é sinal a exibir, não erro a bloquear (a captura é offline e não pode falhar em campo).';

create trigger suprimentos_set_atualizado_em
  before update on public.suprimentos
  for each row execute function public.set_atualizado_em();

create table public.movimentos_suprimento (
  id             uuid primary key default gen_random_uuid(),
  suprimento_id  uuid not null references public.suprimentos(id) on delete restrict,
  tipo           public.tipo_movimento_suprimento not null,
  -- Assinada: consumo é negativo, reposição positiva. A UI recebe número
  -- positivo do operador; a camada de dados aplica o sinal.
  quantidade     numeric(12,3) not null check (quantidade <> 0),
  observacao     text,
  data           timestamptz not null default now(),
  registrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now(),

  constraint movimentos_sinal_coerente check (
    (tipo = 'consumo'   and quantidade < 0) or
    (tipo = 'reposicao' and quantidade > 0) or
    (tipo = 'ajuste')
  )
);

create index movimentos_suprimento_item_data_idx
  on public.movimentos_suprimento (suprimento_id, data desc);
create index movimentos_suprimento_data_idx
  on public.movimentos_suprimento (data desc);

-- Saldo mantido no banco, não na aplicação: o app móvel sincroniza em
-- lote e não tem como calcular saldo confiável offline.
create or replace function public.aplicar_movimento_no_saldo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.suprimentos
       set quantidade_atual = quantidade_atual + new.quantidade
     where id = new.suprimento_id;

  elsif tg_op = 'UPDATE' then
    if old.suprimento_id <> new.suprimento_id then
      update public.suprimentos
         set quantidade_atual = quantidade_atual - old.quantidade
       where id = old.suprimento_id;
      update public.suprimentos
         set quantidade_atual = quantidade_atual + new.quantidade
       where id = new.suprimento_id;
    else
      update public.suprimentos
         set quantidade_atual = quantidade_atual - old.quantidade + new.quantidade
       where id = new.suprimento_id;
    end if;

  elsif tg_op = 'DELETE' then
    update public.suprimentos
       set quantidade_atual = quantidade_atual - old.quantidade
     where id = old.suprimento_id;
    return old;
  end if;

  return new;
end;
$$;

create trigger movimentos_suprimento_aplicam_saldo
  after insert or update or delete on public.movimentos_suprimento
  for each row execute function public.aplicar_movimento_no_saldo();
