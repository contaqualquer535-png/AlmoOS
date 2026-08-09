import Link from 'next/link';

import type { MobiliarioDaSala } from '@/lib/types/database';

/**
 * Quantas mesas e cadeiras existem em cada sala.
 *
 * Fica ao lado da rosca de classes de propósito, e as duas respondem
 * perguntas diferentes: a rosca diz *quantas existem e em que estado*,
 * esta diz *onde estão*. Sala com 12 cadeiras e sala com 45 são
 * realidades distintas que o total de 510 esconde por completo.
 *
 * Barras empilhadas porque mesa e cadeira somam num sentido real — é o
 * mobiliário da sala — e a proporção entre elas é informação: cadeira
 * muito acima de mesa costuma significar sala de aula convencional;
 * empatadas, laboratório.
 */
export function DistribuicaoDeMobiliario({ salas }: { salas: MobiliarioDaSala[] }) {
  const comContagem = salas.filter((s) => s.mesas > 0 || s.cadeiras > 0);

  if (comContagem.length === 0) {
    return (
      <p className="vazio">
        Nenhuma contagem ainda. Mesas e cadeiras pedem quantidade na ronda — o gráfico
        aparece assim que a primeira sala for contada.
      </p>
    );
  }

  const maior = Math.max(...comContagem.map((s) => s.mesas + s.cadeiras), 1);

  return (
    <ul className="distribuicao">
      {comContagem.map((sala) => {
        const total = sala.mesas + sala.cadeiras;

        return (
          <li className="distribuicao__item" key={sala.local_id}>
            <Link
              className="distribuicao__codigo"
              href={`/salas/${encodeURIComponent(sala.codigo)}`}
            >
              {sala.codigo}
            </Link>

            <span className="distribuicao__trilho" title={`${sala.mesas} mesas, ${sala.cadeiras} cadeiras`}>
              <span
                className="distribuicao__mesas"
                style={{ width: `${(sala.mesas / maior) * 100}%` }}
              />
              <span
                className="distribuicao__cadeiras"
                style={{ width: `${(sala.cadeiras / maior) * 100}%` }}
              />
            </span>

            <span className="distribuicao__valor">{total}</span>
          </li>
        );
      })}

      <li className="distribuicao__legenda">
        <span className="grafico__chave distribuicao__chave--mesas">mesas</span>
        <span className="grafico__chave distribuicao__chave--cadeiras">cadeiras</span>
      </li>
    </ul>
  );
}
