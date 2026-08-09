import Link from 'next/link';

import { buscarSuprimentos } from '@/lib/data/consultas';
import { plural } from '@/lib/formato';
import { PainelSuprimentos } from '@/components/PainelSuprimentos';

export const dynamic = 'force-dynamic';

export default async function PaginaSuprimentos() {
  const suprimentos = await buscarSuprimentos();

  const repor = suprimentos.filter((s) => s.abaixo_do_ponto);
  const acabando = suprimentos.filter(
    (s) => !s.abaixo_do_ponto && s.dias_restantes !== null && s.dias_restantes <= 14,
  );
  const negativos = suprimentos.filter((s) => s.quantidade_atual < 0);

  return (
    <>
      <p className="sobrescrito">Copa, manutenção e limpeza</p>
      <h1 className="titulo">Suprimentos</h1>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador__valor">{suprimentos.length}</span>
          <span className="indicador__rotulo">itens em controle</span>
        </div>
        <div className={`indicador${repor.length > 0 ? ' indicador--alerta' : ' indicador--bom'}`}>
          <span className="indicador__valor">{repor.length}</span>
          <span className="indicador__rotulo">abaixo do ponto de reposição</span>
        </div>
        <div className={`indicador${acabando.length > 0 ? ' indicador--alerta' : ''}`}>
          <span className="indicador__valor">{acabando.length}</span>
          <span className="indicador__rotulo">acabam em duas semanas</span>
        </div>
        <div className={`indicador${negativos.length > 0 ? ' indicador--critico' : ''}`}>
          <span className="indicador__valor">{negativos.length}</span>
          <span className="indicador__rotulo">com saldo negativo</span>
        </div>
      </div>

      {negativos.length > 0 ? (
        <p className="aviso aviso--folga">
          <span className="aviso__marcador">Saldo negativo</span>
          <span>
            {plural(negativos.length, 'item', 'itens')} com saldo abaixo de zero:{' '}
            {negativos.map((s) => s.nome).join(', ')}. Significa reposição não
            registrada — use &ldquo;Contei&rdquo; para acertar.
          </span>
        </p>
      ) : null}

      <p
        className="nao-imprime"
        style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
      >
        <Link className="botao botao--discreto" href="/recursos">
          Recursos emprestáveis
        </Link>
        <Link className="botao botao--discreto" href="/inventario">
          Inventário e almoxarifado
        </Link>
        <Link className="botao botao--discreto" href="/importar">
          Importar planilha
        </Link>
      </p>

      {suprimentos.length === 0 ? (
        <p className="vazio">Nenhum suprimento cadastrado.</p>
      ) : null}

      <PainelSuprimentos suprimentos={suprimentos} />
    </>
  );
}
