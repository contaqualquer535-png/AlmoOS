import { plural } from '@/lib/formato';
import type { BlocoDaSerie } from '@/lib/types/database';

/**
 * Pendências abertas por bloco. Barra em HTML e não em SVG: são poucas
 * linhas, e assim o texto continua selecionável e o layout se adapta à
 * largura da coluna lateral sem viewBox.
 */
export function BarrasPorBloco({ blocos }: { blocos: BlocoDaSerie[] }) {
  if (blocos.length === 0) {
    return <p className="vazio">Nenhuma pendência aberta.</p>;
  }

  const maior = Math.max(...blocos.map((b) => b.abertas));

  return (
    <ul className="barras">
      {blocos.map((bloco) => (
        <li className="barras__item" key={bloco.bloco}>
          <span className="barras__rotulo">{bloco.bloco}</span>
          <span className="barras__trilho">
            <span
              className={`barras__preenchimento${
                bloco.dias_da_mais_antiga >= 14 ? ' barras__preenchimento--critico' : ''
              }`}
              style={{ width: `${(bloco.abertas / maior) * 100}%` }}
            />
          </span>
          <span className="barras__valor" title={`Mais antiga: ${plural(bloco.dias_da_mais_antiga, 'dia', 'dias')}`}>
            {bloco.abertas}
          </span>
        </li>
      ))}
    </ul>
  );
}
