import { dataHoraCurta } from '@/lib/formato';
import { ROTULO_PONTO, type Insight, type PontoDeAtencao } from '@/lib/types/database';

/**
 * Duas origens, deliberadamente separadas na tela.
 *
 * Os pontos são calculados agora, no banco, e são fato: "aberto há 18
 * dias" é uma subtração. Os padrões vêm de um modelo de linguagem e são
 * leitura — podem estar errados. Misturar os dois num bloco só faria o
 * segundo herdar a autoridade do primeiro.
 */
export function PontosDeAtencao({
  pontos,
  insight,
}: {
  pontos: PontoDeAtencao[];
  insight: Insight | null;
}) {
  const padroes = insight?.resumo?.padroes_identificados ?? [];

  return (
    <>
      <section className="secao" style={{ marginTop: 0 }}>
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Pontos de atenção</h2>
          <span className="secao__contagem">{pontos.length}</span>
        </div>

        {pontos.length === 0 ? (
          <p className="vazio">Nada encalhado: nenhum prazo vencido nem estoque crítico.</p>
        ) : (
          <ul className="linhas">
            {pontos.map((ponto, i) => (
              <li className="linha" key={`${ponto.tipo}-${ponto.referencia_id ?? i}`}>
                <span className={`etiqueta etiqueta--${ponto.prioridade}`}>
                  {ROTULO_PONTO[ponto.tipo] ?? ponto.tipo}
                </span>
                <span className="linha__principal">{ponto.mensagem}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {padroes.length > 0 ? (
        <section className="secao">
          <div className="secao__cabeca">
            <h2 className="secao__titulo">Padrões observados</h2>
          </div>

          <ul className="linhas">
            {padroes.map((padrao) => (
              <li className="linha" key={padrao}>
                <span className="linha__principal">{padrao}</span>
              </li>
            ))}
          </ul>

          <p className="nota-de-origem">
            Leitura gerada por {insight?.modelo} em{' '}
            {insight ? dataHoraCurta(insight.gerado_em) : '—'}. Diferente dos pontos
            acima, isto é interpretação e pode estar errado — confira antes de agir.
          </p>
        </section>
      ) : null}

      {insight?.erro ? (
        <p className="nota-de-origem">
          Última análise não completou: {insight.erro}
        </p>
      ) : null}
    </>
  );
}
