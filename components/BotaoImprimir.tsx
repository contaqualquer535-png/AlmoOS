'use client';

/** window.print() só existe no navegador, então este é o único trecho cliente da folha. */
export function BotaoImprimir() {
  return (
    <button className="botao" type="button" onClick={() => window.print()}>
      Imprimir
    </button>
  );
}
