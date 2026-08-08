import { NextResponse } from 'next/server';

import { criarClienteServidor } from '@/lib/supabase/server';
import { acharFerramenta } from '@/lib/ia/ferramentas';
import { conversar, type Parte, type Turno } from '@/lib/ia/gemini';

/**
 * Endpoint do chat com ferramentas.
 *
 * O servidor é sem estado: o histórico inteiro vai e volta a cada
 * requisição. Para uma conversa de operador único isso é mais simples do
 * que manter sessão, e o histórico morre quando a aba fecha — que é o
 * comportamento certo para um chat operacional.
 *
 * O ciclo:
 *   1. manda o histórico ao modelo
 *   2. se ele pedir ferramenta de leitura, executa e volta ao passo 1
 *   3. se pedir ferramenta de escrita, PARA e devolve a proposta para a
 *      interface confirmar
 *   4. com a confirmação, executa e volta ao passo 1
 *
 * O passo 3 é imposto aqui, não no prompt. Um modelo convencido a
 * ignorar instrução ainda esbarra no `if (ferramenta.escreve)`.
 */

// Teto de idas e voltas por requisição. Sem ele, um modelo em laço
// consumiria a cota gratuita do dia numa mensagem só.
const MAXIMO_DE_VOLTAS = 4;

interface Corpo {
  historico: Turno[];
  confirmacao?: { nome: string; args: Record<string, never> };
}

export async function POST(requisicao: Request) {
  // O chat lê e escreve dados do CETEC; sem sessão, nada feito. O
  // middleware já barra a navegação, mas rota de API precisa da própria
  // verificação.
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 });
  }

  let corpo: Corpo;
  try {
    corpo = (await requisicao.json()) as Corpo;
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
  }

  const historico: Turno[] = [...(corpo.historico ?? [])];

  try {
    // Confirmação de uma escrita proposta na requisição anterior.
    if (corpo.confirmacao) {
      const ferramenta = acharFerramenta(corpo.confirmacao.nome);
      if (!ferramenta) {
        return NextResponse.json({ erro: 'Ferramenta desconhecida.' }, { status: 400 });
      }

      const resultado = await ferramenta.executar(corpo.confirmacao.args);
      historico.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: ferramenta.nome,
              response: { resultado } as Record<string, unknown>,
            },
          },
        ],
      });
    }

    for (let volta = 0; volta < MAXIMO_DE_VOLTAS; volta += 1) {
      const resposta = await conversar(historico);
      historico.push({ role: 'model', parts: resposta.partes });

      if (resposta.chamadas.length === 0) {
        return NextResponse.json({ historico, texto: resposta.texto });
      }

      // Escrita interrompe: devolve a proposta e espera o operador.
      const escrita = resposta.chamadas.find((c) => acharFerramenta(c.name)?.escreve);
      if (escrita) {
        const ferramenta = acharFerramenta(escrita.name)!;
        return NextResponse.json({
          historico,
          texto: resposta.texto,
          pendente: {
            nome: escrita.name,
            args: escrita.args,
            resumo: ferramenta.resumir?.(escrita.args) ?? escrita.name,
          },
        });
      }

      // Só leitura: executa tudo e devolve ao modelo na mesma requisição.
      const respostas: Parte[] = [];
      for (const chamada of resposta.chamadas) {
        const ferramenta = acharFerramenta(chamada.name);
        const resultado = ferramenta
          ? await ferramenta.executar(chamada.args)
          : { erro: 'ferramenta desconhecida' };

        respostas.push({
          functionResponse: {
            name: chamada.name,
            response: { resultado } as Record<string, unknown>,
          },
        });
      }
      historico.push({ role: 'user', parts: respostas });
    }

    return NextResponse.json({
      historico,
      texto: 'A conversa deu muitas voltas sem concluir. Tente reformular a pergunta.',
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha ao falar com o modelo.';
    console.error('[assistente]', mensagem);
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
