export interface FatiaDaRosca {
  rotulo: string;
  valor: number;
  cor: string;
}

/**
 * Rosca em SVG, desenhada no servidor.
 *
 * Serve para proporção de um todo conhecido — o estado das classes, a
 * distribuição dos códigos da ronda. Para comparar grandezas
 * independentes ela seria a escolha errada e a barra é melhor; por isso
 * o componente não tem legenda de valores absolutos grandes, só
 * percentual.
 *
 * O buraco no meio não é decoração: é onde vai o número que importa.
 */
export function Rosca({
  fatias,
  centro,
  legendaCentro,
}: {
  fatias: FatiaDaRosca[];
  centro: string;
  legendaCentro: string;
}) {
  const total = fatias.reduce((soma, f) => soma + f.valor, 0);

  const raio = 52;
  const espessura = 16;
  const circunferencia = 2 * Math.PI * raio;

  let percorrido = 0;

  return (
    <figure className="rosca">
      <svg viewBox="0 0 140 140" className="rosca__tela" role="img" aria-label={legendaCentro}>
        <g transform="translate(70,70) rotate(-90)">
          <circle
            r={raio}
            fill="none"
            stroke="var(--regua)"
            strokeWidth={espessura}
          />

          {total > 0
            ? fatias.map((fatia) => {
                if (fatia.valor <= 0) return null;

                const proporcao = fatia.valor / total;
                const traco = proporcao * circunferencia;
                const deslocamento = -percorrido * circunferencia;
                percorrido += proporcao;

                return (
                  <circle
                    key={fatia.rotulo}
                    r={raio}
                    fill="none"
                    stroke={fatia.cor}
                    strokeWidth={espessura}
                    strokeDasharray={`${traco} ${circunferencia - traco}`}
                    strokeDashoffset={deslocamento}
                  >
                    <title>
                      {fatia.rotulo}: {fatia.valor} ({Math.round(proporcao * 100)}%)
                    </title>
                  </circle>
                );
              })
            : null}
        </g>

        <text x="70" y="68" textAnchor="middle" className="rosca__centro">
          {centro}
        </text>
        <text x="70" y="84" textAnchor="middle" className="rosca__legenda-centro">
          {legendaCentro}
        </text>
      </svg>

      <figcaption className="rosca__legenda">
        {fatias
          .filter((f) => f.valor > 0)
          .map((fatia) => (
            <span key={fatia.rotulo} className="rosca__chave">
              <span className="rosca__ponto" style={{ background: fatia.cor }} aria-hidden="true" />
              {fatia.rotulo} · {fatia.valor}
            </span>
          ))}
      </figcaption>
    </figure>
  );
}
