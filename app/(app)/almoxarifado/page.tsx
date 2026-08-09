import Link from 'next/link';

import { buscarAlmoxarifado } from '@/lib/data/consultas';
import { quantidade as formatar, plural } from '@/lib/formato';
import { ROTULO_NATUREZA, type NaturezaNoAlmoxarifado } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

const ORDEM: NaturezaNoAlmoxarifado[] = ['suprimento', 'recurso', 'patrimonio'];

const EXPLICACAO: Record<NaturezaNoAlmoxarifado, string> = {
  suprimento: 'tem saldo, é gasto e não volta',
  recurso: 'contado por quantidade, é emprestado e volta',
  patrimonio: 'peça única com número, é emprestada e volta',
};

// União literal, não string: com typedRoutes ligado o Next só aceita em
// href rotas que ele conhece.
const ONDE_MEXER: Record<NaturezaNoAlmoxarifado, '/suprimentos' | '/recursos' | '/inventario'> =
  {
    suprimento: '/suprimentos',
    recurso: '/recursos',
    patrimonio: '/inventario',
  };

/**
 * Tudo que está no almoxarifado, numa tela.
 *
 * As três tabelas de origem continuam separadas porque as regras são
 * diferentes: saldo de café é mantido por trigger, extensão tem retirada
 * aberta, projetor tem responsável e patrimônio. Fundi-las deixaria dois
 * terços das colunas nulas em dois terços das linhas.
 *
 * Mas você abre a porta e vê uma sala só. Então a leitura é unificada, e
 * só ela — cada natureza continua sendo editada na tela que entende as
 * regras dela.
 */
export default async function PaginaAlmoxarifado({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; natureza?: string }>;
}) {
  const filtro = await searchParams;
  const { itens, resumo } = await buscarAlmoxarifado(filtro.busca);

  const visiveis = filtro.natureza
    ? itens.filter((i) => i.natureza === filtro.natureza)
    : itens;

  const emFalta = itens.filter((i) => i.em_falta);

  return (
    <>
      <p className="sobrescrito">Uma sala, três naturezas de coisa</p>
      <h1 className="titulo">Almoxarifado</h1>

      <div className="indicadores">
        <div
          className={`indicador${resumo.suprimentos.em_falta > 0 ? ' indicador--alerta' : ''}`}
        >
          <span className="indicador__valor">{resumo.suprimentos.itens}</span>
          <span className="indicador__rotulo">
            consumíveis
            {resumo.suprimentos.em_falta > 0
              ? ` · ${resumo.suprimentos.em_falta} para repor`
              : ''}
          </span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{resumo.recursos.disponiveis}</span>
          <span className="indicador__rotulo">
            emprestáveis livres
            {resumo.recursos.fora > 0 ? ` · ${resumo.recursos.fora} fora` : ''}
          </span>
        </div>
        <div
          className={`indicador${resumo.patrimonio.atrasados > 0 ? ' indicador--critico' : ''}`}
        >
          <span className="indicador__valor">{resumo.patrimonio.itens}</span>
          <span className="indicador__rotulo">
            itens de patrimônio
            {resumo.patrimonio.emprestados > 0
              ? ` · ${resumo.patrimonio.emprestados} emprestados`
              : ''}
          </span>
        </div>
        <div className={`indicador${emFalta.length > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{emFalta.length}</span>
          <span className="indicador__rotulo">pedindo atenção</span>
        </div>
      </div>

      <form className="formulario-curto nao-imprime" method="get" style={{ marginTop: '1.25rem' }}>
        <input
          className="campo__entrada"
          type="search"
          name="busca"
          placeholder="Procurar em tudo"
          defaultValue={filtro.busca ?? ''}
        />
        <select
          className="campo__entrada formulario-curto__estreito"
          name="natureza"
          defaultValue={filtro.natureza ?? ''}
          aria-label="Natureza"
        >
          <option value="">Tudo</option>
          {ORDEM.map((n) => (
            <option key={n} value={n}>
              {ROTULO_NATUREZA[n]}
            </option>
          ))}
        </select>
        <button className="botao" type="submit">
          Filtrar
        </button>
        {filtro.busca || filtro.natureza ? (
          <Link className="botao botao--discreto" href="/almoxarifado">
            Limpar
          </Link>
        ) : null}
      </form>

      {ORDEM.filter((n) => visiveis.some((i) => i.natureza === n)).map((natureza) => (
        <section className="secao" key={natureza}>
          <div className="secao__cabeca">
            <h2 className="secao__titulo">{ROTULO_NATUREZA[natureza]}</h2>
            <span className="secao__contagem">
              {EXPLICACAO[natureza]} ·{' '}
              <Link href={ONDE_MEXER[natureza]}>mexer aqui</Link>
            </span>
          </div>

          <ul className="linhas">
            {visiveis
              .filter((i) => i.natureza === natureza)
              .map((item) => (
                <li className="linha" key={`${item.natureza}-${item.id}`}>
                  {item.codigo_barras ? (
                    <span className="linha__codigo">{item.codigo_barras}</span>
                  ) : null}

                  <span className="linha__principal">
                    <span className="linha__titulo">{item.nome}</span>
                    <span className="linha__nota">
                      {item.detalhe}
                      {item.com_quem ? ` · com ${item.com_quem}` : ''}
                      {item.dias_restantes !== null
                        ? ` · dura ${plural(item.dias_restantes, 'dia', 'dias')}`
                        : ''}
                    </span>
                  </span>

                  <span
                    className={`linha__medida${item.em_falta ? ' linha__medida--alerta' : ''}`}
                  >
                    {item.natureza === 'patrimonio'
                      ? item.fora > 0
                        ? 'emprestado'
                        : 'no lugar'
                      : formatar(item.quantidade, item.unidade)}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {visiveis.length === 0 ? (
        <p className="vazio">Nada encontrado com esse filtro.</p>
      ) : null}
    </>
  );
}
