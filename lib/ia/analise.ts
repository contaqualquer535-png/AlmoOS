import 'server-only';

/**
 * Análise sob demanda, do lado do site.
 *
 * A Edge Function `insights` faz o mesmo de madrugada. As duas existem
 * porque resolvem coisas diferentes: o cron garante que há sempre uma
 * leitura recente quando você chega; o botão serve para depois de uma
 * ronda pesada, quando esperar até amanhã não faz sentido.
 *
 * O prompt é o mesmo nos dois lugares e mora aqui — duas redações da
 * mesma instrução divergem em um mês e ninguém percebe.
 */

export interface LeituraDoModelo {
  padroes: string[];
  previsoes: string[];
  modelo: string;
  tokensSaida: number | null;
}

const INSTRUCAO = [
  'Você analisa dados de manutenção predial de um centro tecnológico universitário',
  'com 17 salas de aula, almoxarifado e chamados a um setor externo (SEAMB).',
  '',
  'Você recebe três blocos:',
  '  agregados  — contagens por período, rankings, séries semanais',
  '  previsoes  — projeções JÁ CALCULADAS por aritmética sobre o histórico',
  '  atencao    — alertas óbvios já detectados',
  '',
  'NÃO repita o que está em previsoes e atencao. Eles já aparecem na tela.',
  '',
  'Sua tarefa tem duas partes:',
  '',
  '1. padroes_identificados — o que só aparece cruzando os blocos.',
  '   Concentração de um tipo de problema num bloco, item que quebra sempre',
  '   no mesmo lugar, relação entre consumo de suprimento e volume de chamados,',
  '   mudança de ritmo entre as semanas.',
  '',
  '2. previsoes_qualitativas — o que provavelmente vai exigir atenção nas',
  '   próximas duas semanas e NÃO está nas previsões aritméticas. Baseie-se',
  '   nos padrões que você mesmo identificou.',
  '',
  'Regras:',
  '- Só afirme o que os números sustentam. Não especule causa.',
  '- Cite os números concretos em cada item.',
  '- Lista vazia é resposta aceitável e preferível a inventar padrão.',
  '- Máximo de 5 por lista, em português do Brasil, uma frase cada.',
  '',
  'Responda APENAS com JSON:',
  '{"padroes_identificados": ["..."], "previsoes_qualitativas": ["..."]}',
].join('\n');

function extrairJson(texto: string): unknown {
  const limpo = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(limpo);
}

function lerLista(bruto: unknown, chave: string): string[] {
  if (typeof bruto !== 'object' || bruto === null) return [];
  const lista = (bruto as Record<string, unknown>)[chave];
  if (!Array.isArray(lista)) return [];
  return lista.filter((p): p is string => typeof p === 'string').slice(0, 5);
}

export async function analisar(contexto: {
  agregados: unknown;
  previsoes: unknown;
  atencao: unknown;
}): Promise<LeituraDoModelo> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) {
    throw new Error(
      'GEMINI_API_KEY não configurada. Crie uma chave gratuita em aistudio.google.com.',
    );
  }

  // Alias e não versão fixa. Nome de versão envelhece: o Google
  // aposenta modelos para contas novas e o sistema começa a devolver
  // 404 sem ninguém ter mexido em nada. O custo do alias é que o modelo
  // por trás muda sozinho; para uma análise de padrões isso é aceitável,
  // e MODELO_GEMINI permite fixar quando não for.
  const modelo = process.env.MODELO_GEMINI ?? 'gemini-flash-latest';

  const resposta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCAO }] },
        contents: [{ parts: [{ text: JSON.stringify(contexto) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!resposta.ok) {
    if (resposta.status === 429) {
      throw new Error(
        'Limite da camada gratuita do Gemini atingido. Tente de novo em alguns minutos.',
      );
    }
    if (resposta.status === 404) {
      throw new Error(
        `O modelo "${modelo}" não existe mais ou não está disponível para esta chave. ` +
          'Remova a variável MODELO_GEMINI para voltar ao alias gemini-flash-latest, ' +
          'que acompanha os lançamentos.',
      );
    }
    throw new Error(`Gemini respondeu ${resposta.status}: ${await resposta.text()}`);
  }

  const corpo = await resposta.json();
  const texto = corpo?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const lido = extrairJson(texto);

  return {
    padroes: lerLista(lido, 'padroes_identificados'),
    previsoes: lerLista(lido, 'previsoes_qualitativas'),
    modelo: `gemini:${modelo}`,
    tokensSaida: corpo?.usageMetadata?.candidatesTokenCount ?? null,
  };
}
