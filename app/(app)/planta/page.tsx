import Link from 'next/link';

import { buscarResumoDasPlantas, agruparPorBloco } from '@/lib/data/consultas';
import { plural } from '@/lib/formato';

export const dynamic = 'force-dynamic';

/**
 * Índice das plantas. A leitura que interessa aqui é "onde tem cadeira
 * quebrada", então o número fora de ordem vem antes do total.
 */
export default async function PaginaPlantas() {
  const plantas = await buscarResumoDasPlantas();
  const porBloco = agruparPorBloco(plantas);
  const foraDeOrdem = plantas.reduce(
    (soma, p) => soma + p.classes_quebradas + p.classes_faltando,
    0,
  );

  return (
    <>
      <p className="sobrescrito">Documentação visual das salas</p>
      <h1 className="titulo">Plantas</h1>

      <p className={`aviso ${foraDeOrdem === 0 ? 'aviso--ronda' : 'aviso--folga'}`}>
        <span className="aviso__marcador">Situação</span>
        <span>
          {foraDeOrdem === 0
            ? 'Nenhuma classe marcada como quebrada ou faltando.'
            : `${plural(foraDeOrdem, 'classe fora de ordem', 'classes fora de ordem')}.`}
        </span>
      </p>

      {plantas.length === 0 ? (
        <p className="vazio">
          Nenhum ambiente cadastrado. Rode o seed do banco (passo 3 do guia de
          instalação) para carregar as salas.
        </p>
      ) : null}

      {porBloco.map(([bloco, doBloco]) => (
        <section className="secao" key={bloco}>
          <div className="secao__cabeca">
            <h2 className="secao__titulo">{bloco}</h2>
            <span className="secao__contagem">
              {doBloco.filter((p) => p.tem_planta).length}/{doBloco.length} desenhados
            </span>
          </div>

          <ul className="linhas">
            {doBloco.map((p) => {
              const problemas = p.classes_quebradas + p.classes_faltando;
              return (
                <li className="linha" key={p.local_id}>
                  <span className="linha__codigo">{p.codigo}</span>
                  <span className="linha__principal">
                    <Link href={`/planta/${encodeURIComponent(p.codigo)}`}>
                      {p.tem_planta ? (p.nome ?? 'Ver planta') : 'Desenhar planta'}
                    </Link>
                    <span className="linha__nota">
                      {p.turmas_vigentes.length > 0
                        ? `${p.turmas_vigentes.join(', ')} · `
                        : ''}
                      {p.tem_planta
                        ? `${p.total_classes} classes · grid ${p.grid_cols}×${p.grid_rows}`
                        : 'sem planta'}
                    </span>
                  </span>
                  <span
                    className={`linha__medida${problemas > 0 ? ' linha__medida--alerta' : ''}`}
                  >
                    {!p.tem_planta
                      ? '—'
                      : problemas === 0
                        ? 'em ordem'
                        : [
                            p.classes_quebradas > 0
                              ? `${p.classes_quebradas} quebrada(s)`
                              : null,
                            p.classes_faltando > 0 ? `${p.classes_faltando} faltando` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
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
