import Link from 'next/link';

import { buscarTarefasEChamados, buscarLocaisParaSelecao } from '@/lib/data/consultas';
import { PainelTarefas } from '@/components/PainelTarefas';
import { PainelChamados } from '@/components/PainelChamados';
import { ColarEmailDoServi } from '@/components/ColarEmailDoServi';
import { CHAMADOS_ABERTOS, TAREFAS_ABERTAS } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

const FILTROS = [
  { valor: 'abertos', rotulo: 'Em aberto' },
  { valor: 'encerrados', rotulo: 'Encerrados' },
  { valor: 'todos', rotulo: 'Todos' },
] as const;

/**
 * Tarefa e chamado convivem numa página só porque, na cabeça de quem
 * trabalha, são a mesma pergunta: o que está em aberto. O que os separa
 * é o ciclo de vida (decisão 03 do ADR), e isso aparece nas transições
 * que cada um oferece — não em rotas diferentes.
 *
 * O filtro é explícito e mostra a contagem de cada estado. Antes havia
 * um link discreto para o histórico, e o efeito prático era o operador
 * achar que os encerrados não tinham sido importados.
 */
export default async function PaginaTarefas({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const selecionado = filtro ?? 'abertos';

  // Traz tudo e filtra aqui: são poucas centenas de linhas, e assim as
  // contagens de cada aba ficam corretas sem três consultas.
  const [{ tarefas, chamados, locais }, ambientes] = await Promise.all([
    buscarTarefasEChamados(true),
    buscarLocaisParaSelecao(),
  ]);

  const tarefaAberta = (s: string) =>
    (TAREFAS_ABERTAS as readonly string[]).includes(s);
  const chamadoAberto = (s: string) =>
    (CHAMADOS_ABERTOS as readonly string[]).includes(s);

  const contagem = {
    abertos:
      tarefas.filter((t) => tarefaAberta(t.status)).length +
      chamados.filter((c) => chamadoAberto(c.status)).length,
    encerrados:
      tarefas.filter((t) => !tarefaAberta(t.status)).length +
      chamados.filter((c) => !chamadoAberto(c.status)).length,
    todos: tarefas.length + chamados.length,
  };

  const tarefasVisiveis =
    selecionado === 'todos'
      ? tarefas
      : tarefas.filter((t) =>
          selecionado === 'abertos' ? tarefaAberta(t.status) : !tarefaAberta(t.status),
        );

  const chamadosVisiveis =
    selecionado === 'todos'
      ? chamados
      : chamados.filter((c) =>
          selecionado === 'abertos' ? chamadoAberto(c.status) : !chamadoAberto(c.status),
        );

  return (
    <>
      <p className="sobrescrito">Trabalho interno e trâmite externo</p>
      <h1 className="titulo">Tarefas e chamados</h1>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador__valor">
            {chamados.filter((c) => chamadoAberto(c.status)).length}
          </span>
          <span className="indicador__rotulo">chamados em aberto</span>
        </div>
        <div className="indicador indicador--bom">
          <span className="indicador__valor">
            {chamados.filter((c) => !chamadoAberto(c.status)).length}
          </span>
          <span className="indicador__rotulo">chamados encerrados</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">
            {tarefas.filter((t) => tarefaAberta(t.status)).length}
          </span>
          <span className="indicador__rotulo">tarefas pendentes</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">
            {
              chamados.filter(
                (c) =>
                  chamadoAberto(c.status) &&
                  (Date.now() - new Date(c.aberto_em).getTime()) / 86_400_000 >= 14,
              ).length
            }
          </span>
          <span className="indicador__rotulo">abertos há 14+ dias</span>
        </div>
      </div>

      <div className="planta__paleta nao-imprime" style={{ marginTop: '1rem' }}>
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            className={`botao botao--discreto${
              selecionado === f.valor ? ' botao--selecionado' : ''
            }`}
            href={f.valor === 'abertos' ? '/tarefas' : `/tarefas?filtro=${f.valor}`}
          >
            {f.rotulo} ({contagem[f.valor]})
          </Link>
        ))}
      </div>

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Chamados</h2>
          <span className="secao__contagem">{chamadosVisiveis.length}</span>
        </div>
        <PainelChamados
          chamados={chamadosVisiveis}
          locais={locais}
          ambientes={ambientes}
        />

        <div style={{ marginTop: '1.5rem' }}>
          <ColarEmailDoServi />
        </div>
      </section>

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Tarefas</h2>
          <span className="secao__contagem">{tarefasVisiveis.length}</span>
        </div>
        <PainelTarefas tarefas={tarefasVisiveis} locais={locais} ambientes={ambientes} />
      </section>
    </>
  );
}
