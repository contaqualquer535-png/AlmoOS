import Link from 'next/link';

import { buscarRoteiro, dataDeHoje } from '@/lib/data/consultas';
import { dataPorExtenso, plural } from '@/lib/formato';
import { BotaoImprimir } from '@/components/BotaoImprimir';

export const dynamic = 'force-dynamic';

/**
 * Roteiro de reparos, no formato do documento que o operador já usa.
 *
 * Três partes, na ordem em que ele precisa delas: o que separar antes de
 * sair, quais salas pular, e o que fazer em cada uma agrupado por bloco.
 *
 * A ordem dos blocos vem de `locais.ordem_bloco` e não dos dados: é
 * geografia do prédio, escolhida para não ir e voltar entre alas.
 */
export default async function PaginaRoteiro({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data } = await searchParams;
  const dia = data ?? dataDeHoje();
  const roteiro = await buscarRoteiro(dia);

  return (
    <>
      <div className="folha__cabeca">
        <div>
          <p className="sobrescrito">
            Checklist de materiais + ordem de visita por bloco
          </p>
          <h1 className="titulo">Roteiro de reparos — salas de aula</h1>
          <p className="vazio">
            {dataPorExtenso(dia)} · {plural(roteiro.total_pendencias, 'item', 'itens')} em{' '}
            {plural(roteiro.total_salas, 'sala', 'salas')}
          </p>
        </div>

        <div className="folha__acoes">
          <Link className="botao botao--discreto" href="/tarefas">
            Pendências
          </Link>
          <BotaoImprimir />
        </div>
      </div>

      {roteiro.total_pendencias === 0 ? (
        <p className="aviso aviso--ronda" style={{ marginTop: '1.5rem' }}>
          <span className="aviso__marcador">Livre</span>
          <span>Nenhuma pendência aberta. Não há reparo a fazer hoje.</span>
        </p>
      ) : null}

      {/* ---------- 1. O que levar ---------- */}
      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">1. Materiais e ferramentas a levar</h2>
          <span className="secao__contagem">separar antes de sair</span>
        </div>

        {roteiro.materiais.length === 0 ? (
          <p className="vazio">
            Nenhum material marcado. Em cada pendência, na tela de Pendências, diga o
            que precisa levar — é o que monta esta tabela.
          </p>
        ) : (
          <table className="tabela-roteiro">
            <thead>
              <tr>
                <th>Material / Ferramenta</th>
                <th className="tabela-roteiro__qtd">Qtd.</th>
                <th>Onde é usado</th>
              </tr>
            </thead>
            <tbody>
              {roteiro.materiais.map((m) => {
                // Só avisa quando o material é suprimento controlado e o
                // saldo não cobre: para ferramenta não faz sentido.
                const faltando =
                  m.e_suprimento && m.em_estoque !== null && m.em_estoque < m.quantidade;

                return (
                  <tr key={m.descricao}>
                    <td>
                      {m.descricao}
                      {faltando ? (
                        <span className="tabela-roteiro__falta">
                          só {m.em_estoque} em estoque
                        </span>
                      ) : null}
                    </td>
                    <td className="tabela-roteiro__qtd">
                      {m.quantidade} {m.unidade}
                    </td>
                    <td className="tabela-roteiro__onde">{m.onde}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {roteiro.salas_sem_pendencia.length > 0 ? (
          <p className="roteiro__dispensadas">
            Salas sem nenhuma pendência (não precisam de visita):{' '}
            {roteiro.salas_sem_pendencia.join(', ')}.
          </p>
        ) : null}
      </section>

      {/* ---------- 2. Roteiro de execução ---------- */}
      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">2. Roteiro de execução</h2>
        </div>

        {roteiro.blocos.map((bloco) => (
          <div className="roteiro__bloco" key={bloco.bloco ?? 'sem-bloco'}>
            <h3 className="roteiro__bloco-nome">{bloco.bloco ?? 'Sem bloco'}</h3>

            {bloco.salas.map((sala) => (
              <div className="roteiro__sala" key={sala.codigo}>
                <p className="roteiro__sala-nome">
                  <strong>{sala.codigo}</strong>
                  {sala.turmas.length > 0 ? (
                    <em className="roteiro__turma">{sala.turmas.join(', ')}</em>
                  ) : null}
                </p>

                <ul className="roteiro__itens">
                  {sala.itens.map((item, i) => (
                    <li className="roteiro__item" key={`${item.texto}-${i}`}>
                      <span className="risque" aria-hidden="true" />
                      <span>
                        {item.texto}
                        {item.dias >= 14 ? (
                          <span className="roteiro__idade"> · aberto há {item.dias} dias</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </section>

      <p className="folha__rodape">
        Conclua todas as tarefas de um bloco antes de seguir para o próximo — a ordem
        acima existe para evitar ir e voltar. Gerado em{' '}
        {new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'America/Sao_Paulo',
        }).format(new Date())}
        .
      </p>
    </>
  );
}
