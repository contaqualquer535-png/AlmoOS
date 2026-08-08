import Link from 'next/link';

import {
  buscarInventario,
  buscarLocaisParaSelecao,
  dataDeHoje,
} from '@/lib/data/consultas';
import { plural } from '@/lib/formato';
import { PainelInventario } from '@/components/PainelInventario';

export const dynamic = 'force-dynamic';

const SITUACOES = [
  { valor: '', rotulo: 'Tudo' },
  { valor: 'no_lugar', rotulo: 'No lugar' },
  { valor: 'emprestados', rotulo: 'Emprestados' },
] as const;

/**
 * Inventário e almoxarifado na mesma tela: o almoxarifado é uma linha em
 * `locais` como qualquer outra (decisão 04 do ADR), então separar em duas
 * rotas seria recriar a distinção que o schema aboliu.
 */
export default async function PaginaInventario({
  searchParams,
}: {
  searchParams: Promise<{ local?: string; responsavel?: string; busca?: string; situacao?: string }>;
}) {
  const filtro = await searchParams;

  const [inventario, ambientes] = await Promise.all([
    buscarInventario({
      localId: filtro.local,
      responsavel: filtro.responsavel,
      busca: filtro.busca,
      situacao: filtro.situacao,
    }),
    buscarLocaisParaSelecao(),
  ]);

  const almoxarifado = ambientes.find((a) => a.codigo === 'ALMOX');
  const filtrando = Boolean(
    filtro.local || filtro.responsavel || filtro.busca || filtro.situacao,
  );

  return (
    <>
      <p className="sobrescrito">Patrimônio sob responsabilidade do CETEC</p>
      <h1 className="titulo">Inventário e almoxarifado</h1>

      <p
        className={`aviso ${inventario.atrasados === 0 ? 'aviso--ronda' : 'aviso--folga'}`}
      >
        <span className="aviso__marcador">Acervo</span>
        <span>
          {inventario.total} itens · {inventario.emprestados} emprestados
          {inventario.atrasados > 0
            ? ` · ${plural(inventario.atrasados, 'devolução atrasada', 'devoluções atrasadas')}`
            : ''}
        </span>
      </p>

      {/* Filtro por GET: o estado da busca fica na URL e sobrevive ao
          recarregar, ao voltar e a ser colado num chamado. */}
      <form className="formulario-curto nao-imprime" method="get" style={{ marginTop: '1.25rem' }}>
        <input
          className="campo__entrada"
          type="search"
          name="busca"
          placeholder="Item ou patrimônio"
          defaultValue={filtro.busca ?? ''}
        />
        <select
          className="campo__entrada formulario-curto__estreito"
          name="local"
          defaultValue={filtro.local ?? ''}
          aria-label="Local atual"
        >
          <option value="">Qualquer local</option>
          {ambientes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.codigo}
            </option>
          ))}
        </select>
        <select
          className="campo__entrada formulario-curto__estreito"
          name="situacao"
          defaultValue={filtro.situacao ?? ''}
          aria-label="Situação"
        >
          {SITUACOES.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>
        <button className="botao" type="submit">
          Filtrar
        </button>
        {filtrando ? (
          <Link className="botao botao--discreto" href="/inventario">
            Limpar
          </Link>
        ) : null}
      </form>

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Itens</h2>
          <span className="secao__contagem">
            {filtrando
              ? `${inventario.itens.length} de ${inventario.total}`
              : plural(inventario.itens.length, 'item', 'itens')}
          </span>
        </div>

        <PainelInventario
          itens={inventario.itens}
          locais={inventario.locais}
          ambientes={ambientes}
          almoxarifadoId={almoxarifado?.id ?? null}
          hoje={dataDeHoje()}
        />
      </section>
    </>
  );
}
