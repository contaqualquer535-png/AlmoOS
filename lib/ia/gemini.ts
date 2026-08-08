import 'server-only';

import { declaracoesParaGemini } from '@/lib/ia/ferramentas';

/**
 * Cliente mínimo do Gemini para o chat com ferramentas.
 *
 * Não usa SDK de propósito: são duas chamadas HTTP e o SDK traria peso
 * e uma superfície de atualização que este projeto não precisa manter.
 */

export interface ParteDeTexto {
  text: string;
}

export interface ParteDeChamada {
  functionCall: { name: string; args: Record<string, never> };
}

export interface ParteDeResposta {
  functionResponse: { name: string; response: Record<string, unknown> };
}

export type Parte = ParteDeTexto | ParteDeChamada | ParteDeResposta;

export interface Turno {
  role: 'user' | 'model';
  parts: Parte[];
}

export function ehChamada(parte: Parte): parte is ParteDeChamada {
  return 'functionCall' in parte;
}

export function ehTexto(parte: Parte): parte is ParteDeTexto {
  return 'text' in parte;
}

const INSTRUCAO = [
  'Você é o assistente do sistema de gestão do CETEC, centro tecnológico da',
  'Universidade de Caxias do Sul. Fala com o auxiliar administrativo que cuida',
  'de 17 salas de aula, do almoxarifado e dos chamados ao SEAMB.',
  '',
  'Sobre o domínio:',
  '- A ronda de verificação acontece segundas, quartas e sextas, com 8 itens por sala.',
  '- Os códigos da planilha são ✓ (ok), M (manutenção), X (resolvido), T (trocado).',
  '- Tarefa é o que ele mesmo executa; chamado é o que sai para o SEAMB.',
  '- Salas têm código como C-212, K-306, B-111/113.',
  '',
  'Como agir:',
  '- Antes de afirmar qualquer número, consulte com consultar_status. Nunca estime.',
  '- Para criar tarefa, chamado ou lançar suprimento, chame a ferramenta correspondente.',
  '  A confirmação do operador é pedida pela interface, não por você — não pergunte',
  '  "posso criar?" antes de chamar; chame, que a tela cuida da confirmação.',
  '- Se faltar informação essencial, pergunte em vez de inventar.',
  '- Responda em português do Brasil, direto, sem preâmbulo. Frases curtas.',
].join('\n');

export interface RespostaDoTurno {
  partes: Parte[];
  texto: string;
  chamadas: Array<{ name: string; args: Record<string, never> }>;
}

export async function conversar(historico: Turno[]): Promise<RespostaDoTurno> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) {
    throw new Error(
      'GEMINI_API_KEY não configurada. Crie uma chave gratuita em aistudio.google.com ' +
        'e coloque no .env.local (e nas variáveis do Vercel).',
    );
  }

  const modelo = process.env.MODELO_GEMINI ?? 'gemini-2.5-flash';

  const resposta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCAO }] },
        contents: historico,
        tools: [{ functionDeclarations: declaracoesParaGemini() }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
    },
  );

  if (!resposta.ok) {
    const corpo = await resposta.text();
    if (resposta.status === 429) {
      throw new Error(
        'Limite da camada gratuita do Gemini atingido. Tente de novo em alguns minutos.',
      );
    }
    throw new Error(`Gemini respondeu ${resposta.status}: ${corpo}`);
  }

  const corpo = await resposta.json();
  const partes = (corpo?.candidates?.[0]?.content?.parts ?? []) as Parte[];

  return {
    partes,
    texto: partes.filter(ehTexto).map((p) => p.text).join('').trim(),
    chamadas: partes.filter(ehChamada).map((p) => p.functionCall),
  };
}
