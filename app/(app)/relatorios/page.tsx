import Link from 'next/link';

import {
  buscarRelatorio,
  buscarRelatoriosSalvos,
  dataDeHoje,
  mesDe,
  semanaDe,
} from '@/lib/data/consultas';
import { dataCurta, plural, quantidade } from '@/lib/formato';
import { BotaoGerarRelatorio } from '@/components/BotaoGerarRelatorio';
import { CODIGO_STATUS, ROTULO_STATUS, type StatusVerificacao } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

const STATUS: StatusVerificacao[] = ['ok', 'manutencao', 'resolvido', 'trocado'];

/**
 * Relatório ao vivo à esquerda, snapshots congelados à direita.
 *
 * A distinção é o ponto da tela: a agregação ao vivo muda se um dado
 * antigo for corrigido; o snapshot em `relatorios.conteudo`, não. Quem
 * precisa levar número para reunião congela; quem quer saber como está
 * agora, lê ao vivo.
 */
export default async function PaginaRelatorios({
  searchParams,
}: {
  searchParams: Promise<{ inicio?: string; fim?: string }>;
}) {
  const filtro = await searchParams;
  const hoje = dataDeHoje();
  const semana = semanaDe(hoje);
  const mes = mesDe(hoje);

  const inicio = filtro.inicio ?? semana.inicio;
  const fim = filtro.fim ?? semana.fim;

  const [relatorio, salvos] = await Promise.all([
    buscarRelatorio(inicio, fim),
    buscarRelatoriosSalvos(),
  ]);

  const ehSemana = inicio === semana.inicio && fim === semana.fim;
  const tipo = ehSemana ? 'semanal' : inicio === mes.inicio && fim === mes.fim ? 'mensal' : 'diario';

  return (
    <>
      <p className="sobrescrito">
        {dataCurta(inicio)} a {dataCurta(fim)}
      </p>
      <h1 className="titulo">Relatórios</h1>

      <form className="formulario-curto nao-imprime" method="get" style={{ marginTop: '1.25rem' }}>
        <input
          className="campo__entrada formulario-curto__estreito"
          type="date"
          name="inicio"
          defaultValue={inicio}
          aria-label="Início do período"
        />
        <input
          className="campo__entrada formulario-curto__estreito"
          type="date"
          name="fim"
          defaultValue={fim}
          aria-label="Fim do período"
        />
        <button className="botao botao--discreto" type="submit">
          Ver período
        </button>
        <Link className="botao botao--discreto" href="/relatorios">
          Semana atual
        </Link>
        <Link
          className="botao botao--discreto"
          href={`/relatorios?inicio=${mes.inicio}&fim=${mes.fim}`}
        >
          Mês atual
        </Link>
      </form>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador__valor">
            {relatorio.ronda.cobertura !== null ? `${relatorio.ronda.cobertura}%` : '—'}
          </span>
          <span className="indicador__rotulo">
            cobertura · {relatorio.ronda.feito} de {relatorio.ronda.esperado}
          </span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{relatorio.pendencias.abertas_no_periodo}</span>
          <span className="indicador__rotulo">pendências abertas no período</span>
        </div>
        <div className="indicador indicador--bom">
          <span className="indicador__valor">
            {relatorio.pendencias.resolvidas + relatorio.pendencias.trocadas}
          </span>
          <span className="indicador__rotulo">
            encerradas · {relatorio.pendencias.resolvidas} X, {relatorio.pendencias.trocadas} T
          </span>
        </div>
        <div
          className={`indicador${
            relatorio.pendencias.em_aberto_no_fim > 0 ? ' indicador--alerta' : ''
          }`}
        >
          <span className="indicador__valor">{relatorio.pendencias.em_aberto_no_fim}</span>
          <span className="indicador__rotulo">ainda abertas no fim do período</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{relatorio.dias_de_ronda}</span>
          <span className="indicador__rotulo">dias de ronda no período</span>
        </div>
      </div>

      <div className="painel">
        <div>
          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Lançamentos por código</h2>
            </div>
            <ul className="linhas">
              {STATUS.map((s) => (
                <li className="linha" key={s}>
                  <span className="linha__codigo">{CODIGO_STATUS[s]}</span>
                  <span className="linha__principal">{ROTULO_STATUS[s]}</span>
                  <span className="linha__medida">
                    {relatorio.verificacoes_por_status[s] ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Onde abriu pendência</h2>
              <span className="secao__contagem">por bloco</span>
            </div>
            {relatorio.por_bloco.length === 0 ? (
              <p className="vazio">Nenhuma pendência aberta no período.</p>
            ) : (
              <ul className="linhas">
                {relatorio.por_bloco.map((b) => (
                  <li className="linha" key={b.bloco}>
                    <span className="linha__principal">{b.bloco}</span>
                    <span className="linha__medida">{b.aberturas}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Qual item deu problema</h2>
            </div>
            {relatorio.por_item.length === 0 ? (
              <p className="vazio">Nenhuma pendência aberta no período.</p>
            ) : (
              <ul className="linhas">
                {relatorio.por_item.map((i) => (
                  <li className="linha" key={i.item}>
                    <span className="linha__principal">{i.item}</span>
                    <span className="linha__medida">{i.aberturas}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Consumo de suprimento</h2>
            </div>
            {relatorio.suprimentos.length === 0 ? (
              <p className="vazio">Nenhum consumo registrado no período.</p>
            ) : (
              <ul className="linhas">
                {relatorio.suprimentos.map((s) => (
                  <li className="linha" key={s.nome}>
                    <span className="linha__principal">{s.nome}</span>
                    <span className="linha__medida">
                      {quantidade(s.consumido, s.unidade)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="painel__lateral">
          <section className="secao" style={{ marginTop: 0 }}>
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Congelar este período</h2>
            </div>
            <p className="vazio">
              Salva a agregação como está agora. Se um lançamento antigo for corrigido
              depois, a tela ao vivo muda e o snapshot não.
            </p>
            <BotaoGerarRelatorio
              tipo={tipo}
              inicio={inicio}
              fim={fim}
              rotulo={`Gerar relatório ${tipo}`}
            />
          </section>

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Chamados e tarefas</h2>
            </div>
            <ul className="linhas">
              <li className="linha">
                <span className="linha__principal">Chamados abertos</span>
                <span className="linha__medida">{relatorio.chamados.abertos}</span>
              </li>
              <li className="linha">
                <span className="linha__principal">Chamados fechados</span>
                <span className="linha__medida">{relatorio.chamados.fechados}</span>
              </li>
              <li className="linha">
                <span className="linha__principal">Em aberto no fim</span>
                <span className="linha__medida">{relatorio.chamados.em_aberto_no_fim}</span>
              </li>
              <li className="linha">
                <span className="linha__principal">Tarefas criadas</span>
                <span className="linha__medida">{relatorio.tarefas.criadas}</span>
              </li>
              <li className="linha">
                <span className="linha__principal">Tarefas concluídas</span>
                <span className="linha__medida">{relatorio.tarefas.concluidas}</span>
              </li>
            </ul>
          </section>

          <section className="secao">
            <div className="secao__cabeca">
              <h2 className="secao__titulo">Congelados</h2>
              <span className="secao__contagem">{salvos.length}</span>
            </div>
            {salvos.length === 0 ? (
              <p className="vazio">Nenhum relatório salvo ainda.</p>
            ) : (
              <ul className="linhas">
                {salvos.map((r) => (
                  <li className="linha" key={r.id}>
                    <span className="linha__codigo">{r.tipo}</span>
                    <span className="linha__principal">
                      <Link href={`/relatorios?inicio=${r.periodo_inicio}&fim=${r.periodo_fim}`}>
                        {dataCurta(r.periodo_inicio)} a {dataCurta(r.periodo_fim)}
                      </Link>
                      <span className="linha__nota">
                        {plural(
                          r.conteudo.pendencias.abertas_no_periodo,
                          'pendência',
                          'pendências',
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
