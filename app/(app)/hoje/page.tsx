import Link from 'next/link';
import {
  buscarPlanoDoDia,
  buscarStatusDaRonda,
  buscarSuprimentos,
  buscarSerieDaRonda,
  buscarPendenciasPorBloco,
  buscarRelatorio,
  buscarPontosDeAtencao,
  buscarUltimoInsight,
  agruparPorBloco,
  dataDeHoje,
  semanaDe,
} from '@/lib/data/consultas';
import { dataPorExtenso, plural, quantidade } from '@/lib/formato';
import { Carimbo } from '@/components/Carimbo';
import { GraficoRonda } from '@/components/GraficoRonda';
import { BarrasPorBloco } from '@/components/BarrasPorBloco';
import { PontosDeAtencao } from '@/components/PontosDeAtencao';

// O plano muda ao longo do dia conforme a ronda entra.
export const dynamic = 'force-dynamic';

export default async function PaginaHoje() {
  const hoje = dataDeHoje();
  const semana = semanaDe(hoje);

  const [plano, ronda, suprimentos, serie, porBloco, daSemana, pontos, insight] =
    await Promise.all([
      buscarPlanoDoDia(hoje),
      buscarStatusDaRonda(),
      buscarSuprimentos(),
      buscarSerieDaRonda(30),
      buscarPendenciasPorBloco(),
      buscarRelatorio(semana.inicio, semana.fim),
      buscarPontosDeAtencao(),
      buscarUltimoInsight(),
    ]);

  const rondaPorBloco = agruparPorBloco(ronda);
  const faltamNaRonda = ronda.filter((l) => l.itens_registrados < l.itens_esperados).length;
  const criticos = suprimentos.filter((s) => s.abaixo_do_ponto);
  const emAberto = plano.pendencias.length;
  const antigas = plano.pendencias.filter((p) => p.dias_aberta >= 14).length;

  return (
    <>
      <p className="sobrescrito">{dataPorExtenso(hoje)}</p>
      <h1 className="titulo">Hoje</h1>

      {plano.e_dia_de_ronda ? (
        <p className="aviso aviso--ronda">
          <span className="aviso__marcador">Ronda</span>
          <span>
            {faltamNaRonda === 0
              ? 'Ronda do dia completa.'
              : `${plural(faltamNaRonda, 'sala falta', 'salas faltam')} para fechar a ronda.`}
          </span>
        </p>
      ) : (
        <p className="aviso aviso--folga">
          <span className="aviso__marcador">Sem ronda</span>
          <span>A ronda acontece às segundas, quartas e sextas.</span>
        </p>
      )}

      <div className="indicadores">
        <div className={`indicador${faltamNaRonda === 0 ? ' indicador--bom' : ''}`}>
          <span className="indicador__valor">
            {ronda.length - faltamNaRonda}/{ronda.length}
          </span>
          <span className="indicador__rotulo">salas lançadas hoje</span>
        </div>
        <div className={`indicador${antigas > 0 ? ' indicador--critico' : ''}`}>
          <span className="indicador__valor">{emAberto}</span>
          <span className="indicador__rotulo">
            pendências abertas{antigas > 0 ? ` · ${antigas} há 14+ dias` : ''}
          </span>
        </div>
        <div className={`indicador${criticos.length > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{criticos.length}</span>
          <span className="indicador__rotulo">suprimentos para repor</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">
            {plano.tarefas.length + plano.chamados.length}
          </span>
          <span className="indicador__rotulo">tarefas e chamados em aberto</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">
            {daSemana.ronda.cobertura !== null ? `${daSemana.ronda.cobertura}%` : '—'}
          </span>
          <span className="indicador__rotulo">cobertura da ronda na semana</span>
        </div>
      </div>

      <div className="painel">
        {/* Coluna principal: o que ainda precisa de ação hoje. */}
        <div>
          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Ronda</h2>
              <span className="secao__contagem">itens lançados por sala</span>
            </div>

            <div className="faixa">
              {rondaPorBloco.map(([bloco, salas]) => (
                <div className="faixa__bloco" key={bloco}>
                  <span className="faixa__rotulo">{bloco}</span>
                  <div className="faixa__azulejos">
                    {salas.map((sala) => {
                      const proporcao =
                        sala.itens_esperados > 0
                          ? Math.min(1, sala.itens_registrados / sala.itens_esperados)
                          : 0;
                      const completa = sala.itens_registrados >= sala.itens_esperados;

                      return (
                        <Link
                          className={`azulejo${completa ? ' azulejo--completo' : ''}`}
                          href={`/ronda/${encodeURIComponent(sala.codigo)}`}
                          key={sala.local_id}
                        >
                          <span
                            className="azulejo__preenchimento"
                            style={{ width: `${proporcao * 100}%` }}
                            aria-hidden="true"
                          />
                          <span className="azulejo__codigo">{sala.codigo}</span>
                          <span className="azulejo__fracao">
                            {sala.itens_registrados}/{sala.itens_esperados}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Pendências abertas</h2>
              <span className="secao__contagem">{emAberto}</span>
            </div>

            {emAberto === 0 ? (
              <p className="vazio">Nenhum item aguardando manutenção.</p>
            ) : (
              <ul className="linhas">
                {plano.pendencias.map((p) => (
                  <li className="linha" key={p.id}>
                    <Carimbo status="manutencao" />
                    <span className="linha__codigo">{p.local_codigo}</span>
                    <span className="linha__principal">
                      <span className="linha__titulo">{p.item}</span>
                      {p.observacao ? (
                        <span className="linha__nota">{p.observacao}</span>
                      ) : null}
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
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Tarefas e chamados</h2>
              <span className="secao__contagem">
                {plano.tarefas.length + plano.chamados.length}
              </span>
            </div>

            {plano.tarefas.length + plano.chamados.length === 0 ? (
              <p className="vazio">Nada em aberto.</p>
            ) : (
              <ul className="linhas">
                {plano.tarefas.map((t) => (
                  <li className="linha" key={t.id}>
                    <span className="linha__codigo">Tarefa</span>
                    <span className="linha__principal">
                      <span className="linha__titulo">{t.titulo}</span>
                      {t.observacao ? (
                        <span className="linha__nota">{t.observacao}</span>
                      ) : null}
                    </span>
                    <span className="linha__medida">
                      {t.status === 'em_andamento' ? 'em andamento' : 'pendente'}
                    </span>
                  </li>
                ))}
                {plano.chamados.map((c) => (
                  <li className="linha" key={c.id}>
                    <span className="linha__codigo">{c.destino}</span>
                    <span className="linha__principal">
                      <span className="linha__titulo">{c.titulo}</span>
                      <span className="linha__nota">
                        {c.status === 'rascunho'
                          ? 'ainda não enviado'
                          : c.status.replace('_', ' ')}
                      </span>
                    </span>
                    <span className={`etiqueta etiqueta--${c.prioridade}`}>
                      {c.prioridade}
                    </span>
                    <span className="linha__medida">
                      {plural(c.dias_aberto, 'dia', 'dias')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p style={{ marginTop: '2.5rem' }}>
            <Link className="botao" href="/plano">
              Abrir o plano do dia
            </Link>
          </p>
        </div>

        {/* Lateral: contexto e tendência. Nada aqui pede ação imediata,
            por isso fica fora da coluna principal. */}
        <aside className="painel__lateral">
          <PontosDeAtencao pontos={pontos} insight={insight} />

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Ronda nos 30 dias</h2>
            </div>
            <GraficoRonda serie={serie} />
          </section>

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Pendências por bloco</h2>
            </div>
            <BarrasPorBloco blocos={porBloco} />
          </section>

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Suprimentos</h2>
              <span className="secao__contagem">
                {criticos.length > 0 ? `${criticos.length} para repor` : 'ok'}
              </span>
            </div>

            {suprimentos.length === 0 ? (
              <p className="vazio">Nenhum suprimento cadastrado.</p>
            ) : (
              <ul className="linhas">
                {suprimentos.map((s) => (
                  <li className="linha" key={s.id}>
                    <span className="linha__principal">
                      <span className="linha__titulo">{s.nome}</span>
                      <span className="linha__nota">
                        {quantidade(s.quantidade_atual, s.unidade)}
                      </span>
                    </span>
                    <span
                      className={`linha__medida${
                        s.abaixo_do_ponto ? ' linha__medida--alerta' : ''
                      }`}
                    >
                      {s.abaixo_do_ponto
                        ? 'repor'
                        : s.dias_restantes !== null
                          ? `${s.dias_restantes} d`
                          : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Semana</h2>
            </div>
            <ul className="linhas">
              <li className="linha">
                <span className="linha__principal">Pendências abertas</span>
                <span className="linha__medida">
                  {daSemana.pendencias.abertas_no_periodo}
                </span>
              </li>
              <li className="linha">
                <span className="linha__principal">Resolvidas ou trocadas</span>
                <span className="linha__medida">
                  {daSemana.pendencias.resolvidas + daSemana.pendencias.trocadas}
                </span>
              </li>
              <li className="linha">
                <span className="linha__principal">Chamados abertos</span>
                <span className="linha__medida">{daSemana.chamados.abertos}</span>
              </li>
              <li className="linha">
                <span className="linha__principal">Tarefas concluídas</span>
                <span className="linha__medida">{daSemana.tarefas.concluidas}</span>
              </li>
            </ul>
            <p style={{ marginTop: '1rem' }}>
              <Link className="botao botao--discreto" href="/relatorios">
                Ver relatórios
              </Link>
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
