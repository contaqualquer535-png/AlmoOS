import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  buscarLocalPorCodigo,
  buscarItensChecklist,
  buscarVerificacoesDoDia,
  dataDeHoje,
} from '@/lib/data/consultas';
import { dataPorExtenso } from '@/lib/formato';
import { FormularioRonda } from '@/components/FormularioRonda';

export const dynamic = 'force-dynamic';

export default async function PaginaRondaDoLocal({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const local = await buscarLocalPorCodigo(decodeURIComponent(codigo));

  if (!local) notFound();

  const [itens, lancados] = await Promise.all([
    buscarItensChecklist(),
    buscarVerificacoesDoDia(local.id, dataDeHoje()),
  ]);

  return (
    <>
      <p className="sobrescrito">
        {local.bloco ?? 'CETEC'} · {dataPorExtenso(dataDeHoje())}
      </p>
      <h1 className="titulo">{local.codigo}</h1>
      {local.nome ? <p className="vazio">{local.nome}</p> : null}

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Checklist</h2>
          <span className="secao__contagem">
            {Object.keys(lancados).length}/{itens.length} lançados
          </span>
        </div>

        <FormularioRonda localId={local.id} itens={itens} lancados={lancados} />
      </section>

      <p style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link className="botao botao--discreto" href="/ronda">
          Voltar para a lista de salas
        </Link>
        <Link
          className="botao botao--discreto"
          href={`/planta/${encodeURIComponent(local.codigo)}`}
        >
          Planta desta sala
        </Link>
      </p>
    </>
  );
}
