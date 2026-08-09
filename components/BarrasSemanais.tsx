import { dataCurta } from '@/lib/formato';

export interface SemanaDoGrafico {
  semana: string;
  abertas: number;
  fechadas: number;
}

/**
 * Abertas contra fechadas, semana a semana.
 *
 * É o único gráfico do painel que responde "estou ganhando ou
 * perdendo". O total em aberto sozinho não distingue "muito trabalho e
 * dando conta" de "acumulando" — só a comparação entre as duas séries
 * faz isso.
 *
 * Barras lado a lado e não empilhadas de propósito: empilhar somaria
 * duas grandezas que não se somam.
 */
export function BarrasSemanais({ semanas }: { semanas: SemanaDoGrafico[] }) {
  if (semanas.length === 0) {
    return <p className="vazio">Sem histórico ainda.</p>;
  }

  const teto = Math.max(1, ...semanas.flatMap((s) => [s.abertas, s.fechadas]));

  const saldo = semanas.reduce((soma, s) => soma + s.fechadas - s.abertas, 0);

  return (
    <figure className="semanal">
      <div className="semanal__barras">
        {semanas.map((s) => (
          <div className="semanal__semana" key={s.semana} title={dataCurta(s.semana)}>
            <span
              className="semanal__barra semanal__barra--abriu"
              style={{ height: `${(s.abertas / teto) * 100}%` }}
            >
              <span className="visualmente-oculto">
                {s.abertas} abertas na semana de {dataCurta(s.semana)}
              </span>
            </span>
            <span
              className="semanal__barra semanal__barra--fechou"
              style={{ height: `${(s.fechadas / teto) * 100}%` }}
            >
              <span className="visualmente-oculto">{s.fechadas} fechadas</span>
            </span>
          </div>
        ))}
      </div>

      <figcaption className="semanal__legenda">
        <span className="grafico__chave semanal__chave--abriu">abriram</span>
        <span className="grafico__chave semanal__chave--fechou">fecharam</span>
        <span className={`semanal__saldo${saldo < 0 ? ' semanal__saldo--negativo' : ''}`}>
          {saldo === 0
            ? 'empate no período'
            : saldo > 0
              ? `${saldo} a menos em aberto`
              : `${Math.abs(saldo)} a mais em aberto`}
        </span>
      </figcaption>
    </figure>
  );
}
