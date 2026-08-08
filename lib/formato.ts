/** Formatação para leitura humana. Timezone fixo: o CETEC é em Caxias do Sul. */

const FUSO = 'America/Sao_Paulo';

/** 'Quinta-feira, 6 de agosto' a partir de 'YYYY-MM-DD'. */
export function dataPorExtenso(iso: string): string {
  const texto = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: FUSO,
  }).format(comoDataLocal(iso));

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** '06/08/2026' a partir de 'YYYY-MM-DD'. */
export function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO }).format(comoDataLocal(iso));
}

/** '06/08 14:32' a partir de um timestamptz ISO. */
export function dataHoraCurta(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSO,
  }).format(new Date(iso));
}

export function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

/** Unidades de medida não flexionam: 2 kg, 2 un. As de embalagem, sim: 2 caixas. */
const UNIDADES_INVARIAVEIS = new Set(['un', 'kg', 'g', 'l', 'ml', 'm']);

export function quantidade(valor: number, unidade: string): string {
  const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(valor);
  const flexionada =
    Math.abs(valor) === 1 || UNIDADES_INVARIAVEIS.has(unidade) ? unidade : `${unidade}s`;
  return `${numero} ${flexionada}`;
}

/**
 * 'YYYY-MM-DD' é interpretado como UTC pelo construtor do Date, o que joga a
 * data um dia para trás em fuso negativo. Meio-dia UTC evita a virada.
 */
function comoDataLocal(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/**
 * Só aceita 'YYYY-MM-DD' que exista no calendário. Conferir apenas o formato
 * deixa passar '2026-13-99', que o banco rejeita depois — erro 500 onde
 * deveria ser 404.
 */
export function ehDataIso(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T12:00:00Z`);
  if (Number.isNaN(data.getTime())) return false;
  return data.toISOString().slice(0, 10) === valor;
}
