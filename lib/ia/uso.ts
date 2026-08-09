import 'server-only';

import { criarClienteServidor } from '@/lib/supabase/server';

/**
 * Registra o custo de uma chamada ao modelo.
 *
 * Falha em silêncio de propósito. Este registro é contabilidade, não
 * função: se a gravação falhar, a resposta do modelo já foi produzida e
 * derrubar o fluxo por causa do contador seria trocar o essencial pelo
 * acessório.
 */
export async function registrarUso(dados: {
  contexto: 'assistente' | 'insight' | 'interpretacao';
  modelo: string;
  tokensEntrada?: number | null;
  tokensSaida?: number | null;
  erro?: string | null;
}): Promise<void> {
  try {
    const supabase = await criarClienteServidor();
    await supabase.from('uso_de_ia').insert({
      contexto: dados.contexto,
      modelo: dados.modelo,
      tokens_entrada: dados.tokensEntrada ?? null,
      tokens_saida: dados.tokensSaida ?? null,
      erro: dados.erro ?? null,
    });
  } catch {
    // Ver comentário acima.
  }
}
