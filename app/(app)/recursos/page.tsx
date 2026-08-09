import { buscarRecursos, buscarLocaisParaSelecao } from '@/lib/data/consultas';
import { plural } from '@/lib/formato';
import { PainelRecursos } from '@/components/PainelRecursos';

export const dynamic = 'force-dynamic';

/**
 * Recursos: o que se empresta e se conta.
 *
 * Existe porque nem `suprimentos` nem `inventario` respondiam "quantas
 * extensões eu ainda tenho e com quem estão as outras" — o primeiro não
 * volta, o segundo é peça única. Ver a decisão 12 do ADR.
 */
export default async function PaginaRecursos() {
  const [{ recursos, emprestimos, locais }, ambientes] = await Promise.all([
    buscarRecursos(),
    buscarLocaisParaSelecao(),
  ]);

  const fora = recursos.reduce((soma, r) => soma + r.quantidade_emprestada, 0);
  const atrasadas = recursos.reduce((soma, r) => soma + r.retiradas_atrasadas, 0);
  const abaixo = recursos.filter((r) => r.abaixo_do_minimo);

  return (
    <>
      <p className="sobrescrito">Extensão, cabo, controle — o que se empresta e volta</p>
      <h1 className="titulo">Recursos</h1>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador__valor">
            {recursos.reduce((s, r) => s + r.quantidade_disponivel, 0)}
          </span>
          <span className="indicador__rotulo">unidades disponíveis</span>
        </div>
        <div className={`indicador${fora > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{fora}</span>
          <span className="indicador__rotulo">fora do almoxarifado</span>
        </div>
        <div className={`indicador${atrasadas > 0 ? ' indicador--critico' : ''}`}>
          <span className="indicador__valor">{atrasadas}</span>
          <span className="indicador__rotulo">retiradas vencidas</span>
        </div>
        <div className={`indicador${abaixo.length > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{abaixo.length}</span>
          <span className="indicador__rotulo">abaixo do mínimo</span>
        </div>
      </div>

      {abaixo.length > 0 ? (
        <p className="aviso aviso--folga">
          <span className="aviso__marcador">Atenção</span>
          <span>
            {plural(abaixo.length, 'recurso', 'recursos')} sem folga:{' '}
            {abaixo.map((r) => r.nome).join(', ')}.
          </span>
        </p>
      ) : null}

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">O que existe</h2>
          <span className="secao__contagem">{recursos.length} tipos</span>
        </div>

        <PainelRecursos
          recursos={recursos}
          emprestimos={emprestimos}
          locais={locais}
          ambientes={ambientes}
        />
      </section>
    </>
  );
}
