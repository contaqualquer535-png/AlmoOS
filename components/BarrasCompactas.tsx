export interface ItemDaBarra {
  rotulo: string;
  valor: number;
  nota?: string;
  critico?: boolean;
}

/**
 * Ranking em barras, versão apertada para caber num cartão do painel.
 *
 * Escala relativa ao maior da própria lista, não a um máximo absoluto: a
 * pergunta aqui é "qual é o pior", não "quanto é muito". Um ranking com
 * escala fixa desperdiçaria a largura toda quando os números fossem
 * baixos.
 */
export function BarrasCompactas({ itens }: { itens: ItemDaBarra[] }) {
  if (itens.length === 0) {
    return <p className="vazio">Sem dados no período.</p>;
  }

  const maior = Math.max(...itens.map((i) => i.valor), 1);

  return (
    <ul className="barrinhas">
      {itens.map((item) => (
        <li className="barrinha" key={item.rotulo}>
          <span className="barrinha__rotulo" title={item.nota ?? item.rotulo}>
            {item.rotulo}
          </span>
          <span className="barrinha__trilho">
            <span
              className={`barrinha__preenchimento${
                item.critico ? ' barrinha__preenchimento--critico' : ''
              }`}
              style={{ width: `${(item.valor / maior) * 100}%` }}
            />
          </span>
          <span className="barrinha__valor">{item.valor}</span>
        </li>
      ))}
    </ul>
  );
}
