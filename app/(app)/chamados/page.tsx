import Link from 'next/link';

import { buscarTarefasEChamados, buscarLocaisParaSelecao } from '@/lib/data/consultas';
import { PainelChamados } from '@/components/PainelChamados';
import { ColarEmailDoServi } from '@/components/ColarEmailDoServi';
import { CHAMADOS_ABERTOS } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

const FILTROS = [
  { valor: 'abertos', rotulo: 'Em aberto' },
  { valor: 'encerrados', rotulo: 'Encerrados' },
  { valor: 'todos', rotulo: 'Todos' },
] as const;

/**
 * Só o que tramita fora do CETEC.
 *
 * Chamado saiu da tela de trabalho porque não é trabalho seu: depende
 * de terceiro, tem protocolo externo e um ciclo de vida que acompanha o
 * SERVi, não o seu dia. Misturado com tarefa, ele criava a impressão de
 * que estava sob seu controle.
 */
export default async function PaginaChamados({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const selecionado = filtro ?? 'abertos';

  const [{ chamados, locais }, ambientes] = await Promise.all([
    buscarTarefasEChamados(true),
    buscarLocaisParaSelecao(),
  ]);

  const aberto = (s: string) => (CHAMADOS_ABERTOS as readonly string[]).includes(s);

  const contagem = {
    abertos: chamados.filter((c) => aberto(c.status)).length,
    encerrados: chamados.filter((c) => !aberto(c.status)).length,
    todos: chamados.length,
  };

  const visiveis =
    selecionado === 'todos'
      ? chamados
      : chamados.filter((c) =>
          selecionado === 'abertos' ? aberto(c.status) : !aberto(c.status),
        );

  const encalhados = chamados.filter(
    (c) => aberto(c.status) && (Date.now() - new Date(c.aberto_em).getTime()) / 86_400_000 >= 14,
  );

  const porFila = new Map<string, number>();
  for (const c of chamados) {
    if (!aberto(c.status)) continue;
    porFila.set(c.destino, (porFila.get(c.destino) ?? 0) + 1);
  }

  return (
    <>
      <p className="sobrescrito">O que tramita no SERVi</p>
      <h1 className="titulo">Chamados</h1>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador__valor">{contagem.abertos}</span>
          <span className="indicador__rotulo">em aberto</span>
        </div>
        <div className={`indicador${encalhados.length > 0 ? ' indicador--critico' : ''}`}>
          <span className="indicador__valor">{encalhados.length}</span>
          <span className="indicador__rotulo">há 14 dias ou mais</span>
        </div>
        <div className="indicador indicador--bom">
          <span className="indicador__valor">{contagem.encerrados}</span>
          <span className="indicador__rotulo">encerrados</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{porFila.size}</span>
          <span className="indicador__rotulo">filas envolvidas</span>
        </div>
      </div>

      {encalhados.length > 0 ? (
        <p className="aviso aviso--folga">
          <span className="aviso__marcador">Encalhado</span>
          <span>
            {encalhados.map((c) => c.titulo).slice(0, 3).join(' · ')}
            {encalhados.length > 3 ? ` e mais ${encalhados.length - 3}` : ''}.
          </span>
        </p>
      ) : null}

      <div className="planta__paleta nao-imprime" style={{ marginTop: '1rem' }}>
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            className={`botao botao--discreto${
              selecionado === f.valor ? ' botao--selecionado' : ''
            }`}
            href={f.valor === 'abertos' ? '/chamados' : `/chamados?filtro=${f.valor}`}
          >
            {f.rotulo} ({contagem[f.valor]})
          </Link>
        ))}
      </div>

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Chamados</h2>
          <span className="secao__contagem">{visiveis.length}</span>
        </div>

        <PainelChamados chamados={visiveis} locais={locais} ambientes={ambientes} />

        <div style={{ marginTop: '1.5rem' }}>
          <ColarEmailDoServi />
        </div>
      </section>
    </>
  );
}
