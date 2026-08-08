'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { cadastrarItem, movimentarItem } from '@/lib/data/mutacoes';
import { dataCurta } from '@/lib/formato';
import type { ItemInventario, TipoMovimentacaoInventario } from '@/lib/types/database';
import type { LocalBasico } from '@/lib/data/consultas';

export function PainelInventario({
  itens,
  locais,
  ambientes,
  almoxarifadoId,
  hoje,
}: {
  itens: ItemInventario[];
  locais: Record<string, string>;
  ambientes: LocalBasico[];
  almoxarifadoId: string | null;
  hoje: string;
}) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [aberto, setAberto] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoMovimentacaoInventario>('emprestimo');
  const [destinoId, setDestinoId] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [previsao, setPrevisao] = useState('');

  const [novoItem, setNovoItem] = useState('');
  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoLocal, setNovoLocal] = useState(almoxarifadoId ?? '');

  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /**
   * Abrir o painel já com a ação provável escolhida: item emprestado
   * quase sempre vai ser devolvido, item parado quase sempre vai ser
   * emprestado. Erra pouco e poupa dois cliques por item.
   */
  function alternar(item: ItemInventario) {
    if (aberto === item.id) {
      setAberto(null);
      return;
    }
    setAberto(item.id);
    setErro(null);
    setResponsavel('');
    setPrevisao('');

    if (item.emprestado) {
      setTipo('devolucao');
      setDestinoId(item.local_padrao_id);
    } else {
      setTipo('emprestimo');
      setDestinoId('');
    }
  }

  function trocarTipo(item: ItemInventario, novo: TipoMovimentacaoInventario) {
    setTipo(novo);
    setDestinoId(novo === 'devolucao' ? item.local_padrao_id : '');
  }

  async function registrar(item: ItemInventario) {
    setOcupado(true);
    setErro(null);

    const resultado = await movimentarItem({
      inventarioId: item.id,
      tipo,
      localDestinoId: destinoId,
      responsavel: responsavel || undefined,
      previsaoDevolucao: previsao || undefined,
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'A movimentação não foi registrada.');
      return;
    }

    setAberto(null);
    iniciarTransicao(() => router.refresh());
  }

  async function cadastrar(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);

    const resultado = await cadastrarItem({
      item: novoItem,
      codigoBarras: novoCodigo || undefined,
      localPadraoId: novoLocal,
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'O item não foi cadastrado.');
      return;
    }

    setNovoItem('');
    setNovoCodigo('');
    iniciarTransicao(() => router.refresh());
  }

  return (
    <>
      {erro ? <p className="erro">{erro}</p> : null}

      <form className="formulario-curto nao-imprime" onSubmit={cadastrar}>
        <input
          className="campo__entrada"
          type="text"
          placeholder="Novo item"
          value={novoItem}
          onChange={(e) => setNovoItem(e.target.value)}
          required
        />
        <input
          className="campo__entrada formulario-curto__estreito"
          type="text"
          placeholder="Patrimônio"
          value={novoCodigo}
          onChange={(e) => setNovoCodigo(e.target.value)}
          aria-label="Código de barras"
        />
        <select
          className="campo__entrada formulario-curto__estreito"
          value={novoLocal}
          onChange={(e) => setNovoLocal(e.target.value)}
          aria-label="Local padrão"
          required
        >
          <option value="">Local padrão</option>
          {ambientes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.codigo}
            </option>
          ))}
        </select>
        <button className="botao" type="submit" disabled={ocupado || !novoItem.trim()}>
          Cadastrar
        </button>
      </form>

      {itens.length === 0 ? (
        <p className="vazio">Nenhum item com esse filtro.</p>
      ) : (
        <ul className="linhas">
          {itens.map((item) => {
            const atrasado =
              item.emprestado &&
              item.previsao_devolucao !== null &&
              item.previsao_devolucao < hoje;

            return (
              <li className="item-trabalho" key={item.id}>
                <div className="item-trabalho__linha">
                  {item.codigo_barras ? (
                    <span className="linha__codigo">{item.codigo_barras}</span>
                  ) : null}

                  <span className="item-trabalho__titulo">
                    {item.item}
                    <span className="item-trabalho__local">
                      {locais[item.local_atual_id] ?? '—'}
                    </span>
                  </span>

                  {item.emprestado ? (
                    <span className={`linha__medida${atrasado ? ' linha__medida--critico' : ''}`}>
                      {item.responsavel}
                      {item.previsao_devolucao
                        ? ` · devolver ${dataCurta(item.previsao_devolucao)}`
                        : ''}
                    </span>
                  ) : (
                    <span className="linha__medida">no lugar</span>
                  )}

                  <button
                    type="button"
                    className="botao botao--discreto"
                    onClick={() => alternar(item)}
                    aria-expanded={aberto === item.id}
                  >
                    {aberto === item.id ? 'Fechar' : 'Movimentar'}
                  </button>

                  <Link className="item-trabalho__historico" href={`/inventario/${item.id}`}>
                    Histórico
                  </Link>
                </div>

                {aberto === item.id ? (
                  <div className="formulario-curto" style={{ marginTop: '0.75rem' }}>
                    <select
                      className="campo__entrada formulario-curto__estreito"
                      value={tipo}
                      onChange={(e) =>
                        trocarTipo(item, e.target.value as TipoMovimentacaoInventario)
                      }
                      aria-label="Tipo de movimentação"
                    >
                      <option value="emprestimo">Emprestar</option>
                      <option value="devolucao">Devolver</option>
                      <option value="transferencia">Transferir</option>
                    </select>

                    <select
                      className="campo__entrada formulario-curto__estreito"
                      value={destinoId}
                      onChange={(e) => setDestinoId(e.target.value)}
                      aria-label="Destino"
                      required
                    >
                      <option value="">Destino</option>
                      {ambientes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.codigo}
                        </option>
                      ))}
                    </select>

                    {tipo === 'emprestimo' ? (
                      <>
                        <input
                          className="campo__entrada"
                          type="text"
                          placeholder="Responsável"
                          value={responsavel}
                          onChange={(e) => setResponsavel(e.target.value)}
                          required
                        />
                        <input
                          className="campo__entrada formulario-curto__estreito"
                          type="date"
                          value={previsao}
                          onChange={(e) => setPrevisao(e.target.value)}
                          aria-label="Previsão de devolução"
                        />
                      </>
                    ) : null}

                    <button
                      type="button"
                      className="botao"
                      disabled={ocupado || !destinoId}
                      onClick={() => registrar(item)}
                    >
                      Registrar
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
