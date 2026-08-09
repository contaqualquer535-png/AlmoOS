// Adaptadores de modelo.
//
// A escolha do provedor é configuração, não código: cada um recebe o
// mesmo prompt e devolve a mesma forma. Trocar Gemini por Claude, ou
// desligar a IA inteira, é mudar uma variável de ambiente.
//
// Todos devolvem apenas os padrões — os pontos de atenção vêm prontos do
// banco e nunca passam por modelo. Ver a migration 0014.

export interface RespostaDoModelo {
  padroes: string[];
  modelo: string;
  tokensSaida: number | null;
}

export interface Provedor {
  nome: string;
  disponivel: boolean;
  analisar(prompt: string): Promise<RespostaDoModelo>;
}

/**
 * O modelo tende a devolver o JSON embrulhado em cerca de markdown
 * mesmo quando instruído a não fazer. Descascar é mais barato do que
 * insistir no prompt.
 */
function extrairJson(texto: string): unknown {
  const limpo = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(limpo);
}

function lerPadroes(bruto: unknown): string[] {
  if (typeof bruto !== 'object' || bruto === null) return [];
  const lista = (bruto as { padroes_identificados?: unknown }).padroes_identificados;
  if (!Array.isArray(lista)) return [];
  return lista.filter((p): p is string => typeof p === 'string').slice(0, 8);
}

// ---------- Gemini (Google AI Studio) ----------
// Camada gratuita com limite por minuto e por dia. Uma chamada diária
// cabe nela com folga.

function gemini(chave: string, modelo: string): Provedor {
  return {
    nome: `gemini:${modelo}`,
    disponivel: true,
    async analisar(prompt) {
      const resposta = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': chave,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      if (!resposta.ok) {
        throw new Error(`Gemini respondeu ${resposta.status}: ${await resposta.text()}`);
      }

      const corpo = await resposta.json();
      const texto = corpo?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

      return {
        padroes: lerPadroes(extrairJson(texto)),
        modelo: `gemini:${modelo}`,
        tokensSaida: corpo?.usageMetadata?.candidatesTokenCount ?? null,
      };
    },
  };
}

// ---------- Claude (API da Anthropic) ----------
// Cobrada por token, com créditos comprados à parte da assinatura do
// Claude.ai. Mantida aqui porque era o que a especificação previa.

function claude(chave: string, modelo: string): Provedor {
  return {
    nome: `claude:${modelo}`,
    disponivel: true,
    async analisar(prompt) {
      const resposta = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': chave,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 1024,
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!resposta.ok) {
        throw new Error(`Claude respondeu ${resposta.status}: ${await resposta.text()}`);
      }

      const corpo = await resposta.json();
      const texto = corpo?.content?.[0]?.text ?? '{}';

      return {
        padroes: lerPadroes(extrairJson(texto)),
        modelo: `claude:${modelo}`,
        tokensSaida: corpo?.usage?.output_tokens ?? null,
      };
    },
  };
}

// ---------- Compatível com OpenAI ----------
// Um adaptador cobre Groq, OpenRouter, Together, Cerebras, Mistral e
// Ollama local: todos expõem /chat/completions com o mesmo formato. Só
// muda a URL de base e a chave. Existe como escape: limite de camada
// gratuita muda sem aviso, e trocar de fornecedor não deveria exigir
// código novo.

function compativel(base: string, chave: string, modelo: string): Provedor {
  return {
    nome: `${new URL(base).hostname}:${modelo}`,
    disponivel: true,
    async analisar(prompt) {
      const resposta = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${chave}`,
        },
        body: JSON.stringify({
          model: modelo,
          temperature: 0.2,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!resposta.ok) {
        throw new Error(`${base} respondeu ${resposta.status}: ${await resposta.text()}`);
      }

      const corpo = await resposta.json();
      const texto = corpo?.choices?.[0]?.message?.content ?? '{}';

      return {
        padroes: lerPadroes(extrairJson(texto)),
        modelo: `${new URL(base).hostname}:${modelo}`,
        tokensSaida: corpo?.usage?.completion_tokens ?? null,
      };
    },
  };
}

/**
 * Sem chave configurada o job continua rodando: grava os pontos de
 * atenção determinísticos e registra que não houve análise. Falhar aqui
 * seria perder o que já funciona por causa do que é opcional.
 */
const nenhum: Provedor = {
  nome: 'nenhum',
  disponivel: false,
  analisar() {
    return Promise.resolve({ padroes: [], modelo: 'nenhum', tokensSaida: null });
  },
};

export function escolherProvedor(env: Record<string, string | undefined>): Provedor {
  const preferido = (env.PROVEDOR_IA ?? '').toLowerCase();

  const chaveGemini = env.GEMINI_API_KEY;
  const chaveClaude = env.ANTHROPIC_API_KEY;
  const baseCompativel = env.IA_BASE_URL;

  if (preferido === 'nenhum') return nenhum;

  if (preferido === 'claude' && chaveClaude) {
    return claude(chaveClaude, env.MODELO_CLAUDE ?? 'claude-sonnet-5');
  }
  if (preferido === 'gemini' && chaveGemini) {
    return gemini(chaveGemini, env.MODELO_GEMINI ?? 'gemini-flash-latest');
  }
  if (preferido === 'compativel' && baseCompativel) {
    // Ollama local não pede chave; os serviços hospedados, sim.
    return compativel(baseCompativel, env.IA_API_KEY ?? 'nenhuma', env.IA_MODELO ?? 'llama-3.3-70b-versatile');
  }

  // Sem preferência explícita: usa o que tiver chave, Gemini primeiro
  // porque é o que tem camada gratuita sem exigir cartão.
  if (chaveGemini) return gemini(chaveGemini, env.MODELO_GEMINI ?? 'gemini-flash-latest');
  if (baseCompativel) {
    return compativel(baseCompativel, env.IA_API_KEY ?? 'nenhuma', env.IA_MODELO ?? 'llama-3.3-70b-versatile');
  }
  if (chaveClaude) return claude(chaveClaude, env.MODELO_CLAUDE ?? 'claude-sonnet-5');

  return nenhum;
}
