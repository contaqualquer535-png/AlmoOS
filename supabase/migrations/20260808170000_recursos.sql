-- =============================================================
-- 0016 — Recursos: emprestáveis contados por quantidade
-- =============================================================
-- Faltava um modelo. O que existia:
--
--   suprimentos — tem quantidade, é consumido, não volta
--   inventario  — é único, tem patrimônio, é emprestado e volta
--
-- Extensão elétrica é os dois ao mesmo tempo: você tem sete, empresta
-- três, quer saber quantas sobraram e com quem. Cabo HDMI, controle de
-- projetor, adaptador e caixa de som têm exatamente o mesmo formato.
--
-- Etiquetar cada extensão como patrimônio resolveria no papel e não na
-- prática: ninguém vai ler o código de barras de uma extensão no meio
-- do corredor. Contar é o gesto natural aqui.
-- =============================================================

create table public.recursos (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null unique,
  descricao         text,
  unidade           text not null default 'un',
  quantidade_total  integer not null default 0 check (quantidade_total >= 0),
  -- Alerta quando o disponível cai abaixo disto. Zero desliga o aviso.
  minimo_desejado   integer not null default 0 check (minimo_desejado >= 0),
  local_guarda_id   uuid references public.locais(id) on delete set null,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

comment on table public.recursos is
  'Item emprestável contado por quantidade, sem patrimônio individual: extensão, cabo, controle, adaptador.';

create trigger recursos_set_atualizado_em
  before update on public.recursos
  for each row execute function public.set_atualizado_em();

-- Uma linha por retirada. Devolução parcial fecha esta e abre outra com
-- o resto — assim "levei 3, devolvi 1" continua rastreável, o que um
-- simples decremento de contador perderia.
create table public.emprestimos_recurso (
  id                 uuid primary key default gen_random_uuid(),
  recurso_id         uuid not null references public.recursos(id) on delete cascade,
  quantidade         integer not null check (quantidade > 0),
  responsavel        text,
  local_id           uuid references public.locais(id) on delete set null,
  observacao         text,
  retirado_em        timestamptz not null default now(),
  previsao_devolucao date,
  devolvido_em       timestamptz,
  registrado_por     uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em          timestamptz not null default now()
);

create index emprestimos_recurso_abertos_idx
  on public.emprestimos_recurso (recurso_id)
  where devolvido_em is null;

create index emprestimos_recurso_vencendo_idx
  on public.emprestimos_recurso (previsao_devolucao)
  where devolvido_em is null;

-- ---------- Disponibilidade ----------

create view public.vw_recursos_status
with (security_invoker = true) as
select
  r.id,
  r.nome,
  r.descricao,
  r.unidade,
  r.quantidade_total,
  r.minimo_desejado,
  r.local_guarda_id,
  l.codigo as local_guarda,
  coalesce(e.emprestada, 0)::integer as quantidade_emprestada,
  (r.quantidade_total - coalesce(e.emprestada, 0))::integer as quantidade_disponivel,
  coalesce(e.retiradas, 0)::integer as retiradas_abertas,
  (r.quantidade_total - coalesce(e.emprestada, 0)) <= r.minimo_desejado
    and r.minimo_desejado > 0 as abaixo_do_minimo,
  -- Retirada vencida é o sinal que faz alguém ir atrás.
  coalesce(e.atrasadas, 0)::integer as retiradas_atrasadas
from public.recursos r
left join public.locais l on l.id = r.local_guarda_id
left join (
  select
    recurso_id,
    sum(quantidade)                                          as emprestada,
    count(*)                                                 as retiradas,
    count(*) filter (where previsao_devolucao < current_date) as atrasadas
  from public.emprestimos_recurso
  where devolvido_em is null
  group by recurso_id
) e on e.recurso_id = r.id
where r.ativo;

comment on view public.vw_recursos_status is
  'Quanto existe, quanto está fora e quanto sobrou de cada recurso.';

-- ---------- Guarda contra emprestar o que não existe ----------

create or replace function public.conferir_disponibilidade_do_recurso()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total      integer;
  v_emprestada integer;
  v_nome       text;
begin
  select quantidade_total, nome into v_total, v_nome
    from public.recursos where id = new.recurso_id;

  select coalesce(sum(quantidade), 0) into v_emprestada
    from public.emprestimos_recurso
   where recurso_id = new.recurso_id
     and devolvido_em is null
     and id <> new.id;

  if v_emprestada + new.quantidade > v_total then
    raise exception
      'Não há % suficientes: % no total, % já emprestadas, % disponíveis.',
      v_nome, v_total, v_emprestada, v_total - v_emprestada
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Só na retirada e enquanto estiver aberta. Devolver nunca pode ser
-- bloqueado — se o número está errado, receber de volta é o que
-- conserta, não o que piora.
create trigger emprestimos_recurso_conferem_saldo
  before insert or update on public.emprestimos_recurso
  for each row
  when (new.devolvido_em is null)
  execute function public.conferir_disponibilidade_do_recurso();

-- ---------- Contagem de mobiliário ----------
-- Classes e cadeiras somadas de todas as plantas. É número que o
-- operador precisa ter na mão, e hoje só existia sala a sala.

create view public.vw_contagem_mobiliario
with (security_invoker = true) as
with elementos as (
  select
    p.local_id,
    e.valor->>'tipo' as tipo,
    e.valor->>'ref'  as ref
  from public.plantas p
  cross join lateral jsonb_array_elements(p.elementos) as e(valor)
)
select
  count(*) filter (where el.tipo = 'classe')::integer as total_classes,
  count(*) filter (where el.tipo = 'classe' and cs.status = 'quebrada')::integer
    as classes_quebradas,
  count(*) filter (where el.tipo = 'classe' and cs.status = 'faltando')::integer
    as classes_faltando,
  count(*) filter (
    where el.tipo = 'classe' and (cs.status is null or cs.status = 'ok')
  )::integer as classes_em_ordem,
  count(distinct el.local_id)::integer as salas_com_planta
from elementos el
left join public.vw_classes_status_atual cs
       on cs.local_id = el.local_id and cs.classe_ref = el.ref;

comment on view public.vw_contagem_mobiliario is
  'Total de classes no CETEC e em que estado estão. Uma linha só.';

-- ---------- Privilégios ----------
do $$
declare
  t text;
begin
  foreach t in array array['recursos', 'emprestimos_recurso'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'operador_acesso_total_' || t, t
    );
  end loop;

  foreach t in array array['vw_recursos_status', 'vw_contagem_mobiliario'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;
