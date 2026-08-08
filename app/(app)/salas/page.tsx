import Link from 'next/link';

import { buscarPainelDeSalas, agruparPorBloco, dataDeHoje } from '@/lib/data/consultas';
import { dataPorExtenso, plural } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const ROTULO_TIPO: Record<string, string> = {
  sala: 'Sala de aula',
  banheiro: 'Banheiro',
  apoio: 'Apoio',
  teatro: 'Teatro',
  almoxarifado: 'Almoxarifado',
  externo: 'Externo',
};

/**
 * Todos os ambientes numa página. Diferente de /ronda, que só mostra o
 * que entra no checklist do dia, aqui aparece o inventário completo de
 * espaços — inclusive banheiro, almoxarifado e o destino EXTERNO.
 */
export default async function PaginaSalas() {
  const salas = await buscarPainelDeSalas();
  const porBloco = agruparPorBloco(salas);
  const comPendencia = salas.filter((s) => s.pendencias_abertas > 0);

  return (
    <>
      <p className="sobrescrito">{dataPorExtenso(dataDeHoje())}</p>
      <h1 className="titulo">Salas e ambientes</h1>

      <p className={`aviso ${comPendencia.length === 0 ? 'aviso--ronda' : 'aviso--folga'}`}>
        <span className="aviso__marcador">Situação</span>
        <span>
          {comPendencia.length === 0
            ? 'Nenhum ambiente com pendência aberta.'
            : `${plural(comPendencia.length, 'ambiente', 'ambientes')} com pendência aberta.`}
        </span>
      </p>

      {porBloco.map(([bloco, doBloco]) => (
        <section className="secao" key={bloco}>
          <div className="secao__cabeca">
            <h2 className="secao__titulo">{bloco}</h2>
            <span className="secao__contagem">
              {plural(doBloco.length, 'ambiente', 'ambientes')}
            </span>
          </div>

          <ul className="linhas">
            {doBloco.map((sala) => (
              <li className="linha linha--empilha" key={sala.id}>
                <span className="linha__codigo">{sala.codigo}</span>

                <span className="linha__principal">
                  <span className="linha__titulo">
                    {sala.nome ?? ROTULO_TIPO[sala.tipo] ?? sala.tipo}
                    {sala.turmas_vigentes.length > 0 ? (
                      <span className="etiqueta etiqueta--baixa sala__turma">
                        {sala.turmas_vigentes.join(', ')}
                      </span>
                    ) : null}
                  </span>

                  <span className="linha__nota">
                    {sala.ronda_padrao
                      ? `Ronda hoje: ${sala.itens_registrados}/${sala.itens_esperados}`
                      : 'Fora da ronda padrão'}
                    {sala.pendencias_abertas > 0
                      ? ` · ${plural(
                          sala.pendencias_abertas,
                          'pendência aberta',
                          'pendências abertas',
                        )}, a mais antiga há ${sala.dias_da_pendencia_mais_antiga} dia(s)`
                      : ''}
                  </span>

                  <span className="sala__acoes">
                    {sala.ronda_padrao ? (
                      <Link href={`/ronda/${encodeURIComponent(sala.codigo)}`}>Ronda</Link>
                    ) : null}
                    <Link href={`/planta/${encodeURIComponent(sala.codigo)}`}>
                      {sala.tem_planta ? 'Planta' : 'Desenhar planta'}
                    </Link>
                  </span>
                </span>

                <span
                  className={`linha__medida${
                    sala.pendencias_abertas > 0 ? ' linha__medida--alerta' : ''
                  }`}
                >
                  {sala.pendencias_abertas > 0 ? `${sala.pendencias_abertas} M` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
