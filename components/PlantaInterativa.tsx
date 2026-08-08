'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { registrarStatusDeClasse, salvarPlanta } from '@/lib/data/mutacoes';
import { dataHoraCurta } from '@/lib/formato';
import {
  GLIFO_ELEMENTO,
  ROTULO_ELEMENTO,
  ROTULO_STATUS_CLASSE,
  type ClasseStatusAtual,
  type ElementoPlanta,
  type Planta,
  type StatusClasse,
  type TipoElemento,
} from '@/lib/types/database';

const STATUS: StatusClasse[] = ['ok', 'quebrada', 'faltando'];

const FERRAMENTAS: Array<{ valor: TipoElemento | 'apagar'; rotulo: string }> = [
  { valor: 'classe', rotulo: 'Classe' },
  { valor: 'quadro', rotulo: 'Quadro' },
  { valor: 'porta', rotulo: 'Porta' },
  { valor: 'mesa_professor', rotulo: 'Mesa prof.' },
  { valor: 'projetor', rotulo: 'Projetor' },
  { valor: 'apagar', rotulo: 'Apagar' },
];

const PREFIXO: Record<TipoElemento, string> = {
  classe: 'cl',
  quadro: 'qd',
  porta: 'porta',
  mesa_professor: 'mesa-prof',
  projetor: 'projetor',
};

const PLANTA_VAZIA = { grid_cols: 7, grid_rows: 7, elementos: [] as ElementoPlanta[] };

/** Chave de posição. Duas células nunca ocupam o mesmo x,y. */
function posicao(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Menor ref livre para o tipo: cl-01, cl-02... Numerar por ordem de
 * criação faria a numeração pular depois de apagar uma classe do meio, e
 * a ref é o que liga o desenho ao histórico em classes_status.
 */
function proximaRef(tipo: TipoElemento, existentes: Set<string>): string {
  const prefixo = PREFIXO[tipo];
  for (let n = 1; n <= 999; n += 1) {
    const candidata = `${prefixo}-${String(n).padStart(2, '0')}`;
    if (!existentes.has(candidata)) return candidata;
  }
  return `${prefixo}-${Date.now()}`;
}

export function PlantaInterativa({
  localId,
  codigoDoLocal,
  planta,
  status,
  historico,
}: {
  localId: string;
  codigoDoLocal: string;
  planta: Planta | null;
  status: Record<string, ClasseStatusAtual>;
  historico: Record<string, ClasseStatusAtual[]>;
}) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const inicial = planta ?? PLANTA_VAZIA;

  const [editando, setEditando] = useState(planta === null);
  const [cols, setCols] = useState(inicial.grid_cols);
  const [rows, setRows] = useState(inicial.grid_rows);
  const [elementos, setElementos] = useState<ElementoPlanta[]>(inicial.elementos);
  const [ferramenta, setFerramenta] = useState<TipoElemento | 'apagar'>('classe');

  const [estados, setEstados] = useState(status);
  const [linhas, setLinhas] = useState(historico);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const porPosicao = useMemo(() => {
    const mapa = new Map<string, ElementoPlanta>();
    for (const e of elementos) mapa.set(posicao(e.x, e.y), e);
    return mapa;
  }, [elementos]);

  const refs = useMemo(() => new Set(elementos.map((e) => e.ref)), [elementos]);

  const contagem = useMemo(() => {
    const classes = elementos.filter((e) => e.tipo === 'classe');
    return {
      total: classes.length,
      quebradas: classes.filter((e) => estados[e.ref]?.status === 'quebrada').length,
      faltando: classes.filter((e) => estados[e.ref]?.status === 'faltando').length,
    };
  }, [elementos, estados]);

  // ---------- Edição do desenho ----------

  function tocarCelulaEditando(x: number, y: number) {
    const existente = porPosicao.get(posicao(x, y));

    if (ferramenta === 'apagar') {
      if (existente) setElementos((atual) => atual.filter((e) => e.ref !== existente.ref));
      return;
    }

    if (existente) {
      // Mesmo tipo: o toque apaga. Tipo diferente: substitui.
      if (existente.tipo === ferramenta) {
        setElementos((atual) => atual.filter((e) => e.ref !== existente.ref));
        return;
      }
      const restantes = elementos.filter((e) => e.ref !== existente.ref);
      const livres = new Set(restantes.map((e) => e.ref));
      setElementos([...restantes, { ref: proximaRef(ferramenta, livres), tipo: ferramenta, x, y }]);
      return;
    }

    setElementos((atual) => [
      ...atual,
      { ref: proximaRef(ferramenta, refs), tipo: ferramenta, x, y },
    ]);
  }

  function redimensionar(novasCols: number, novasRows: number) {
    setCols(novasCols);
    setRows(novasRows);
    // Encolher o grid não pode deixar elemento pendurado fora dele: o
    // servidor rejeitaria o salvamento inteiro por causa de uma célula.
    setElementos((atual) => atual.filter((e) => e.x < novasCols && e.y < novasRows));
  }

  async function gravarDesenho() {
    setOcupado(true);
    setErro(null);

    const resultado = await salvarPlanta({
      localId,
      codigoDoLocal,
      gridCols: cols,
      gridRows: rows,
      elementos,
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'A planta não foi gravada.');
      return;
    }

    setEditando(false);
    iniciarTransicao(() => router.refresh());
  }

  function descartarEdicao() {
    setCols(inicial.grid_cols);
    setRows(inicial.grid_rows);
    setElementos(inicial.elementos);
    setErro(null);
    setEditando(false);
  }

  // ---------- Registro de estado da classe ----------

  function selecionar(elemento: ElementoPlanta) {
    if (elemento.tipo !== 'classe') return;
    const mesma = selecionada === elemento.ref;
    setSelecionada(mesma ? null : elemento.ref);
    setNota(mesma ? '' : (estados[elemento.ref]?.observacao ?? ''));
    setErro(null);
  }

  async function marcar(novoStatus: StatusClasse) {
    if (!selecionada) return;

    setOcupado(true);
    setErro(null);

    const resultado = await registrarStatusDeClasse({
      localId,
      codigoDoLocal,
      classeRef: selecionada,
      status: novoStatus,
      observacao: nota,
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'O registro não foi gravado.');
      return;
    }

    const registro: ClasseStatusAtual = {
      local_id: localId,
      classe_ref: selecionada,
      status: novoStatus,
      observacao: nota.trim() || null,
      registrado_em: new Date().toISOString(),
    };

    setEstados((atual) => ({ ...atual, [selecionada]: registro }));
    // Empilha no topo: o histórico é do mais recente para o mais antigo.
    setLinhas((atual) => ({
      ...atual,
      [selecionada]: [registro, ...(atual[selecionada] ?? [])],
    }));
    iniciarTransicao(() => router.refresh());
  }

  // ---------- Grid ----------

  const celulas = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const elemento = porPosicao.get(posicao(x, y));
      const chave = posicao(x, y);

      if (!elemento) {
        celulas.push(
          editando ? (
            <button
              key={chave}
              type="button"
              className="planta__celula planta__celula--livre"
              onClick={() => tocarCelulaEditando(x, y)}
              aria-label={`Coluna ${x + 1}, linha ${y + 1}: vazia`}
            />
          ) : (
            <span key={chave} className="planta__celula planta__celula--livre" aria-hidden="true" />
          ),
        );
        continue;
      }

      const estado = elemento.tipo === 'classe' ? estados[elemento.ref]?.status : undefined;
      const classes = [
        'planta__celula',
        `planta__celula--${elemento.tipo}`,
        estado ? `planta__celula--${estado}` : '',
        selecionada === elemento.ref ? 'planta__celula--selecionada' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const descricao =
        elemento.tipo === 'classe'
          ? `${elemento.ref}: ${ROTULO_STATUS_CLASSE[estado ?? 'ok']}`
          : ROTULO_ELEMENTO[elemento.tipo];

      celulas.push(
        <button
          key={chave}
          type="button"
          className={classes}
          onClick={() =>
            editando ? tocarCelulaEditando(x, y) : selecionar(elemento)
          }
          disabled={!editando && elemento.tipo !== 'classe'}
          aria-pressed={!editando && selecionada === elemento.ref}
          title={descricao}
        >
          <span aria-hidden="true">
            {elemento.tipo === 'classe'
              ? elemento.ref.replace(/^cl-/, '')
              : GLIFO_ELEMENTO[elemento.tipo]}
          </span>
          <span className="visualmente-oculto">{descricao}</span>
        </button>,
      );
    }
  }

  const selecionado = selecionada
    ? elementos.find((e) => e.ref === selecionada)
    : undefined;

  return (
    <section className="secao">
      <div className="secao__cabeca">
        <h2 className="secao__titulo">{editando ? 'Editando o desenho' : 'Planta'}</h2>
        <span className="secao__contagem">
          {contagem.total} classes
          {contagem.quebradas > 0 ? ` · ${contagem.quebradas} quebrada(s)` : ''}
          {contagem.faltando > 0 ? ` · ${contagem.faltando} faltando` : ''}
        </span>
      </div>

      {erro ? <p className="erro">{erro}</p> : null}

      {planta === null && editando ? (
        <p className="vazio">
          Esta sala ainda não tem planta. Escolha o tamanho do grid e vá tocando nas
          células para posicionar os elementos.
        </p>
      ) : null}

      {editando ? (
        <div className="planta__ferramentas nao-imprime">
          <label className="planta__medida">
            <span className="campo__rotulo">Colunas</span>
            <input
              className="campo__entrada"
              type="number"
              min={1}
              max={40}
              value={cols}
              onChange={(e) =>
                redimensionar(Math.min(40, Math.max(1, Number(e.target.value) || 1)), rows)
              }
            />
          </label>
          <label className="planta__medida">
            <span className="campo__rotulo">Linhas</span>
            <input
              className="campo__entrada"
              type="number"
              min={1}
              max={40}
              value={rows}
              onChange={(e) =>
                redimensionar(cols, Math.min(40, Math.max(1, Number(e.target.value) || 1)))
              }
            />
          </label>

          <div className="planta__paleta" role="group" aria-label="Ferramenta">
            {FERRAMENTAS.map((f) => (
              <button
                key={f.valor}
                type="button"
                className={`botao botao--discreto${
                  ferramenta === f.valor ? ' botao--selecionado' : ''
                }`}
                aria-pressed={ferramenta === f.valor}
                onClick={() => setFerramenta(f.valor)}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="planta__grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(1.75rem, 1fr))` }}
        role="group"
        aria-label={`Planta da sala, ${cols} por ${rows}`}
      >
        {celulas}
      </div>

      {!editando && selecionado ? (
        <div className="planta__painel">
          <p className="planta__painel-titulo">
            Classe <strong>{selecionado.ref}</strong> ·{' '}
            {ROTULO_STATUS_CLASSE[estados[selecionado.ref]?.status ?? 'ok']}
          </p>

          <input
            className="campo__entrada"
            type="text"
            placeholder="Observação (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />

          <div className="planta__acoes">
            {STATUS.map((s) => (
              <button
                key={s}
                type="button"
                className={`botao botao--discreto botao--${s}`}
                disabled={ocupado}
                onClick={() => marcar(s)}
              >
                {ROTULO_STATUS_CLASSE[s]}
              </button>
            ))}
          </div>

          <div className="planta__historico">
            <p className="sobrescrito">Histórico</p>
            {(linhas[selecionado.ref] ?? []).length === 0 ? (
              <p className="vazio">Nenhum registro para esta classe.</p>
            ) : (
              <ol className="linhas">
                {(linhas[selecionado.ref] ?? []).map((linha) => (
                  <li className="planta__registro" key={linha.registrado_em}>
                    <span className="planta__registro-data">
                      {dataHoraCurta(linha.registrado_em)}
                    </span>
                    <span className={`planta__registro-status planta__registro-status--${linha.status}`}>
                      {ROTULO_STATUS_CLASSE[linha.status]}
                    </span>
                    {linha.observacao ? (
                      <span className="planta__registro-nota">{linha.observacao}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}

      <div className="planta__rodape nao-imprime">
        {editando ? (
          <>
            <button type="button" className="botao" disabled={ocupado} onClick={gravarDesenho}>
              Salvar desenho
            </button>
            {planta !== null ? (
              <button
                type="button"
                className="botao botao--discreto"
                disabled={ocupado}
                onClick={descartarEdicao}
              >
                Descartar
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="botao botao--discreto"
            onClick={() => {
              setSelecionada(null);
              setEditando(true);
            }}
          >
            Editar desenho
          </button>
        )}
      </div>
    </section>
  );
}
