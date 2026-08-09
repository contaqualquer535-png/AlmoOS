import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buscarHistoricoDoLocal } from '@/lib/data/consultas';
import { dataCurta, plural } from '@/lib/formato';
import { ROTULO_EVENTO, type TipoDeEvento } from '@/lib/types/database';
import { SerieDeContagem } from '@/components/SerieDeContagem';

export const dynamic = 'force-dynamic';

/** Marcas de cor por natureza do evento, não por gravidade. */
const COR_DO_EVENTO: Record<TipoDeEvento, string> = {
  ronda: 'evento--ronda',
  pendencia: 'evento--pendencia',
  chamado: 'evento--chamado',
  tarefa: 'evento--tarefa',
  inventario: 'evento--inventario',
  recurso: 'evento--recurso',
  classe: 'evento--classe',
};

const ROTULO_SUBTIPO: Record<string, string> = {
  ok: '✓',
  manutencao: 'M',
  resolvido: 'X',
  trocado: 'T',
  aberta: 'abriu',
  fechada: 'fechou',
  emprestimo: 'saiu',
  devolucao: 'voltou',
  transferencia: 'mudou',
  retirada: 'levaram',
  quebrada: 'quebrou',
  faltando: 'sumiu',
};

/**
 * A linha do tempo de um ambiente.
 *
 * Responde a pergunta que nenhuma tela isolada respondia: "em 01/08
 * havia 30 mesas, em 03/08 havia 29 — o que aconteceu no meio?". Ronda,
 * pendência, troca, chamado e movimentação vinham de tabelas
 * diferentes, e cruzá-las era trabalho de cabeça.
 */
export default async function PaginaHistoricoDaSala({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ dias?: string }>;
}) {
  const { codigo } = await params;
  const { dias } = await searchParams;
  const janela = Number(dias) || 180;

  const historico = await buscarHistoricoDoLocal(decodeURIComponent(codigo), janela);

  if (!historico.local) notFound();

  const { local, eventos, contagens } = historico;
  const porTipo = (t: TipoDeEvento) => eventos.filter((e) => e.tipo === t).length;

  // Agrupa por dia preservando a ordem, que já vem do mais recente.
  const dias_agrupados: Array<[string, typeof eventos]> = [];
  for (const evento of eventos) {
    const ultimo = dias_agrupados[dias_agrupados.length - 1];
    if (ultimo && ultimo[0] === evento.quando) ultimo[1].push(evento);
    else dias_agrupados.push([evento.quando, [evento]]);
  }

  return (
    <>
      <p className="sobrescrito">{local.bloco ?? 'CETEC'} · últimos {janela} dias</p>
      <h1 className="titulo">{local.codigo}</h1>
      {local.nome ? <p className="vazio">{local.nome}</p> : null}

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador__valor">{eventos.length}</span>
          <span className="indicador__rotulo">registros no período</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{porTipo('pendencia')}</span>
          <span className="indicador__rotulo">aberturas e encerramentos</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{porTipo('chamado')}</span>
          <span className="indicador__rotulo">chamados</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{porTipo('ronda')}</span>
          <span className="indicador__rotulo">lançamentos de ronda</span>
        </div>
      </div>

      <p className="nao-imprime" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link className="botao botao--discreto" href={`/ronda/${encodeURIComponent(local.codigo)}`}>
          Lançar ronda
        </Link>
        <Link className="botao botao--discreto" href={`/planta/${encodeURIComponent(local.codigo)}`}>
          Planta
        </Link>
        <Link className="botao botao--discreto" href={`/salas/${encodeURIComponent(local.codigo)}?dias=30`}>
          30 dias
        </Link>
        <Link className="botao botao--discreto" href={`/salas/${encodeURIComponent(local.codigo)}?dias=365`}>
          1 ano
        </Link>
      </p>

      <div className="painel">
        <div>
          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Linha do tempo</h2>
              <span className="secao__contagem">
                {plural(dias_agrupados.length, 'dia com registro', 'dias com registro')}
              </span>
            </div>

            {eventos.length === 0 ? (
              <p className="vazio">
                Nenhum registro nos últimos {janela} dias. Se a sala é nova no sistema,
                o histórico começa na primeira ronda.
              </p>
            ) : (
              <ol className="tempo">
                {dias_agrupados.map(([quando, doDia]) => (
                  <li className="tempo__dia" key={quando}>
                    <p className="tempo__data">{dataCurta(quando)}</p>

                    <ul className="tempo__eventos">
                      {doDia.map((evento, i) => (
                        <li
                          className={`evento ${COR_DO_EVENTO[evento.tipo]}`}
                          key={`${evento.tipo}-${evento.titulo}-${i}`}
                        >
                          <span className="evento__tipo">{ROTULO_EVENTO[evento.tipo]}</span>
                          <span className="evento__corpo">
                            <span className="evento__titulo">
                              {evento.titulo}
                              {ROTULO_SUBTIPO[evento.subtipo] ? (
                                <span className="evento__subtipo">
                                  {ROTULO_SUBTIPO[evento.subtipo]}
                                </span>
                              ) : null}
                            </span>
                            {evento.detalhe ? (
                              <span className="linha__nota">{evento.detalhe}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="painel__lateral">
          <section className="secao" style={{ marginTop: 0 }}>
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Contagem ao longo do tempo</h2>
            </div>

            {Object.keys(contagens).length === 0 ? (
              <p className="vazio">
                Nenhuma contagem registrada. Mesas e cadeiras pedem quantidade na
                ronda — o gráfico aparece a partir da segunda contagem.
              </p>
            ) : (
              Object.entries(contagens).map(([item, serie]) => (
                <SerieDeContagem key={item} rotulo={item} serie={serie} />
              ))
            )}
          </section>
        </aside>
      </div>

      <p className="nao-imprime" style={{ marginTop: '2rem' }}>
        <Link className="botao botao--discreto" href="/salas">
          Voltar para as salas
        </Link>
      </p>
    </>
  );
}
