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
  buscarContagemDeMobiliario,
  buscarRecursos,
  buscarPainel,
  buscarPrevisoes,
  agruparPorBloco,
  dataDeHoje,
  semanaDe,
} from '@/lib/data/consultas';
import { dataCurta, dataPorExtenso, plural, quantidade } from '@/lib/formato';
import { Carimbo } from '@/components/Carimbo';
import { GraficoRonda } from '@/components/GraficoRonda';
import { BarrasPorBloco } from '@/components/BarrasPorBloco';
import { BarrasCompactas } from '@/components/BarrasCompactas';
import { BarrasSemanais } from '@/components/BarrasSemanais';
import { PontosDeAtencao } from '@/components/PontosDeAtencao';
import { Rosca } from '@/components/Rosca';
import { CartaoPrevisoes } from '@/components/CartaoPrevisoes';

export const dynamic = 'force-dynamic';

/**
 * Painel de controle.
 *
 * Organizado como mosaico e não como página: cada assunto tem cartão de
 * altura fixa que rola por dentro. A consequência que importa é que a
 * posição de cada coisa não muda conforme os dados crescem — dez
 * pendências ou cinquenta, o cartão de suprimentos continua no mesmo
 * lugar, e o olho aprende onde procurar.
 */
export default async function PaginaHoje() {
  const hoje = dataDeHoje();
  const semana = semanaDe(hoje);

  const [
    plano,
    ronda,
    suprimentos,
    serie,
    porBloco,
    daSemana,
    pontos,
    insight,
    mobiliario,
    recursos,
    painel,
    previsoes,
  ] = await Promise.all([
    buscarPlanoDoDia(hoje),
    buscarStatusDaRonda(),
    buscarSuprimentos(),
    buscarSerieDaRonda(30),
    buscarPendenciasPorBloco(),
    buscarRelatorio(semana.inicio, semana.fim),
    buscarPontosDeAtencao(),
    buscarUltimoInsight(),
    buscarContagemDeMobiliario(),
    buscarRecursos(),
    buscarPainel(90),
    buscarPrevisoes(),
  ]);

  const rondaPorBloco = agruparPorBloco(ronda);
  const faltamNaRonda = ronda.filter((l) => l.itens_registrados < l.itens_esperados).length;
  const criticos = suprimentos.filter((s) => s.abaixo_do_ponto);
  const emAberto = plano.pendencias.length;
  const antigas = plano.pendencias.filter((p) => p.dias_aberta >= 14).length;

  const recursosFora = recursos.recursos.reduce((s, r) => s + r.quantidade_emprestada, 0);
  const recursosVencidos = recursos.recursos.reduce((s, r) => s + r.retiradas_atrasadas, 0);
  const foraDeOrdem = mobiliario.classes_quebradas + mobiliario.classes_faltando;

  const estadoDasClasses = [
    { rotulo: 'Em ordem', valor: mobiliario.classes_em_ordem, cor: 'var(--verde)' },
    { rotulo: 'Quebradas', valor: mobiliario.classes_quebradas, cor: 'var(--tijolo)' },
    { rotulo: 'Faltando', valor: mobiliario.classes_faltando, cor: 'var(--ambar)' },
  ];

  const cadeiras = painel.contagem_atual['Cadeiras'] ?? 0;
  const mesas = painel.contagem_atual['Mesas'] ?? 0;

  const ROTULO_VENCIMENTO: Record<string, string> = {
    recurso: 'REC',
    tarefa: 'TAR',
    inventario: 'INV',
    suprimento: 'EST',
  };

  const idade = painel.idade_pendencias;
  const faixasDeIdade = [
    { rotulo: '0–7 dias', valor: idade.ate_7 },
    { rotulo: '7–14', valor: idade.de_7_14 },
    { rotulo: '14–30', valor: idade.de_14_30, critico: true },
    { rotulo: '30+', valor: idade.mais_30, critico: true },
  ];

  const codigosDaSemana = [
    { rotulo: 'Ok', valor: daSemana.verificacoes_por_status.ok ?? 0, cor: 'var(--verde)' },
    {
      rotulo: 'Manutenção',
      valor: daSemana.verificacoes_por_status.manutencao ?? 0,
      cor: 'var(--ambar)',
    },
    {
      rotulo: 'Resolvido',
      valor: daSemana.verificacoes_por_status.resolvido ?? 0,
      cor: 'var(--tinta-media)',
    },
    {
      rotulo: 'Trocado',
      valor: daSemana.verificacoes_por_status.trocado ?? 0,
      cor: 'var(--regua-forte)',
    },
  ];

  return (
    <>
      <p className="sobrescrito">{dataPorExtenso(hoje)}</p>
      <h1 className="titulo">
        {plano.e_dia_de_ronda
          ? faltamNaRonda === 0
            ? 'Ronda do dia completa'
            : `${plural(faltamNaRonda, 'sala falta', 'salas faltam')} na ronda`
          : 'Hoje não é dia de ronda'}
      </h1>

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
            pendências{antigas > 0 ? ` · ${antigas} há 14+ dias` : ' abertas'}
          </span>
        </div>
        <div className={`indicador${foraDeOrdem > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{mobiliario.total_classes}</span>
          <span className="indicador__rotulo">
            classes{foraDeOrdem > 0 ? ` · ${foraDeOrdem} fora de ordem` : ' no CETEC'}
          </span>
        </div>
        <div className={`indicador${criticos.length > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{criticos.length}</span>
          <span className="indicador__rotulo">suprimentos para repor</span>
        </div>
        <div className={`indicador${recursosVencidos > 0 ? ' indicador--critico' : ''}`}>
          <span className="indicador__valor">{recursosFora}</span>
          <span className="indicador__rotulo">
            recursos fora{recursosVencidos > 0 ? ` · ${recursosVencidos} vencidos` : ''}
          </span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">
            {plano.tarefas.length + plano.chamados.length}
          </span>
          <span className="indicador__rotulo">tarefas e chamados</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">
            {daSemana.ronda.cobertura !== null ? `${daSemana.ronda.cobertura}%` : '—'}
          </span>
          <span className="indicador__rotulo">cobertura na semana</span>
        </div>
        <div className={`indicador${painel.perdas_de_contagem.length > 0 ? ' indicador--critico' : ''}`}>
          <span className="indicador__valor">{cadeiras}</span>
          <span className="indicador__rotulo">
            cadeiras contadas
            {painel.perdas_de_contagem.length > 0
              ? ` · ${painel.perdas_de_contagem.length} sala(s) perderam`
              : ''}
          </span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{mesas}</span>
          <span className="indicador__rotulo">mesas contadas</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">
            {painel.dias_medios_ate_fechar ?? '—'}
          </span>
          <span className="indicador__rotulo">dias médios para fechar chamado</span>
        </div>
      </div>

      <div className="mosaico">
        {/* Ronda ocupa duas colunas: espremida, a faixa de azulejos vira
            uma coluna de retângulos e perde a leitura de relance. */}
        <section className="cartao mosaico__largo">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Ronda de hoje</h2>
            <span className="cartao__contagem">
              {ronda.length - faltamNaRonda}/{ronda.length}
            </span>
          </div>
          <div className="cartao__corpo">
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
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Pontos de atenção</h2>
            <span className="cartao__contagem">{pontos.length}</span>
          </div>
          <div className="cartao__corpo">
            <PontosDeAtencao pontos={pontos} insight={insight} />
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Previsões</h2>
            <span className="cartao__contagem">
              {previsoes.reincidencia.length + previsoes.esgotamento.length}
            </span>
          </div>
          <CartaoPrevisoes previsoes={previsoes} insight={insight} />
        </section>

        {/* Agenda única: separadas, cada origem exige lembrar de
            conferir; juntas, é uma lista só. */}
        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Próximos vencimentos</h2>
            <span className="cartao__contagem">14 dias</span>
          </div>
          <div className="cartao__corpo cartao__corpo--alto">
            {painel.vencimentos.length === 0 ? (
              <p className="vazio">Nada vencendo nas próximas duas semanas.</p>
            ) : (
              <ul className="linhas">
                {painel.vencimentos.map((v) => {
                  const dias = Math.round(
                    (new Date(`${v.quando}T12:00:00Z`).getTime() -
                      new Date(`${hoje}T12:00:00Z`).getTime()) /
                      86_400_000,
                  );

                  return (
                    <li className="linha" key={`${v.tipo}-${v.descricao}-${v.quando}`}>
                      <span className="linha__codigo">{ROTULO_VENCIMENTO[v.tipo] ?? v.tipo}</span>
                      <span className="linha__principal">
                        <span className="linha__titulo">{v.descricao}</span>
                        <span className="linha__nota">
                          {dataCurta(v.quando)} · {v.detalhe}
                        </span>
                      </span>
                      <span
                        className={`linha__medida${
                          dias < 0
                            ? ' linha__medida--critico'
                            : dias <= 3
                              ? ' linha__medida--alerta'
                              : ''
                        }`}
                      >
                        {dias < 0 ? `${Math.abs(dias)} d atrás` : `${dias} d`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Itens que mais quebram</h2>
            <span className="cartao__contagem">{painel.janela_dias} d</span>
          </div>
          <div className="cartao__corpo">
            <BarrasCompactas
              itens={painel.ranking_itens.map((i) => ({
                rotulo: i.item,
                valor: i.aberturas,
              }))}
            />
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Salas que mais dão trabalho</h2>
            <span className="cartao__contagem">{painel.janela_dias} d</span>
          </div>
          <div className="cartao__corpo">
            <BarrasCompactas
              itens={painel.ranking_locais.map((l) => ({
                rotulo: l.codigo,
                valor: l.aberturas,
                nota: l.itens,
                critico: l.aberturas >= 5,
              }))}
            />
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Abertas × fechadas</h2>
            <span className="cartao__contagem">8 semanas</span>
          </div>
          <div className="cartao__corpo cartao__corpo--solto">
            <BarrasSemanais semanas={painel.semanas} />
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Idade das pendências</h2>
            <span className="cartao__contagem">{emAberto}</span>
          </div>
          <div className="cartao__corpo">
            <BarrasCompactas itens={faixasDeIdade} />
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Chamados por fila</h2>
            <span className="cartao__contagem">SERVi</span>
          </div>
          <div className="cartao__corpo">
            <BarrasCompactas
              itens={painel.chamados_por_fila.map((c) => ({
                // A fila vem como GLOG::SMGE::Manutenção; só o último
                // segmento cabe e é o que distingue uma da outra.
                rotulo: c.fila.split('::').pop() ?? c.fila,
                valor: c.abertos,
                nota: c.fila,
              }))}
            />
            {painel.dias_medios_ate_fechar !== null ? (
              <p className="linha__nota" style={{ marginTop: '0.375rem' }}>
                tempo médio até fechar: {painel.dias_medios_ate_fechar} dias
              </p>
            ) : null}
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Mobiliário contado</h2>
            <span className="cartao__contagem">última ronda</span>
          </div>
          <div className="cartao__corpo">
            <ul className="linhas">
              <li className="linha">
                <span className="linha__principal">Cadeiras</span>
                <span className="linha__medida">{cadeiras}</span>
              </li>
              <li className="linha">
                <span className="linha__principal">Mesas</span>
                <span className="linha__medida">{mesas}</span>
              </li>
              {painel.perdas_de_contagem.map((p) => (
                <li className="linha" key={`${p.codigo}-${p.item}`}>
                  <span className="linha__codigo">{p.codigo}</span>
                  <span className="linha__principal">
                    <span className="linha__titulo">{p.item}</span>
                    <span className="linha__nota">
                      era {p.antes}, agora {p.agora}
                    </span>
                  </span>
                  <span className="linha__medida linha__medida--critico">{p.diferenca}</span>
                </li>
              ))}
            </ul>
            {painel.perdas_de_contagem.length === 0 ? (
              <p className="vazio">Nenhuma sala perdeu mobiliário na última contagem.</p>
            ) : null}
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Classes</h2>
            <span className="cartao__contagem">{mobiliario.salas_com_planta} salas</span>
          </div>
          <div className="cartao__corpo cartao__corpo--solto">
            <Rosca
              fatias={estadoDasClasses}
              centro={String(mobiliario.total_classes)}
              legendaCentro="no total"
            />
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Pendências abertas</h2>
            <span className="cartao__contagem">{emAberto}</span>
          </div>
          <div className="cartao__corpo cartao__corpo--alto">
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
                      {p.dias_aberta} d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="cartao__rodape">
            <Link href="/salas">Ver por sala</Link>
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Tarefas e chamados</h2>
            <span className="cartao__contagem">
              {plano.tarefas.length + plano.chamados.length}
            </span>
          </div>
          <div className="cartao__corpo cartao__corpo--alto">
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
                      {t.status === 'em_andamento' ? 'andando' : 'pendente'}
                    </span>
                  </li>
                ))}
                {plano.chamados.map((c) => (
                  <li className="linha" key={c.id}>
                    <span className={`etiqueta etiqueta--${c.prioridade}`}>
                      {c.prioridade}
                    </span>
                    <span className="linha__principal">
                      <span className="linha__titulo">
                        <Link href={`/chamados/${c.id}`}>{c.titulo}</Link>
                      </span>
                      <span className="linha__nota">{c.destino}</span>
                    </span>
                    <span
                      className={`linha__medida${
                        c.dias_aberto >= 14 ? ' linha__medida--critico' : ''
                      }`}
                    >
                      {c.dias_aberto} d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="cartao__rodape">
            <Link href="/tarefas">Abrir tarefas</Link>
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Suprimentos</h2>
            <span className="cartao__contagem">
              {criticos.length > 0 ? `${criticos.length} repor` : 'ok'}
            </span>
          </div>
          <div className="cartao__corpo cartao__corpo--alto">
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
          </div>
          <div className="cartao__rodape">
            <Link href="/suprimentos">Lançar consumo</Link>
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">O que está fora</h2>
            <span className="cartao__contagem">{recursosFora} un</span>
          </div>
          <div className="cartao__corpo cartao__corpo--alto">
            {recursos.emprestimos.length === 0 ? (
              <p className="vazio">Nada emprestado no momento.</p>
            ) : (
              <ul className="linhas">
                {recursos.emprestimos.map((emprestimo) => {
                  const recurso = recursos.recursos.find((r) => r.id === emprestimo.recurso_id);
                  const atrasado =
                    emprestimo.previsao_devolucao !== null &&
                    emprestimo.previsao_devolucao < hoje;

                  return (
                    <li className="linha" key={emprestimo.id}>
                      <span className="linha__codigo">{emprestimo.quantidade}×</span>
                      <span className="linha__principal">
                        <span className="linha__titulo">{recurso?.nome ?? 'recurso'}</span>
                        <span className="linha__nota">
                          {emprestimo.responsavel ?? 'sem responsável'}
                          {emprestimo.local_id
                            ? ` · ${recursos.locais[emprestimo.local_id]}`
                            : ''}
                        </span>
                      </span>
                      {atrasado ? (
                        <span className="linha__medida linha__medida--critico">vencido</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="cartao__rodape">
            <Link href="/recursos">Registrar retirada</Link>
          </div>
        </section>

        <section className="cartao mosaico__largo">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Ronda nos últimos 30 dias</h2>
          </div>
          <div className="cartao__corpo cartao__corpo--solto">
            <GraficoRonda serie={serie} />
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Pendências por bloco</h2>
          </div>
          <div className="cartao__corpo">
            <BarrasPorBloco blocos={porBloco} />
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Códigos da semana</h2>
            <span className="cartao__contagem">{daSemana.ronda.feito}</span>
          </div>
          <div className="cartao__corpo cartao__corpo--solto">
            <Rosca
              fatias={codigosDaSemana}
              centro={String(daSemana.ronda.feito)}
              legendaCentro="lançamentos"
            />
          </div>
        </section>

        <section className="cartao">
          <div className="cartao__cabeca">
            <h2 className="cartao__titulo">Fechamento da semana</h2>
          </div>
          <div className="cartao__corpo">
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
                <span className="linha__principal">Chamados fechados</span>
                <span className="linha__medida">{daSemana.chamados.fechados}</span>
              </li>
              <li className="linha">
                <span className="linha__principal">Tarefas concluídas</span>
                <span className="linha__medida">{daSemana.tarefas.concluidas}</span>
              </li>
            </ul>
          </div>
          <div className="cartao__rodape">
            <Link href="/relatorios">Ver relatórios</Link>
          </div>
        </section>
      </div>
    </>
  );
}
