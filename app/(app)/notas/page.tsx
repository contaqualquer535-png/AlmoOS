import Link from 'next/link';

import { buscarAnotacoes, buscarOpcoesDeAcaoRapida } from '@/lib/data/consultas';
import { plural } from '@/lib/formato';
import { Anotacoes } from '@/components/Anotacoes';

export const dynamic = 'force-dynamic';

/**
 * Todas as anotações, inclusive as arquivadas.
 *
 * A home mostra as ativas num cartão; esta tela existe para quando você
 * precisa procurar aquilo que anotou semanas atrás e arquivou.
 */
export default async function PaginaNotas({
  searchParams,
}: {
  searchParams: Promise<{ arquivadas?: string }>;
}) {
  const { arquivadas } = await searchParams;
  const mostrarTudo = arquivadas === '1';

  const [anotacoes, opcoes] = await Promise.all([
    buscarAnotacoes(mostrarTudo),
    buscarOpcoesDeAcaoRapida(),
  ]);

  const locais: Record<string, string> = {};
  for (const a of opcoes.ambientes) locais[a.id] = a.codigo;

  const fixadas = anotacoes.filter((a) => a.fixada).length;

  return (
    <>
      <p className="sobrescrito">
        O que ainda não virou tarefa nem chamado
      </p>
      <h1 className="titulo">Anotações</h1>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador__valor">{anotacoes.length}</span>
          <span className="indicador__rotulo">
            {mostrarTudo ? 'no total' : 'ativas'}
          </span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{fixadas}</span>
          <span className="indicador__rotulo">
            {plural(fixadas, 'fixada', 'fixadas')}
          </span>
        </div>
      </div>

      <p className="nao-imprime" style={{ marginTop: '1rem' }}>
        <Link
          className="botao botao--discreto"
          href={mostrarTudo ? '/notas' : '/notas?arquivadas=1'}
        >
          {mostrarTudo ? 'Ver só as ativas' : 'Incluir arquivadas'}
        </Link>
      </p>

      <section className="secao">
        <Anotacoes anotacoes={anotacoes} locais={locais} />
      </section>
    </>
  );
}
