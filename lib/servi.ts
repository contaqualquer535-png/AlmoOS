/**
 * Extração dos dados de um e-mail do SERVi.
 *
 * O assunto sempre carrega o número entre colchetes:
 *
 *   [Chamado#001538977] Abertura de chamado #001538977: Serviços de Lavanderia
 *
 * Esse número é a única coisa realmente confiável na mensagem. Título,
 * fila e estado vêm do corpo em formatos que mudam conforme o setor
 * responde, então tudo além do número é tentativa — e a ausência deles
 * nunca impede o registro.
 *
 * Sem dependência de servidor: o mesmo arquivo roda na Edge Function e
 * na tela de colagem manual.
 */

export interface MensagemDoServi {
  protocolo: string;
  assunto: string;
  titulo: string | null;
  fila: string | null;
  remetente: string | null;
  corpo: string;
  recebidoEm: string | null;
  idExterno: string | null;
}

/** `[Chamado#001538977]` ou, na falta, `#001538977` solto no assunto. */
export function extrairProtocolo(texto: string): string | null {
  const entreColchetes = texto.match(/\[\s*chamado\s*#\s*(\d{4,})\s*\]/i);
  if (entreColchetes?.[1]) return entreColchetes[1];

  const solto = texto.match(/chamado\s*#?\s*(\d{6,})/i);
  return solto?.[1] ?? null;
}

/**
 * O que vem depois do último `: ` no assunto. No padrão do SERVi isso é
 * o título real: "Abertura de chamado #001538977: Serviços de Lavanderia".
 */
export function extrairTitulo(assunto: string): string | null {
  const semPrefixo = assunto.replace(/\[[^\]]*\]\s*/g, '').trim();
  const posDoisPontos = semPrefixo.match(/:\s*(.+)$/);
  const bruto = (posDoisPontos?.[1] ?? semPrefixo).trim();
  return bruto || null;
}

/** Filas do SERVi têm a forma GLOG::SMGE::Manutenção. */
export function extrairFila(texto: string): string | null {
  const achado = texto.match(/\b([A-Z]{2,}(?:::[^\s,;<>"']+){1,3})/);
  return achado?.[1] ?? null;
}

function extrairCabecalho(bruto: string, nome: string): string | null {
  const padrao = new RegExp(`^${nome}:\\s*(.+)$`, 'im');
  const achado = bruto.match(padrao);
  return achado?.[1]?.trim() ?? null;
}

/**
 * Lê um e-mail colado inteiro, com ou sem cabeçalhos. Aceita tanto o
 * texto cru do "mostrar original" quanto o que sai de um Ctrl+C na
 * janela da mensagem.
 */
export function lerEmailColado(bruto: string): MensagemDoServi | null {
  const texto = bruto.trim();
  if (!texto) return null;

  const assuntoDoCabecalho = extrairCabecalho(texto, 'subject') ?? extrairCabecalho(texto, 'assunto');
  // Sem cabeçalho, a primeira linha que mencione o chamado costuma ser
  // o assunto copiado junto com o corpo.
  const primeiraComProtocolo = texto
    .split('\n')
    .find((linha) => /chamado\s*#?\s*\d{4,}/i.test(linha));

  const assunto = (assuntoDoCabecalho ?? primeiraComProtocolo ?? '').trim();
  const protocolo = extrairProtocolo(assunto) ?? extrairProtocolo(texto);
  if (!protocolo) return null;

  const dataBruta = extrairCabecalho(texto, 'date') ?? extrairCabecalho(texto, 'data');
  const quando = dataBruta ? new Date(dataBruta) : null;

  return {
    protocolo,
    assunto: assunto || `Chamado #${protocolo}`,
    titulo: extrairTitulo(assunto),
    fila: extrairFila(texto),
    remetente: extrairCabecalho(texto, 'from') ?? extrairCabecalho(texto, 'de'),
    corpo: texto,
    recebidoEm: quando && !Number.isNaN(quando.getTime()) ? quando.toISOString() : null,
    idExterno: extrairCabecalho(texto, 'message-id'),
  };
}
