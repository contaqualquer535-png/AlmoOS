import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buscarItemDoInventario } from '@/lib/data/consultas';
import { dataCurta, dataHoraCurta } from '@/lib/formato';
import { ROTULO_MOVIMENTACAO } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function PaginaItemDoInventario({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dados = await buscarItemDoInventario(id);

  if (!dados) notFound();

  const { item, movimentacoes, locais } = dados;

  return (
    <>
      <p className="sobrescrito">
        {item.codigo_barras ?? 'Sem patrimônio'} · Inventário
      </p>
      <h1 className="titulo">{item.item}</h1>
      {item.descricao ? <p className="vazio">{item.descricao}</p> : null}

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Situação</h2>
        </div>
        <ul className="linhas">
          <li className="linha">
            <span className="linha__principal">Local atual</span>
            <span className="linha__medida">{locais[item.local_atual_id] ?? '—'}</span>
          </li>
          <li className="linha">
            <span className="linha__principal">Local padrão</span>
            <span className="linha__medida">{locais[item.local_padrao_id] ?? '—'}</span>
          </li>
          <li className="linha">
            <span className="linha__principal">Responsável</span>
            <span className="linha__medida">{item.responsavel ?? 'no lugar'}</span>
          </li>
          {item.previsao_devolucao ? (
            <li className="linha">
              <span className="linha__principal">Previsão de devolução</span>
              <span className="linha__medida">{dataCurta(item.previsao_devolucao)}</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Movimentação</h2>
          <span className="secao__contagem">{movimentacoes.length}</span>
        </div>

        {movimentacoes.length === 0 ? (
          <p className="vazio">
            O item nunca saiu do lugar — nenhuma movimentação registrada.
          </p>
        ) : (
          <ol className="linhas">
            {movimentacoes.map((m) => (
              <li className="linha" key={m.id}>
                <span className="linha__codigo">{dataHoraCurta(m.data)}</span>
                <span className="linha__principal">
                  <span className="linha__titulo">
                    {ROTULO_MOVIMENTACAO[m.tipo]}
                    {' · '}
                    {m.local_origem_id ? `${locais[m.local_origem_id] ?? '?'} → ` : ''}
                    {locais[m.local_destino_id] ?? '?'}
                  </span>
                  {m.responsavel || m.observacao ? (
                    <span className="linha__nota">
                      {[m.responsavel, m.observacao].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </span>
                {m.previsao_devolucao ? (
                  <span className="linha__medida">
                    devolver {dataCurta(m.previsao_devolucao)}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="nao-imprime" style={{ marginTop: '2rem' }}>
        <Link className="botao botao--discreto" href="/inventario">
          Voltar para o inventário
        </Link>
      </p>
    </>
  );
}
