import { dataCurta } from '@/lib/formato';

export interface PontoDaContagem {
  data: string;
  quantidade: number;
}

/**
 * Contagem de um item ao longo do tempo, numa sala.
 *
 * A escala não começa no zero: com mesas oscilando entre 29 e 30, uma
 * escala a partir de zero achataria a linha e a queda ficaria invisível
 * — que é justamente o que se quer enxergar. Aqui a pergunta é "mudou?",
 * não "quanto é no total".
 *
 * Por isso também o eixo mostra o mínimo e o máximo: sem eles, uma
 * escala truncada engana.
 */
export function SerieDeContagem({
  serie,
  rotulo,
}: {
  serie: PontoDaContagem[];
  rotulo: string;
}) {
  if (serie.length < 2) {
    return (
      <p className="vazio">
        {serie.length === 1
          ? `${serie[0]?.quantidade} em ${dataCurta(serie[0]?.data ?? '')} — uma contagem só, sem comparação possível.`
          : 'Nenhuma contagem registrada.'}
      </p>
    );
  }

  const valores = serie.map((p) => p.quantidade);
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const amplitude = Math.max(1, maximo - minimo);

  const largura = 320;
  const altura = 72;
  const passo = largura / Math.max(1, serie.length - 1);

  const pontos = serie.map((p, i) => ({
    x: i * passo,
    y: altura - 12 - ((p.quantidade - minimo) / amplitude) * (altura - 24),
    ...p,
  }));

  const caminho = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const primeiro = serie[0]!;
  const ultimo = serie[serie.length - 1]!;
  const variacao = ultimo.quantidade - primeiro.quantidade;

  return (
    <figure className="serie">
      <figcaption className="serie__cabeca">
        <span className="serie__rotulo">{rotulo}</span>
        <span className="serie__atual">{ultimo.quantidade}</span>
        {variacao !== 0 ? (
          <span className={`serie__variacao${variacao < 0 ? ' serie__variacao--menos' : ''}`}>
            {variacao > 0 ? `+${variacao}` : variacao} desde {dataCurta(primeiro.data)}
          </span>
        ) : (
          <span className="serie__variacao">estável desde {dataCurta(primeiro.data)}</span>
        )}
      </figcaption>

      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="serie__tela"
        role="img"
        aria-label={`${rotulo}: ${primeiro.quantidade} em ${dataCurta(primeiro.data)}, ${ultimo.quantidade} em ${dataCurta(ultimo.data)}`}
      >
        <path d={caminho} fill="none" stroke="var(--verde)" strokeWidth="1.5" />

        {pontos.map((p) => (
          <circle
            key={p.data}
            cx={p.x}
            cy={p.y}
            r="2.5"
            fill={p.quantidade < maximo ? 'var(--tijolo)' : 'var(--verde)'}
          >
            <title>
              {dataCurta(p.data)}: {p.quantidade}
            </title>
          </circle>
        ))}

        <text x="0" y={altura - 1} className="serie__eixo">
          {minimo}
        </text>
        <text x="0" y="8" className="serie__eixo">
          {maximo}
        </text>
      </svg>
    </figure>
  );
}
