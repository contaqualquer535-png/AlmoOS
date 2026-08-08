'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { lerCsvComCabecalho, lerData } from '@/lib/csv';
import {
  importarChamados,
  importarPatrimonio,
  importarRondaHistorica,
  type ResultadoDaImportacao,
} from '@/lib/data/importacao';

type Origem = 'patrimonio' | 'ronda' | 'chamados';

interface Formato {
  rotulo: string;
  colunas: string[];
  exemplo: string;
  explicacao: string;
}

/**
 * O cabeçalho é normalizado antes da comparação (minúsculo, sem acento,
 * espaço vira sublinhado), então "Código de Barras" e "codigo_barras"
 * são a mesma coluna. A planilha é digitada por gente.
 */
const FORMATOS: Record<Origem, Formato> = {
  patrimonio: {
    rotulo: 'Patrimônio',
    colunas: ['codigo_barras', 'item', 'descricao', 'local'],
    exemplo:
      'codigo_barras,item,descricao,local\nUCS-000123,Projetor Epson,Sala C-212,ALMOX\nUCS-000124,Notebook Dell,,ALMOX',
    explicacao:
      'Reimportar a mesma planilha atualiza pelo patrimônio em vez de duplicar. Item sem código de barras não tem essa proteção. Sem a coluna "local", tudo vai para o ALMOX.',
  },
  ronda: {
    rotulo: 'Ronda em papel',
    colunas: ['data', 'sala', 'item', 'status', 'observacao'],
    exemplo:
      'data,sala,item,status,observacao\n06/08/2026,C-212,Projetor,M,lâmpada queimada\n08/08/2026,C-212,Projetor,T,\n06/08/2026,K-306,Cadeiras,✓,',
    explicacao:
      'Status aceita ✓, M, X, T ou os nomes por extenso. O nome do item precisa bater com o checklist. As linhas entram em ordem de data para as pendências abrirem e fecharem certo.',
  },
  chamados: {
    rotulo: 'Chamados do SERVi',
    colunas: ['chamado', 'titulo', 'estado', 'fila', 'idade', 'sala'],
    exemplo:
      'chamado\ttitulo\testado\tfila\tidade\n001538977\tServiços de Lavanderia\taberto\tGLOG::STATE::Lavanderia\t1 d 9 h 29 m\n001538151\tConserto de Portas\taberto\tGLOG::SMGE::Manutenção\t2 d 7 h 4 m',
    explicacao:
      'Selecione a lista em "Meus Chamados" no SERVi e cole aqui — copiar de tabela do navegador gera colunas por tabulação, e o leitor reconhece. A coluna FILA vira o destino do chamado, e IDADE é convertida em data de abertura. "sala" é opcional e você acrescenta à mão.',
  },
};

export function Importador() {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [origem, setOrigem] = useState<Origem>('patrimonio');
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<ResultadoDaImportacao | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const formato = FORMATOS[origem];

  const linhas = useMemo(() => {
    if (!texto.trim()) return [];
    try {
      return lerCsvComCabecalho(texto);
    } catch {
      return [];
    }
  }, [texto]);

  const colunasFaltando = useMemo(() => {
    const primeira = linhas[0];
    if (!primeira) return [];
    const presentes = new Set(Object.keys(primeira));
    // 'descricao' e 'observacao' são opcionais; as demais, não.
    const OPCIONAIS = new Set(['descricao', 'observacao', 'protocolo', 'sala', 'idade', 'fila']);
    const obrigatorias = formato.colunas.filter((c) => !OPCIONAIS.has(c));
    return obrigatorias.filter((c) => !presentes.has(c));
  }, [linhas, formato]);

  async function importar() {
    setOcupado(true);
    setResultado(null);

    let saida: ResultadoDaImportacao;

    if (origem === 'patrimonio') {
      saida = await importarPatrimonio(
        linhas.map((l) => ({
          codigo_barras: l.codigo_barras ?? '',
          item: l.item ?? '',
          descricao: l.descricao ?? '',
          local: l.local ?? '',
        })),
      );
    } else if (origem === 'ronda') {
      saida = await importarRondaHistorica(
        linhas.map((l) => ({
          // A conversão de data acontece aqui, no cliente, porque é o
          // único lugar que sabe que a planilha é brasileira.
          data: lerData(l.data ?? '') ?? '',
          sala: l.sala ?? '',
          item: l.item ?? '',
          status: l.status ?? '',
          observacao: l.observacao ?? '',
        })),
      );
    } else {
      saida = await importarChamados(
        linhas.map((l) => ({
          // 'chamado' é como o SERVi nomeia a coluna; 'protocolo' fica
          // aceito para quem montar a planilha à mão.
          protocolo: l.chamado ?? l.protocolo ?? '',
          titulo: l.titulo ?? '',
          sala: l.sala ?? '',
          prioridade: l.prioridade ?? '',
          estado: l.estado ?? '',
          fila: l.fila ?? '',
          idade: l.idade ?? '',
          aberto_em: lerData(l.aberto_em ?? '') ?? '',
        })),
      );
    }

    setResultado(saida);
    setOcupado(false);

    if (saida.importadas > 0) {
      setTexto('');
      iniciarTransicao(() => router.refresh());
    }
  }

  async function lerArquivo(arquivo: File) {
    setTexto(await arquivo.text());
    setResultado(null);
  }

  return (
    <>
      <div className="planta__paleta nao-imprime" role="group" aria-label="O que importar">
        {(Object.keys(FORMATOS) as Origem[]).map((chave) => (
          <button
            key={chave}
            type="button"
            className={`botao botao--discreto${origem === chave ? ' botao--selecionado' : ''}`}
            aria-pressed={origem === chave}
            onClick={() => {
              setOrigem(chave);
              setResultado(null);
            }}
          >
            {FORMATOS[chave].rotulo}
          </button>
        ))}
      </div>

      <div className="painel">
        <div>
          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Colar ou escolher arquivo</h2>
              {linhas.length > 0 ? (
                <span className="secao__contagem">{linhas.length} linhas</span>
              ) : null}
            </div>

            <input
              className="campo__entrada nao-imprime"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void lerArquivo(arquivo);
              }}
              style={{ marginBottom: '0.75rem' }}
            />

            <textarea
              className="campo__entrada importador__area"
              placeholder={formato.exemplo}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setResultado(null);
              }}
              spellCheck={false}
            />

            {colunasFaltando.length > 0 ? (
              <p className="erro">
                Faltam colunas: {colunasFaltando.join(', ')}. A primeira linha precisa ser
                o cabeçalho.
              </p>
            ) : null}

            {linhas.length > 0 && colunasFaltando.length === 0 ? (
              <>
                <div className="secao__cabeca">
                  <h3 className="secao__titulo">Prévia</h3>
                  <span className="secao__contagem">primeiras 5</span>
                </div>

                <div className="importador__previa">
                  <table>
                    <thead>
                      <tr>
                        {formato.colunas.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.slice(0, 5).map((linha, i) => (
                        <tr key={i}>
                          {formato.colunas.map((c) => (
                            <td key={c}>{linha[c] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  className="botao"
                  type="button"
                  disabled={ocupado}
                  onClick={importar}
                  style={{ marginTop: '1rem' }}
                >
                  {ocupado ? 'Importando…' : `Importar ${linhas.length} linhas`}
                </button>
              </>
            ) : null}

            {resultado ? (
              <div className="secao">
                <div className="secao__cabeca">
                  <h3 className="secao__titulo">Resultado</h3>
                </div>

                <p className={resultado.importadas > 0 ? 'vazio' : 'erro'}>
                  {resultado.importadas} linha(s) importada(s)
                  {resultado.problemas.length > 0
                    ? `, ${resultado.problemas.length} com problema`
                    : ''}
                  .
                </p>

                {resultado.mensagem ? <p className="erro">{resultado.mensagem}</p> : null}

                {resultado.problemas.length > 0 ? (
                  <ul className="linhas">
                    {resultado.problemas.slice(0, 30).map((p) => (
                      <li className="linha" key={p.linha}>
                        <span className="linha__codigo">linha {p.linha}</span>
                        <span className="linha__principal">{p.motivo}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>

        <aside className="painel__lateral">
          <section className="secao" style={{ marginTop: 0 }}>
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Formato esperado</h2>
            </div>

            <p className="vazio">{formato.explicacao}</p>

            <pre className="importador__exemplo">{formato.exemplo}</pre>

            <p className="vazio">
              Aceita vírgula ou ponto e vírgula como separador — o Excel em português
              usa ponto e vírgula. Datas podem vir como 06/08/2026 ou 2026-08-06.
              Acento e maiúscula no cabeçalho não importam.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
