import Link from 'next/link';

import { buscarTarefasEChamados, buscarLocaisParaSelecao } from '@/lib/data/consultas';
import { PainelTarefas } from '@/components/PainelTarefas';
import { PainelChamados } from '@/components/PainelChamados';
import { ColarEmailDoServi } from '@/components/ColarEmailDoServi';

export const dynamic = 'force-dynamic';

/**
 * Tarefa e chamado convivem numa página só porque, na cabeça de quem
 * trabalha, são a mesma pergunta: o que está em aberto. O que os separa
 * é o ciclo de vida (decisão 03 do ADR), e isso aparece nas transições
 * que cada um oferece — não em rotas diferentes.
 */
export default async function PaginaTarefas({
  searchParams,
}: {
  searchParams: Promise<{ historico?: string }>;
}) {
  const { historico } = await searchParams;
  const mostrarTudo = historico === '1';

  const [{ tarefas, chamados, locais }, ambientes] = await Promise.all([
    buscarTarefasEChamados(mostrarTudo),
    buscarLocaisParaSelecao(),
  ]);

  return (
    <>
      <p className="sobrescrito">
        {mostrarTudo ? 'Histórico completo' : 'Em aberto'}
      </p>
      <h1 className="titulo">Tarefas e chamados</h1>

      <p className="nao-imprime" style={{ marginTop: '1rem' }}>
        <Link
          className="botao botao--discreto"
          href={mostrarTudo ? '/tarefas' : '/tarefas?historico=1'}
        >
          {mostrarTudo ? 'Ver só o que está em aberto' : 'Ver histórico completo'}
        </Link>
      </p>

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Tarefas</h2>
          <span className="secao__contagem">{tarefas.length}</span>
        </div>
        <PainelTarefas tarefas={tarefas} locais={locais} ambientes={ambientes} />
      </section>

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Chamados</h2>
          <span className="secao__contagem">{chamados.length}</span>
        </div>
        <PainelChamados chamados={chamados} locais={locais} ambientes={ambientes} />

        <div style={{ marginTop: '1.5rem' }}>
          <ColarEmailDoServi />
        </div>
      </section>
    </>
  );
}
