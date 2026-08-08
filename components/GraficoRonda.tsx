import { dataCurta } from '@/lib/formato';
import type { DiaDaSerie } from '@/lib/types/database';

/**
 * Cobertura da ronda dia a dia. SVG desenhado no servidor, sem
 * biblioteca: são duas séries e trinta pontos, e qualquer lib de gráfico
 * custaria mais JavaScript do que o site inteiro tem hoje.
 *
 * Dia sem ronda vira uma marca discreta na base em vez de sumir — o
 * padrão seg/qua/sex tem que ser visível no desenho.
 */
export function GraficoRonda({ serie }: { serie: DiaDaSerie[] }) {
  if (serie.length === 0) {
    return <p className="vazio">Sem histórico de ronda ainda.</p>;
  }

  const largura = 720;
  const altura = 160;
  const base = altura - 18;
  const passo = largura / serie.length;
  const teto = Math.max(1, ...serie.map((d) => Math.max(d.esperado, d.feito)));

  return (
    <figure className="grafico">
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="grafico__tela"
        role="img"
        aria-label={`Cobertura da ronda nos últimos ${serie.length} dias`}
      >
        <line
          x1="0"
          y1={base}
          x2={largura}
          y2={base}
          stroke="var(--regua-forte)"
          strokeWidth="1"
        />

        {serie.map((dia, i) => {
          const x = i * passo;
          const alturaFeito = (dia.feito / teto) * (base - 8);
          const alturaEsperado = (dia.esperado / teto) * (base - 8);
          const completo = dia.esperado > 0 && dia.feito >= dia.esperado;

          return (
            <g key={dia.dia}>
              {dia.esperado > 0 ? (
                <rect
                  x={x + 1}
                  y={base - alturaEsperado}
                  width={passo - 2}
                  height={alturaEsperado}
                  fill="var(--regua)"
                />
              ) : (
                <rect
                  x={x + 1}
                  y={base - 2}
                  width={passo - 2}
                  height="2"
                  fill="var(--regua)"
                />
              )}

              {dia.feito > 0 ? (
                <rect
                  x={x + 1}
                  y={base - alturaFeito}
                  width={passo - 2}
                  height={alturaFeito}
                  fill={completo ? 'var(--verde)' : 'var(--ambar)'}
                >
                  <title>
                    {dataCurta(dia.dia)}: {dia.feito} de {dia.esperado || '—'}
                  </title>
                </rect>
              ) : null}
            </g>
          );
        })}

        <text x="0" y={altura - 4} className="grafico__rotulo">
          {dataCurta(serie[0].dia)}
        </text>
        <text x={largura} y={altura - 4} textAnchor="end" className="grafico__rotulo">
          {dataCurta(serie[serie.length - 1].dia)}
        </text>
      </svg>

      <figcaption className="grafico__legenda">
        <span className="grafico__chave grafico__chave--verde">ronda completa</span>
        <span className="grafico__chave grafico__chave--ambar">parcial</span>
        <span className="grafico__chave grafico__chave--cinza">esperado</span>
      </figcaption>
    </figure>
  );
}
