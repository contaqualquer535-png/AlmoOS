import Link from 'next/link';

import { buscarStatusDaRonda, agruparPorBloco, dataDeHoje } from '@/lib/data/consultas';
import { dataPorExtenso, plural } from '@/lib/formato';

export const dynamic = 'force-dynamic';

/** Escolha da sala. A ronda acontece bloco a bloco, então a lista segue isso. */
export default async function PaginaRonda() {
  const salas = await buscarStatusDaRonda();
  const porBloco = agruparPorBloco(salas);
  const faltam = salas.filter((s) => s.itens_registrados < s.itens_esperados).length;

  return (
    <>
      <p className="sobrescrito">{dataPorExtenso(dataDeHoje())}</p>
      <h1 className="titulo">Ronda</h1>
      <p className="aviso aviso--ronda">
        <span className="aviso__marcador">Situação</span>
        <span>
          {faltam === 0
            ? 'Todas as salas lançadas.'
            : `${plural(faltam, 'sala falta', 'salas faltam')}.`}
        </span>
      </p>

      {porBloco.map(([bloco, doBloco]) => (
        <section className="secao" key={bloco}>
          <div className="secao__cabeca">
            <h2 className="secao__titulo">{bloco}</h2>
            <span className="secao__contagem">
              {doBloco.filter((s) => s.itens_registrados >= s.itens_esperados).length}/
              {doBloco.length} prontas
            </span>
          </div>
          <ul className="linhas">
            {doBloco.map((sala) => {
              const completa = sala.itens_registrados >= sala.itens_esperados;
              return (
                <li className="linha" key={sala.local_id}>
                  <span className="linha__codigo">{sala.codigo}</span>
                  <span className="linha__principal">
                    <Link href={`/ronda/${encodeURIComponent(sala.codigo)}`}>
                      {completa ? 'Revisar lançamento' : 'Lançar ronda'}
                    </Link>
                  </span>
                  <span className={`linha__medida${completa ? '' : ' linha__medida--alerta'}`}>
                    {sala.itens_registrados}/{sala.itens_esperados}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
