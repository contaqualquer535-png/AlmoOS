import Link from 'next/link';

import {
  buscarPendenciasComMateriais,
  buscarOpcoesDeAcaoRapida,
  agruparPorBloco,
} from '@/lib/data/consultas';
import { dataCurta, plural } from '@/lib/formato';
import { Carimbo } from '@/components/Carimbo';
import { MateriaisDaPendencia } from '@/components/MateriaisDaPendencia';

export const dynamic = 'force-dynamic';

/**
 * Pendências abertas com o material de cada uma.
 *
 * É a tela de preparação: você percorre o que está aberto e diz o que
 * precisa levar. O roteiro impresso agrega isso — sem esta etapa, a
 * primeira tabela dele sai vazia.
 */
export default async function PaginaPendencias() {
  const [pendencias, opcoes] = await Promise.all([
    buscarPendenciasComMateriais(),
    buscarOpcoesDeAcaoRapida(),
  ]);

  const porBloco = agruparPorBloco(pendencias);
  const semMaterial = pendencias.filter((p) => p.materiais.length === 0);
  const antigas = pendencias.filter((p) => p.dias_aberta >= 14);
  const semChamado = pendencias.filter((p) => p.dias_aberta >= 14 && !p.tem_chamado_aberto);

  return (
    <>
      <p className="sobrescrito">Preparação do roteiro</p>
      <h1 className="titulo">Pendências abertas</h1>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador__valor">{pendencias.length}</span>
          <span className="indicador__rotulo">itens aguardando</span>
        </div>
        <div className={`indicador${antigas.length > 0 ? ' indicador--critico' : ''}`}>
          <span className="indicador__valor">{antigas.length}</span>
          <span className="indicador__rotulo">há 14 dias ou mais</span>
        </div>
        <div className={`indicador${semChamado.length > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{semChamado.length}</span>
          <span className="indicador__rotulo">antigas sem chamado aberto</span>
        </div>
        <div className={`indicador${semMaterial.length > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{semMaterial.length}</span>
          <span className="indicador__rotulo">sem material marcado</span>
        </div>
      </div>

      <p className="nao-imprime" style={{ marginTop: '1rem' }}>
        <Link className="botao" href="/roteiro">
          Ver roteiro de reparos
        </Link>
      </p>

      {pendencias.length === 0 ? (
        <p className="vazio">Nenhuma pendência aberta.</p>
      ) : null}

      {porBloco.map(([bloco, doBloco]) => (
        <section className="secao" key={bloco}>
          <div className="secao__cabeca">
            <h2 className="secao__titulo">{bloco}</h2>
            <span className="secao__contagem">
              {plural(doBloco.length, 'item', 'itens')}
            </span>
          </div>

          <ul className="linhas">
            {doBloco.map((p) => (
              <li className="item-trabalho" key={p.id}>
                <div className="item-trabalho__linha">
                  <Carimbo status="manutencao" />
                  <span className="linha__codigo">{p.local_codigo}</span>

                  <span className="item-trabalho__titulo">
                    {p.item}
                    <span className="linha__nota">
                      {p.observacao ?? 'sem observação'} · aberta em{' '}
                      {dataCurta(p.aberta_em)}
                      {p.tem_chamado_aberto ? ' · tem chamado' : ''}
                    </span>
                  </span>

                  <span
                    className={`linha__medida${
                      p.dias_aberta >= 14
                        ? ' linha__medida--critico'
                        : p.dias_aberta >= 7
                          ? ' linha__medida--alerta'
                          : ''
                    }`}
                  >
                    {plural(p.dias_aberta, 'dia', 'dias')}
                  </span>
                </div>

                <MateriaisDaPendencia
                  pendenciaId={p.id}
                  materiais={p.materiais}
                  suprimentos={opcoes.suprimentos}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
