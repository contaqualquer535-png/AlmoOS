import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buscarPlantaDoLocal } from '@/lib/data/consultas';
import { PlantaInterativa } from '@/components/PlantaInterativa';

export const dynamic = 'force-dynamic';

export default async function PaginaPlantaDoLocal({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const dados = await buscarPlantaDoLocal(decodeURIComponent(codigo));

  if (!dados) notFound();

  const { local, planta, status, historico } = dados;

  return (
    <>
      <p className="sobrescrito">{local.bloco ?? 'CETEC'} · Planta</p>
      <h1 className="titulo">{local.codigo}</h1>
      {local.nome ? <p className="vazio">{local.nome}</p> : null}

      <PlantaInterativa
        localId={local.id}
        codigoDoLocal={local.codigo}
        planta={planta}
        status={status}
        historico={historico}
      />

      <p className="nao-imprime" style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem' }}>
        <Link className="botao botao--discreto" href="/planta">
          Todas as plantas
        </Link>
        <Link
          className="botao botao--discreto"
          href={`/ronda/${encodeURIComponent(local.codigo)}`}
        >
          Ronda desta sala
        </Link>
      </p>
    </>
  );
}
