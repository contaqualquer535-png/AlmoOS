import { buscarSuprimentos } from '@/lib/data/consultas';
import { quantidade, plural } from '@/lib/formato';
import { LancarSuprimento } from '@/components/LancarSuprimento';

export const dynamic = 'force-dynamic';

const ROTULO_CATEGORIA: Record<string, string> = {
  copa: 'Copa',
  manutencao: 'Manutenção',
  limpeza: 'Limpeza',
};

export default async function PaginaSuprimentos() {
  const suprimentos = await buscarSuprimentos();
  const categorias = [...new Set(suprimentos.map((s) => s.categoria))];

  return (
    <>
      <p className="sobrescrito">Estoque</p>
      <h1 className="titulo">Suprimentos</h1>

      {suprimentos.length === 0 ? (
        <p className="vazio">Nenhum suprimento cadastrado.</p>
      ) : (
        categorias.map((categoria) => (
          <section className="secao" key={categoria}>
            <div className="secao__cabeca">
              <h2 className="secao__titulo">{ROTULO_CATEGORIA[categoria] ?? categoria}</h2>
              <span className="secao__contagem">
                {suprimentos.filter((s) => s.categoria === categoria && s.abaixo_do_ponto)
                  .length}{' '}
                para repor
              </span>
            </div>

            <ul className="linhas">
              {suprimentos
                .filter((s) => s.categoria === categoria)
                .map((s) => (
                  <li className="linha linha--empilha" key={s.id}>
                    <span className="linha__principal">
                      <span className="linha__titulo">{s.nome}</span>
                      <span className="linha__nota">
                        {quantidade(s.quantidade_atual, s.unidade)} em estoque
                        {s.dias_restantes !== null
                          ? ` · dura mais ${plural(s.dias_restantes, 'dia', 'dias')}`
                          : ''}
                      </span>
                    </span>
                    <LancarSuprimento suprimentoId={s.id} unidade={s.unidade} />
                    <span
                      className={`linha__medida${
                        s.abaixo_do_ponto ? ' linha__medida--alerta' : ''
                      }`}
                    >
                      {s.abaixo_do_ponto ? 'repor' : 'ok'}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
