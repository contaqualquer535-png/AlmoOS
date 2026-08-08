/**
 * Leitor de CSV mínimo, escrito à mão.
 *
 * Não é um parser completo de RFC 4180, mas cobre o que sai do Excel e
 * do Google Sheets: aspas duplas, aspas escapadas por duplicação,
 * separador dentro de campo entre aspas, quebra de linha dentro de
 * campo, e `;` como separador — que é o padrão do Excel em português e
 * a causa número um de importação que "não funciona".
 *
 * Uma dependência a menos para manter num projeto de um desenvolvedor só.
 */

/**
 * Adivinha o separador pela primeira linha, fora de aspas.
 *
 * A tabulação vem primeiro na desempate porque é o que sai ao copiar uma
 * tabela do navegador — no SERVi, selecionar a lista de chamados e colar
 * aqui produz TSV. E título de chamado costuma ter vírgula, o que faria
 * a contagem de vírgulas ganhar sem que o arquivo seja CSV.
 */
function detectarSeparador(texto: string): ',' | ';' | '\t' {
  let virgulas = 0;
  let pontos = 0;
  let tabulacoes = 0;
  let dentroDeAspas = false;

  for (const caractere of texto) {
    if (caractere === '"') dentroDeAspas = !dentroDeAspas;
    else if (dentroDeAspas) continue;
    else if (caractere === ',') virgulas += 1;
    else if (caractere === ';') pontos += 1;
    else if (caractere === '\t') tabulacoes += 1;
    else if (caractere === '\n') break;
  }

  if (tabulacoes > 0) return '\t';
  return pontos > virgulas ? ';' : ',';
}

export function lerCsv(texto: string): string[][] {
  // BOM do Excel vira parte do primeiro cabeçalho se não for removido.
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const separador = detectarSeparador(limpo);

  const linhas: string[][] = [];
  let campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];

    if (dentroDeAspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        atual += c;
      }
      continue;
    }

    if (c === '"') dentroDeAspas = true;
    else if (c === separador) {
      campos.push(atual);
      atual = '';
    } else if (c === '\n') {
      campos.push(atual);
      linhas.push(campos);
      campos = [];
      atual = '';
    } else {
      atual += c;
    }
  }

  if (atual !== '' || campos.length > 0) {
    campos.push(atual);
    linhas.push(campos);
  }

  // Linha só de campos vazios é ruído do fim do arquivo.
  return linhas.filter((l) => l.some((campo) => campo.trim() !== ''));
}

/** Normaliza cabeçalho: minúsculo, sem acento, espaço vira sublinhado. */
export function normalizarCabecalho(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Converte para objetos usando a primeira linha como cabeçalho. Aceita
 * variação de acento e maiúscula no cabeçalho porque a planilha é
 * digitada por gente, não gerada por máquina.
 */
export function lerCsvComCabecalho(texto: string): Array<Record<string, string>> {
  const linhas = lerCsv(texto);
  if (linhas.length < 2) return [];

  const cabecalho = linhas[0].map(normalizarCabecalho);

  return linhas.slice(1).map((linha) => {
    const registro: Record<string, string> = {};
    cabecalho.forEach((coluna, i) => {
      registro[coluna] = (linha[i] ?? '').trim();
    });
    return registro;
  });
}

/**
 * Datas como as pessoas escrevem: 06/08/2026, 6/8/26, 2026-08-06.
 * Devolve ISO ou null. Assume dia antes do mês — é uma planilha
 * brasileira, e interpretar 06/08 como 8 de junho estragaria o
 * histórico inteiro em silêncio.
 */
export function lerData(valor: string): string | null {
  const texto = valor.trim();
  if (!texto) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const data = new Date(`${texto}T12:00:00Z`);
    return Number.isNaN(data.getTime()) ? null : texto;
  }

  const partes = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!partes) return null;

  const dia = Number(partes[1]);
  const mes = Number(partes[2]);
  let ano = Number(partes[3]);
  if (ano < 100) ano += 2000;

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  // Confere que a data existe: 31/02 passa nos limites acima.
  const conferencia = new Date(`${iso}T12:00:00Z`);
  return conferencia.toISOString().slice(0, 10) === iso ? iso : null;
}
