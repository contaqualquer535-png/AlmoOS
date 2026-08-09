import Link from 'next/link';

import {
  buscarPainelDeSalas,
  buscarResumoDasPlantas,
  buscarContagemDeMobiliario,
  agruparPorBloco,
  dataDeHoje,
} from '@/lib/data/consultas';
import { dataPorExtenso, plural } from '@/lib/formato';
import { CadastroDeAmbiente } from '@/components/CadastroDeAmbiente';

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
/**
 * Lista única de ambientes.
 *
 * Antes havia /salas e /planta lado a lado, listando o mesmo conjunto
 * com recortes diferentes — redundância que obrigava a lembrar em qual
 * das duas estava o que se procura. A planta agora é detalhe de cada
 * sala, não uma seção paralela.
 */
export default async function PaginaSalas() {
  const [salas, plantas, mobiliario] = await Promise.all([
    buscarPainelDeSalas(),
    buscarResumoDasPlantas(),
    buscarContagemDeMobiliario(),
  ]);

  const porPlanta = new Map(plantas.map((p) => [p.local_id, p]));
  const porBloco = agruparPorBloco(salas);
  const comPendencia = salas.filter((s) => s.pendencias_abertas > 0);
  const foraDeOrdem = mobiliario.classes_quebradas + mobiliario.classes_faltando;

  return (
    <>
      <p className="sobrescrito">{dataPorExtenso(dataDeHoje())}</p>
      <h1 className="titulo">Salas e ambientes</h1>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador__valor">{salas.length}</span>
          <span className="indicador__rotulo">ambientes ativos</span>
        </div>
        <div className={`indicador${comPendencia.length > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{comPendencia.length}</span>
          <span className="indicador__rotulo">com pendência aberta</span>
        </div>
        <div className={`indicador${foraDeOrdem > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{mobiliario.total_classes}</span>
          <span className="indicador__rotulo">
            classes{foraDeOrdem > 0 ? ` · ${foraDeOrdem} fora de ordem` : ''}
          </span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">
            {plantas.filter((p) => p.tem_planta).length}/{plantas.length}
          </span>
          <span className="indicador__rotulo">plantas desenhadas</span>
        </div>
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <CadastroDeAmbiente
          ambientes={salas.map((s) => ({
            id: s.id,
            codigo: s.codigo,
            nome: s.nome,
            bloco: s.bloco,
            tipo: s.tipo,
            ronda_padrao: s.ronda_padrao,
            ordem_visita: s.ordem_visita,
          }))}
          blocos={[...new Set(salas.map((s) => s.bloco).filter((b): b is string => Boolean(b)))]}
        />
      </div>

      {porBloco.map(([bloco, doBloco]) => (
        <section className="secao" key={bloco}>
          <div className="secao__cabeca">
            <h2 className="secao__titulo">{bloco}</h2>
            <span className="secao__contagem">
              {plural(doBloco.length, 'ambiente', 'ambientes')}
            </span>
          </div>

          <ul className="linhas">
            {doBloco.map((sala) => {
              const planta = porPlanta.get(sala.id);

              return (
                <li className="linha linha--empilha" key={sala.id}>
                  <span className="linha__codigo">
                    <Link href={`/salas/${encodeURIComponent(sala.codigo)}`}>
                      {sala.codigo}
                    </Link>
                  </span>

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
                      {planta?.tem_planta
                        ? ` · ${planta.total_classes} classes`
                        : ' · sem planta'}
                      {sala.pendencias_abertas > 0
                        ? ` · ${plural(
                            sala.pendencias_abertas,
                            'pendência aberta',
                            'pendências abertas',
                          )} há até ${sala.dias_da_pendencia_mais_antiga} dias`
                        : ''}
                    </span>

                    <span className="sala__acoes">
                      {sala.ronda_padrao ? (
                        <Link href={`/ronda/${encodeURIComponent(sala.codigo)}`}>Ronda</Link>
                      ) : null}
                      <Link href={`/planta/${encodeURIComponent(sala.codigo)}`}>
                        {planta?.tem_planta ? 'Planta' : 'Desenhar planta'}
                      </Link>
                    </span>
                  </span>

                  {planta && planta.classes_quebradas + planta.classes_faltando > 0 ? (
                    <span className="linha__medida linha__medida--alerta">
                      {planta.classes_quebradas > 0
                        ? `${planta.classes_quebradas} quebrada(s)`
                        : ''}
                      {planta.classes_quebradas > 0 && planta.classes_faltando > 0 ? ' · ' : ''}
                      {planta.classes_faltando > 0 ? `${planta.classes_faltando} faltando` : ''}
                    </span>
                  ) : null}

                  <span
                    className={`linha__medida${
                      sala.pendencias_abertas > 0 ? ' linha__medida--alerta' : ''
                    }`}
                  >
                    {sala.pendencias_abertas > 0 ? `${sala.pendencias_abertas} M` : '—'}
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
