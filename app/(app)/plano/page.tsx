import { notFound } from 'next/navigation';
import { buscarPlanoDoDia, agruparPorBloco, dataDeHoje } from '@/lib/data/consultas';
import { dataPorExtenso, dataCurta, plural, quantidade, ehDataIso } from '@/lib/formato';
import { BotaoImprimir } from '@/components/BotaoImprimir';

export const dynamic = 'force-dynamic';

/**
 * Folha de trabalho do dia. Existe para ser impressa e carregada na ronda,
 * então tudo que é ação tem um quadrado para riscar a caneta.
 * ?data=YYYY-MM-DD reconstrói o plano de um dia passado.
 */
export default async function PaginaPlano({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data: dataPedida } = await searchParams;

  if (dataPedida !== undefined && !ehDataIso(dataPedida)) {
    notFound();
  }

  const data = dataPedida ?? dataDeHoje();
  const plano = await buscarPlanoDoDia(data);
  const pendenciasPorBloco = agruparPorBloco(plano.pendencias);
  const rondaPorBloco = agruparPorBloco(plano.locais_pendentes_de_ronda);

  const materiais = plano.suprimentos_criticos;

  return (
    <>
      <header className="folha__cabeca">
        <div>
          <p className="sobrescrito">Plano do dia · CETEC / UCS</p>
          <h1 className="titulo">{dataPorExtenso(data)}</h1>
        </div>
        <div className="folha__acoes">
          <BotaoImprimir />
        </div>
      </header>

      {plano.e_dia_de_ronda ? null : (
        <p className="aviso aviso--folga">
          <span className="aviso__marcador">Sem ronda</span>
          <span>Hoje não é dia de ronda — a lista abaixo é só o que já estava aberto.</span>
        </p>
      )}

      {plano.e_dia_de_ronda && rondaPorBloco.length > 0 ? (
        <section className="secao">
          <div className="secao__cabeca">
            <h2 className="secao__titulo">Ronda</h2>
            <span className="secao__contagem">
              {plural(plano.locais_pendentes_de_ronda.length, 'sala', 'salas')}
            </span>
          </div>
          <div className="faixa">
            {rondaPorBloco.map(([bloco, salas]) => (
              <div className="faixa__bloco" key={bloco}>
                <span className="faixa__rotulo">{bloco}</span>
                <div className="faixa__azulejos">
                  {salas.map((sala) => (
                    <div className="azulejo" key={sala.codigo}>
                      <span className="azulejo__codigo">{sala.codigo}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">O que precisa de atenção</h2>
          <span className="secao__contagem">
            {plural(plano.pendencias.length, 'item', 'itens')}
          </span>
        </div>

        {plano.pendencias.length === 0 ? (
          <p className="vazio">Nenhuma pendência aberta.</p>
        ) : (
          pendenciasPorBloco.map(([bloco, pendencias]) => (
            <div key={bloco} style={{ marginBottom: '1.25rem' }}>
              <p className="sobrescrito">{bloco}</p>
              <ul className="linhas">
                {pendencias.map((p) => (
                  <li className="linha" key={p.id}>
                    <span className="risque" aria-hidden="true" />
                    <span className="linha__codigo">{p.local_codigo}</span>
                    <span className="linha__principal">
                      <span className="linha__titulo">{p.item}</span>
                      {p.observacao ? (
                        <span className="linha__nota">{p.observacao}</span>
                      ) : null}
                    </span>
                    <span
                      className={`linha__medida${
                        p.dias_aberta >= 14 ? ' linha__medida--critico' : ''
                      }`}
                    >
                      aberto desde {dataCurta(p.aberta_em)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Levar</h2>
          <span className="secao__contagem">
            {plural(materiais.length, 'item', 'itens')}
          </span>
        </div>

        {materiais.length === 0 ? (
          <p className="vazio">Nada abaixo do ponto de reposição.</p>
        ) : (
          <ul className="linhas">
            {materiais.map((s) => (
              <li className="linha" key={s.nome}>
                <span className="risque" aria-hidden="true" />
                <span className="linha__principal">
                  <span className="linha__titulo">{s.nome}</span>
                </span>
                <span className="linha__medida linha__medida--alerta">
                  {quantidade(s.quantidade_atual, s.unidade)} · repor a partir de{' '}
                  {quantidade(s.ponto_reposicao, s.unidade)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {plano.tarefas.length > 0 ? (
        <section className="secao">
          <div className="secao__cabeca">
            <h2 className="secao__titulo">Tarefas</h2>
            <span className="secao__contagem">{plano.tarefas.length}</span>
          </div>
          <ul className="linhas">
            {plano.tarefas.map((t) => (
              <li className="linha" key={t.id}>
                <span className="risque" aria-hidden="true" />
                <span className="linha__principal">
                  <span className="linha__titulo">{t.titulo}</span>
                  {t.observacao ? <span className="linha__nota">{t.observacao}</span> : null}
                </span>
                <span className="linha__medida">
                  {t.prazo ? `até ${dataCurta(t.prazo)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plano.chamados.length > 0 ? (
        <section className="secao">
          <div className="secao__cabeca">
            <h2 className="secao__titulo">Chamados em aberto</h2>
            <span className="secao__contagem">{plano.chamados.length}</span>
          </div>
          <ul className="linhas">
            {plano.chamados.map((c) => (
              <li className="linha" key={c.id}>
                <span className="linha__codigo">{c.destino}</span>
                <span className="linha__principal">
                  <span className="linha__titulo">{c.titulo}</span>
                </span>
                <span className={`etiqueta etiqueta--${c.prioridade}`}>{c.prioridade}</span>
                <span className="linha__medida">
                  {plural(c.dias_aberto, 'dia', 'dias')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="folha__rodape">
        Gerado em {dataCurta(dataDeHoje())} · Gestão CETEC
      </footer>
    </>
  );
}
