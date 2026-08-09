import 'server-only';

/**
 * Converte uma anotação livre em trabalho estruturado.
 *
 * Este é o uso certo do modelo neste sistema. "Trocar pilha do relógio
 * da sala C-212" contém local, item e material, mas em linguagem — e
 * extrair isso é justamente o que SQL não faz e modelo faz bem.
 *
 * A conversão acontece **uma vez**, na entrada. Depois disso o
 * resultado é dado como qualquer outro: o roteiro soma as pilhas, o
 * plano do dia agrega, o relatório conta. Nada volta a depender do
 * modelo, e nenhum número exibido passa por ele.
 */

export interface Interpretacao {
  titulo: string;
  local: string | null;
  materiais: Array<{ descricao: string; quantidade: number }>;
  prazo: string | null;
  /** false quando a anotação é lembrete solto e não pede ação num local. */
  acionavel: boolean;
  confianca: 'alta' | 'media' | 'baixa';
}

/**
 * Ferramentas que o operador leva e que não são consumíveis. O modelo
 * recebe esta lista porque "reapertar lâmpada do teto" implica escada
 * sem dizer a palavra escada — e essa inferência é exatamente o que se
 * quer dele.
 */
const FERRAMENTAS = [
  'Escada',
  'Alicate',
  'Chave de fenda',
  'Furadeira',
  'Vassoura',
];

function instrucao(codigos: string[], itens: string[], suprimentos: string[]): string {
  return [
    'Você converte anotações soltas de um auxiliar administrativo em trabalho',
    'estruturado. Ele cuida de salas de aula de um centro tecnológico.',
    '',
    `Salas existentes: ${codigos.join(', ')}`,
    `Itens do checklist: ${itens.join(', ')}`,
    `Suprimentos em estoque: ${suprimentos.join(', ')}`,
    `Ferramentas disponíveis: ${FERRAMENTAS.join(', ')}`,
    '',
    'Regras:',
    '- "local" deve ser exatamente um dos códigos listados, ou null. Corrija',
    '  grafia: "c212", "C 212" e "sala c-212" são todos "C-212".',
    '- "materiais" lista o que precisa ser levado, incluindo ferramentas que a',
    '  tarefa implica mesmo sem serem citadas. Trocar lâmpada do teto pede',
    '  escada. Trocar pilha de relógio de parede pede escada e a pilha.',
    '- Use os nomes exatos da lista de suprimentos quando o material for um',
    '  deles. Isso permite conferir estoque antes de sair.',
    '- Não invente material que a tarefa não exige. Lista vazia é aceitável.',
    '- "titulo" é a ação em uma frase curta e imperativa.',
    '- "acionavel" é false quando a anotação é lembrete, ideia ou observação',
    '  sem ação num local — "perguntar ao Sadi sobre a pintura" é false.',
    '- "confianca" é baixa quando você teve que adivinhar o local ou a ação.',
    '- "prazo" só quando a anotação disser uma data, no formato AAAA-MM-DD.',
    '',
    'Responda APENAS com JSON:',
    '{"titulo":"...","local":"C-212"|null,"materiais":[{"descricao":"Pilha AA","quantidade":1}],',
    ' "prazo":null,"acionavel":true,"confianca":"alta"}',
  ].join('\n');
}

export async function interpretarAnotacao(
  texto: string,
  contexto: { codigos: string[]; itens: string[]; suprimentos: string[] },
): Promise<Interpretacao | null> {
  const chave = process.env.GEMINI_API_KEY;
  // Sem chave a anotação continua existindo como texto livre. A
  // interpretação é enriquecimento, nunca requisito.
  if (!chave) return null;

  const modelo = process.env.MODELO_GEMINI ?? 'gemini-flash-latest';

  const resposta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: instrucao(contexto.codigos, contexto.itens, contexto.suprimentos) }],
        },
        contents: [{ parts: [{ text: texto }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!resposta.ok) return null;

  try {
    const corpo = await resposta.json();
    const bruto = corpo?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const lido = JSON.parse(
      bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''),
    ) as Partial<Interpretacao>;

    if (!lido.titulo?.trim()) return null;

    // O local só é aceito se existir de fato. O modelo às vezes inventa
    // uma sala plausível, e uma tarefa apontando para sala inexistente
    // seria pior do que uma tarefa sem local.
    const local =
      lido.local && contexto.codigos.includes(lido.local) ? lido.local : null;

    return {
      titulo: lido.titulo.trim(),
      local,
      materiais: Array.isArray(lido.materiais)
        ? lido.materiais
            .filter((m) => typeof m?.descricao === 'string' && m.descricao.trim())
            .map((m) => ({
              descricao: m.descricao.trim(),
              quantidade: Number(m.quantidade) > 0 ? Number(m.quantidade) : 1,
            }))
            .slice(0, 6)
        : [],
      prazo: /^\d{4}-\d{2}-\d{2}$/.test(lido.prazo ?? '') ? lido.prazo! : null,
      acionavel: lido.acionavel !== false,
      confianca:
        lido.confianca === 'alta' || lido.confianca === 'baixa' ? lido.confianca : 'media',
    };
  } catch {
    return null;
  }
}
