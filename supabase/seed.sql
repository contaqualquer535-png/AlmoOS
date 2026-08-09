-- =============================================================
-- Carga inicial — ambientes reais sob responsabilidade do CETEC
-- Idempotente: pode rodar de novo sem duplicar.
-- =============================================================

-- ---------- Itens do checklist da ronda ----------
insert into public.itens_checklist (nome, ordem) values
  ('Mesas',               10),
  ('Cadeiras',            20),
  ('Projetor',            30),
  ('Lâmpadas',            40),
  ('Quadro/Apagador',     50),
  ('Tomadas',             60),
  ('Relógio',             70),
  ('Material de Limpeza', 80)
on conflict (nome) do nothing;

-- ---------- Locais ----------
insert into public.locais (codigo, nome, bloco, tipo, ronda_padrao, ordem_visita) values
  -- Bloco C
  ('C-204', null, 'Bloco C', 'sala', true, 10),
  ('C-206', null, 'Bloco C', 'sala', true, 20),
  ('C-207', null, 'Bloco C', 'sala', true, 30),
  ('C-208', null, 'Bloco C', 'sala', true, 40),
  ('C-212', null, 'Bloco C', 'sala', true, 50),
  -- K Inferior
  ('K-201', null, 'K Inferior', 'sala', true, 10),
  ('K-202', null, 'K Inferior', 'sala', true, 20),
  ('K-205', null, 'K Inferior', 'sala', true, 30),
  ('K-206', null, 'K Inferior', 'sala', true, 40),
  ('K-207', null, 'K Inferior', 'sala', true, 50),
  -- K Superior
  ('K-301', null, 'K Superior', 'sala', true, 10),
  ('K-302', null, 'K Superior', 'sala', true, 20),
  ('K-305', null, 'K Superior', 'sala', true, 30),
  ('K-306', null, 'K Superior', 'sala', true, 40),
  ('K-307', null, 'K Superior', 'sala', true, 50),
  -- Bloco B
  ('B-106',     null,                  'Bloco B', 'sala',   true,  10),
  ('B-111/113', null,                  'Bloco B', 'sala',   true,  20),
  ('B-102',     'Sala dos professores','Bloco B', 'apoio',  false, 30),
  ('B-117',     'Teatrinho',           'Bloco B', 'teatro', false, 40),
  -- Banheiros (checklist próprio, fora da ronda padrão)
  ('BANH-C',  'Banheiros Bloco C',    'Bloco C',    'banheiro', false, 90),
  ('BANH-KI', 'Banheiros K Inferior', 'K Inferior', 'banheiro', false, 90),
  ('BANH-KS', 'Banheiros K Superior', 'K Superior', 'banheiro', false, 90),
  ('BANH-B',  'Banheiros Bloco B',    'Bloco B',    'banheiro', false, 90),
  -- Depósito
  ('ALMOX', 'Almoxarifado CETEC', null, 'almoxarifado', false, null),
  -- Destino genérico para itens que saem do CETEC
  ('EXTERNO', 'Fora do CETEC', null, 'externo', false, null)
on conflict (codigo) do nothing;

-- ---------- Turmas ----------
insert into public.turmas (codigo) values
  ('S1'), ('E1'), ('O1'), ('W1'), ('P1'),
  ('G2'), ('D2'), ('A2'), ('B2'), ('Inglês'),
  ('G3'), ('Z3'), ('A3'), ('B3'), ('D3'),
  ('K3'), ('Design')
on conflict (codigo) do nothing;

-- ---------- Alocações vigentes (semestre 2026/2) ----------
-- Ajuste a data de início se o semestre for outro.
insert into public.alocacoes (turma_id, local_id, data_inicio)
select t.id, l.id, date '2026-08-01'
from (values
  ('S1','C-204'), ('E1','C-206'), ('O1','C-207'), ('W1','C-208'), ('P1','C-212'),
  ('G2','K-201'), ('D2','K-202'), ('Inglês','K-205'), ('A2','K-206'), ('B2','K-207'),
  ('G3','K-301'), ('Z3','K-302'), ('A3','K-305'), ('B3','K-306'), ('D3','K-307'),
  ('K3','B-106'), ('Design','B-111/113')
) as v(turma_codigo, local_codigo)
join public.turmas t on t.codigo = v.turma_codigo
join public.locais l on l.codigo = v.local_codigo
where not exists (
  select 1 from public.alocacoes a
   where a.turma_id = t.id and a.data_fim is null
);

-- ---------- Suprimentos iniciais ----------
insert into public.suprimentos (nome, categoria, unidade, ponto_reposicao) values
  ('Café',              'copa',       'pacote', 2),
  ('Chá',               'copa',       'caixa',  2),
  ('Açúcar',            'copa',       'kg',     1),
  ('Copo descartável',  'copa',       'pacote', 2),
  ('Pilha AA',          'manutencao', 'un',     8),
  ('Pilha AAA',         'manutencao', 'un',     8),
  ('Lâmpada reserva',   'manutencao', 'un',     4),
  ('Apagador',          'manutencao', 'un',     2),
  ('Marcador de quadro','manutencao', 'un',     6)
on conflict (nome) do nothing;

-- ---------- Recursos emprestáveis ----------
-- Quantidades em zero de propósito: o número real você ajusta na tela,
-- e um chute aqui viraria dado errado difícil de perceber.
insert into public.recursos (nome, unidade, quantidade_total, minimo_desejado, local_guarda_id)
select v.nome, 'un', 0, v.minimo, l.id
from (values
  ('Extensão elétrica',   2),
  ('Cabo HDMI',           1),
  ('Adaptador VGA/HDMI',  1),
  ('Controle de projetor',1),
  ('Caixa de som',        0),
  ('Régua de tomada',     1)
) as v(nome, minimo)
cross join public.locais l
where l.codigo = 'ALMOX'
on conflict (nome) do nothing;

-- ---------- Plantas: layout padrão de sala de aula ----------
-- Ponto de partida, não retrato fiel: grid 7×7 com quadro e mesa do
-- professor na frente, projetor na segunda fila e 30 classes em 5×6.
-- A tela /planta/[codigo] tem modo de edição justamente para corrigir
-- sala a sala; o "do nothing" abaixo garante que rodar o seed de novo
-- não desfaça esse trabalho.
insert into public.plantas (local_id, grid_cols, grid_rows, elementos)
select
  l.id,
  7,
  7,
  (
    select jsonb_agg(x.elemento order by x.elemento->>'ref')
    from (
      select jsonb_build_object(
               'ref', 'porta', 'tipo', 'porta', 'x', 0, 'y', 0) as elemento
      union all
      select jsonb_build_object(
               'ref', 'qd-' || g, 'tipo', 'quadro', 'x', g + 1, 'y', 0)
        from generate_series(1, 4) as g
      union all
      select jsonb_build_object(
               'ref', 'mesa-prof', 'tipo', 'mesa_professor', 'x', 6, 'y', 0)
      union all
      select jsonb_build_object(
               'ref', 'projetor', 'tipo', 'projetor', 'x', 3, 'y', 1)
      union all
      select jsonb_build_object(
               'ref', 'cl-' || lpad((((r - 2) * 6) + c + 1)::text, 2, '0'),
               'tipo', 'classe', 'x', c, 'y', r)
        from generate_series(2, 6) as r,
             generate_series(0, 5) as c
    ) as x
  )
from public.locais l
where l.ativo and l.tipo = 'sala'
on conflict (local_id) do nothing;
