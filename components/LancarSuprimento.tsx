'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { lancarMovimentoDeSuprimento } from '@/lib/data/mutacoes';

/** Lançamento rápido de consumo ou reposição de um suprimento. */
export function LancarSuprimento({
  suprimentoId,
  unidade,
}: {
  suprimentoId: string;
  unidade: string;
}) {
  const router = useRouter();
  const [quantidade, setQuantidade] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function lancar(tipo: 'consumo' | 'reposicao') {
    const valor = Number(quantidade.replace(',', '.'));
    setSalvando(true);
    setErro(null);

    const resultado = await lancarMovimentoDeSuprimento({
      suprimentoId,
      tipo,
      quantidade: valor,
    });

    setSalvando(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'O lançamento não foi gravado.');
      return;
    }

    setQuantidade('');
    router.refresh();
  }

  return (
    <div className="lancamento">
      <label className="visualmente-oculto" htmlFor={`qtd-${suprimentoId}`}>
        Quantidade em {unidade}
      </label>
      <input
        id={`qtd-${suprimentoId}`}
        className="campo__entrada lancamento__quantidade"
        inputMode="decimal"
        placeholder={unidade}
        value={quantidade}
        onChange={(e) => setQuantidade(e.target.value)}
      />
      <button
        type="button"
        className="botao botao--discreto"
        disabled={salvando || quantidade === ''}
        onClick={() => lancar('consumo')}
      >
        Saiu
      </button>
      <button
        type="button"
        className="botao botao--discreto"
        disabled={salvando || quantidade === ''}
        onClick={() => lancar('reposicao')}
      >
        Entrou
      </button>
      {erro ? <span className="erro">{erro}</span> : null}
    </div>
  );
}
