'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { gerarRelatorio } from '@/lib/data/mutacoes';
import type { TipoRelatorio } from '@/lib/types/database';

export function BotaoGerarRelatorio({
  tipo,
  inicio,
  fim,
  rotulo,
}: {
  tipo: TipoRelatorio;
  inicio: string;
  fim: string;
  rotulo: string;
}) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setOcupado(true);
    setErro(null);

    const resultado = await gerarRelatorio({ tipo, inicio, fim });
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'O relatório não foi gerado.');
      return;
    }
    iniciarTransicao(() => router.refresh());
  }

  return (
    <>
      <button className="botao" type="button" disabled={ocupado} onClick={gerar}>
        {ocupado ? 'Congelando…' : rotulo}
      </button>
      {erro ? <p className="erro">{erro}</p> : null}
    </>
  );
}
