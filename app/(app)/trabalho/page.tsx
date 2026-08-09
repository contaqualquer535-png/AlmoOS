import Link from 'next/link';

import {
  buscarPendenciasComMateriais,
  buscarTarefasEChamados,
  buscarOpcoesDeAcaoRapida,
  buscarLocaisParaSelecao,
  agruparPorBloco,
} from '@/lib/data/consultas';
import { dataCurta, plural } from '@/lib/formato';
import { Carimbo } from '@/components/Carimbo';
import { MateriaisDaPendencia } from '@/components/MateriaisDaPendencia';
import { PainelTarefas } from '@/components/PainelTarefas';
import { TAREFAS_ABERTAS } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

/**
 * Tudo que é trabalho seu, numa tela.
 *
 * Pendência e tarefa continuam sendo tabelas diferentes, e devem
 * continuar: pendência é derivada da ronda por trigger e você não pode
 * criar nem apagar; tarefa é sua e você faz o que quiser. Unificá-las
 * significaria perder a derivação automática, ou ter metade da lista
 * imutável sem explicação visível.
 *
 * Mas na tela elas respondem a mesma pergunta — o que eu tenho que
 * fazer — e por isso aparecem juntas. Chamado saiu daqui: ele não é
 * trabalho seu, é trâmite de terceiro, e o ciclo de vida diferente é o
 * que a decisão 03 do ADR registra.
 */
export default async function PaginaTrabalho() {
  const [pendencias, { tarefas, locais }, opcoes, ambientes] = await Promise.all([
    buscarPendenciasComMateriais(),
    buscarTarefasEChamados(false),
    buscarOpcoesDeAcaoRapida(),
    buscarLocaisParaSelecao(),
  ]);

  const abertas = tarefas.filter((t) =>
    (TAREFAS_ABERTAS as readonly string[]).includes(t.status),
  );

  const porBloco = agruparPorBloco(pendencias);
  const antigas = pendencias.filter((p) => p.dias_aberta >= 14);
  const semMaterial = pendencias.filter((p) => p.materiais.length === 0);
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidas = abertas.filter((t) => t.prazo !== null && t.prazo < hoje);

  return (
    <>
      <p className="sobrescrito">O que depende de você</p>
      <h1 className="titulo">Trabalho</h1>

      <div className="indicadores">
        <div className={`indicador${antigas.length > 0 ? ' indicador--critico' : ''}`}>
          <span className="indicador__valor">{pendencias.length}</span>
          <span className="indicador__rotulo">
            pendências{antigas.length > 0 ? ` · ${antigas.length} há 14+ dias` : ''}
          </span>
        </div>
        <div className={`indicador${vencidas.length > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{abertas.length}</span>
          <span className="indicador__rotulo">
            tarefas{vencidas.length > 0 ? ` · ${vencidas.length} vencidas` : ''}
          </span>
        </div>
        <div className={`indicador${semMaterial.length > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{semMaterial.length}</span>
          <span className="indicador__rotulo">sem material marcado</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">
            {new Set(pendencias.map((p) => p.local_codigo)).size}
          </span>
          <span className="indicador__rotulo">salas a visitar</span>
        </div>
      </div>

      <p
        className="nao-imprime"
        style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
      >
        <Link className="botao" href="/roteiro">
          Roteiro de reparos
        </Link>
        <Link className="botao botao--discreto" href="/chamados">
          Chamados ao SERVi
        </Link>
        <Link className="botao botao--discreto" href="/notas">
          Anotações
        </Link>
      </p>

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Tarefas</h2>
          <span className="secao__contagem">{abertas.length}</span>
        </div>
        <PainelTarefas tarefas={abertas} locais={locais} ambientes={ambientes} />
      </section>

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Pendências da ronda</h2>
          <span className="secao__contagem">
            nascem do M no checklist · {pendencias.length}
          </span>
        </div>

        {pendencias.length === 0 ? (
          <p className="vazio">Nenhuma pendência aberta.</p>
        ) : null}

        {porBloco.map(([bloco, doBloco]) => (
          <div key={bloco}>
            <p className="rotulo-de-grupo">
              {bloco} · {plural(doBloco.length, 'item', 'itens')}
            </p>

            <ul className="linhas">
              {doBloco.map((p) => (
                <li className="item-trabalho" key={p.id}>
                  <div className="item-trabalho__linha">
                    <Carimbo status="manutencao" />
                    <span className="linha__codigo">
                      <Link href={`/salas/${encodeURIComponent(p.local_codigo)}`}>
                        {p.local_codigo}
                      </Link>
                    </span>

                    <span className="item-trabalho__titulo">
                      {p.item}
                      <span className="linha__nota">
                        {p.observacao ?? 'sem observação'} · desde{' '}
                        {dataCurta(p.aberta_em)}
                        {p.tem_chamado_aberto ? ' · tem chamado' : ''}
                      </span>
                    </span>

                    <span
                      className={`linha__medida${
                        p.dias_aberta >= 14
                          ? ' linha__medida--critico'
                          : p.dias_aberta >= 7
                            ? ' linha__medida--alerta'
                            : ''
                      }`}
                    >
                      {plural(p.dias_aberta, 'dia', 'dias')}
                    </span>
                  </div>

                  <MateriaisDaPendencia
                    pendenciaId={p.id}
                    materiais={p.materiais}
                    suprimentos={opcoes.suprimentos}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
