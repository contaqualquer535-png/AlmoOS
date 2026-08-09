'use server';

import { revalidatePath } from 'next/cache';

import { criarClienteServidor } from '@/lib/supabase/server';
import { lerEmailColado } from '@/lib/servi';
import type { PrioridadeChamado, StatusVerificacao } from '@/lib/types/database';

/**
 * Importação de planilha.
 *
 * Regra que vale para as três origens: **validar tudo antes de gravar
 * qualquer coisa**. A tela mostra os problemas linha a linha e só então
 * o operador decide. Importar metade e falhar no meio deixaria o banco
 * num estado que ninguém sabe descrever.
 */

export interface ProblemaNaLinha {
  linha: number;
  motivo: string;
}

export interface ResultadoDaImportacao {
  ok: boolean;
  importadas: number;
  ignoradas: number;
  problemas: ProblemaNaLinha[];
  mensagem?: string;
}

/** Índice codigo → id dos locais ativos, para resolver nome de sala. */
async function indiceDeLocais(): Promise<Map<string, string>> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from('locais').select('id, codigo');
  const mapa = new Map<string, string>();
  for (const l of data ?? []) {
    mapa.set((l.codigo as string).trim().toUpperCase(), l.id as string);
  }
  return mapa;
}

// ---------- E-mail do SERVi colado à mão ----------

export interface ResultadoDoEmail {
  ok: boolean;
  protocolo?: string;
  criouChamado?: boolean;
  fechou?: boolean;
  repetida?: boolean;
  mensagem?: string;
}

/**
 * Caminho manual da mesma ingestão que a Edge Function faz.
 *
 * Existe por dois motivos: serve enquanto o encaminhamento automático
 * não está configurado, e continua servindo depois para o e-mail avulso
 * que a regra do Gmail não pegou. Chama exatamente a mesma função SQL —
 * duas implementações da regra divergiriam em um mês.
 */
export async function registrarEmailDoServi(bruto: string): Promise<ResultadoDoEmail> {
  const lido = lerEmailColado(bruto);

  if (!lido) {
    return {
      ok: false,
      mensagem:
        'Não encontrei o número do chamado. O assunto do SERVi tem a forma [Chamado#001538977] — cole o e-mail incluindo o assunto.',
    };
  }

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('registrar_mensagem_de_chamado', {
    p_protocolo: lido.protocolo,
    p_assunto: lido.assunto,
    p_remetente: lido.remetente,
    p_corpo: lido.corpo,
    p_recebido_em: lido.recebidoEm ?? new Date().toISOString(),
    p_id_externo: lido.idExterno,
    p_fila: lido.fila,
  });

  if (error) return { ok: false, mensagem: error.message };

  const saida = data as unknown as {
    criou_chamado: boolean;
    fechou: boolean;
    mensagem_id: string | null;
  };

  revalidatePath('/chamados');
  revalidatePath('/trabalho');
  revalidatePath('/hoje');

  return {
    ok: true,
    protocolo: lido.protocolo,
    criouChamado: saida.criou_chamado,
    fechou: saida.fechou,
    // mensagem_id nulo significa que o Message-ID já estava registrado.
    repetida: saida.mensagem_id === null,
  };
}

// ---------- Patrimônio ----------

export interface LinhaDePatrimonio {
  codigo_barras: string;
  item: string;
  descricao: string;
  local: string;
}

export async function importarPatrimonio(
  linhas: LinhaDePatrimonio[],
): Promise<ResultadoDaImportacao> {
  const locais = await indiceDeLocais();
  const problemas: ProblemaNaLinha[] = [];
  const paraInserir: Array<Record<string, unknown>> = [];
  const codigosVistos = new Set<string>();

  linhas.forEach((linha, i) => {
    const numero = i + 2; // +1 pelo cabeçalho, +1 porque planilha conta de 1

    if (!linha.item?.trim()) {
      problemas.push({ linha: numero, motivo: 'Item sem nome.' });
      return;
    }

    const codigoDoLocal = (linha.local ?? '').trim().toUpperCase();
    const localId = locais.get(codigoDoLocal || 'ALMOX');
    if (!localId) {
      problemas.push({
        linha: numero,
        motivo: `Local "${linha.local}" não existe. Use o código, como C-212 ou ALMOX.`,
      });
      return;
    }

    const patrimonio = linha.codigo_barras?.trim() || null;
    // Duplicata dentro do próprio arquivo: o banco rejeitaria só a
    // segunda, e o operador ficaria sem saber qual das duas entrou.
    if (patrimonio) {
      if (codigosVistos.has(patrimonio)) {
        problemas.push({ linha: numero, motivo: `Patrimônio ${patrimonio} repetido no arquivo.` });
        return;
      }
      codigosVistos.add(patrimonio);
    }

    paraInserir.push({
      codigo_barras: patrimonio,
      item: linha.item.trim(),
      descricao: linha.descricao?.trim() || null,
      local_padrao_id: localId,
      local_atual_id: localId,
    });
  });

  if (paraInserir.length === 0) {
    return { ok: false, importadas: 0, ignoradas: linhas.length, problemas };
  }

  const supabase = await criarClienteServidor();
  // upsert pelo patrimônio: reimportar a planilha corrigida atualiza em
  // vez de duplicar. Itens sem etiqueta não têm chave, então esses de
  // fato duplicam se você importar duas vezes.
  const { error } = await supabase
    .from('inventario')
    .upsert(paraInserir, { onConflict: 'codigo_barras', ignoreDuplicates: false });

  if (error) {
    return {
      ok: false,
      importadas: 0,
      ignoradas: linhas.length,
      problemas,
      mensagem: error.message,
    };
  }

  revalidatePath('/inventario');
  return {
    ok: true,
    importadas: paraInserir.length,
    ignoradas: problemas.length,
    problemas,
  };
}

// ---------- Ronda histórica ----------

const APELIDOS_DE_STATUS: Record<string, StatusVerificacao> = {
  '✓': 'ok',
  v: 'ok',
  ok: 'ok',
  c: 'ok',
  m: 'manutencao',
  manutencao: 'manutencao',
  manutenção: 'manutencao',
  x: 'resolvido',
  resolvido: 'resolvido',
  t: 'trocado',
  trocado: 'trocado',
};

export interface LinhaDeRonda {
  data: string; // já em ISO, convertida na tela
  sala: string;
  item: string;
  status: string;
  observacao: string;
}

export async function importarRondaHistorica(
  linhas: LinhaDeRonda[],
): Promise<ResultadoDaImportacao> {
  const supabase = await criarClienteServidor();
  const locais = await indiceDeLocais();

  const { data: itensDoBanco } = await supabase.from('itens_checklist').select('id, nome');
  const itens = new Map<string, string>();
  for (const i of itensDoBanco ?? []) {
    itens.set((i.nome as string).trim().toLowerCase(), i.id as string);
  }

  const problemas: ProblemaNaLinha[] = [];
  const validas: Array<Record<string, unknown>> = [];

  linhas.forEach((linha, i) => {
    const numero = i + 2;

    if (!linha.data) {
      problemas.push({ linha: numero, motivo: 'Data inválida ou vazia.' });
      return;
    }

    const localId = locais.get((linha.sala ?? '').trim().toUpperCase());
    if (!localId) {
      problemas.push({ linha: numero, motivo: `Sala "${linha.sala}" não existe.` });
      return;
    }

    const itemId = itens.get((linha.item ?? '').trim().toLowerCase());
    if (!itemId) {
      problemas.push({
        linha: numero,
        motivo: `Item "${linha.item}" não está no checklist. Nomes válidos: ${[...itens.keys()].join(', ')}.`,
      });
      return;
    }

    const status = APELIDOS_DE_STATUS[(linha.status ?? '').trim().toLowerCase()];
    if (!status) {
      problemas.push({
        linha: numero,
        motivo: `Status "${linha.status}" não reconhecido. Use ✓, M, X ou T.`,
      });
      return;
    }

    validas.push({
      local_id: localId,
      item_id: itemId,
      data: linha.data,
      status,
      observacao: linha.observacao?.trim() || null,
    });
  });

  if (validas.length === 0) {
    return { ok: false, importadas: 0, ignoradas: linhas.length, problemas };
  }

  /**
   * A ordem cronológica é obrigatória, não uma gentileza.
   *
   * A trigger de `verificacoes` deriva `pendencias`: M abre, X e T
   * fecham. Se um X de março entrar antes do M de janeiro, ele não acha
   * pendência para fechar e o histórico sai errado — com pendência
   * aberta que na verdade foi resolvida. Por isso agrupo por data e
   * envio um lote por dia, em ordem.
   */
  const porData = new Map<string, Array<Record<string, unknown>>>();
  for (const linha of validas) {
    const data = linha.data as string;
    const lote = porData.get(data);
    if (lote) lote.push(linha);
    else porData.set(data, [linha]);
  }

  const datasEmOrdem = [...porData.keys()].sort();
  let importadas = 0;

  for (const data of datasEmOrdem) {
    const { error } = await supabase
      .from('verificacoes')
      .upsert(porData.get(data)!, { onConflict: 'local_id,item_id,data' });

    if (error) {
      return {
        ok: false,
        importadas,
        ignoradas: linhas.length - importadas,
        problemas,
        mensagem: `Parou em ${data}: ${error.message}. As datas anteriores já entraram.`,
      };
    }
    importadas += porData.get(data)!.length;
  }

  revalidatePath('/hoje');
  revalidatePath('/relatorios');
  revalidatePath('/salas');
  return { ok: true, importadas, ignoradas: problemas.length, problemas };
}

// ---------- Chamados já abertos no OTRS ----------

const PRIORIDADES: Record<string, PrioridadeChamado> = {
  baixa: 'baixa',
  media: 'media',
  média: 'media',
  normal: 'media',
  alta: 'alta',
  urgente: 'alta',
};

/** Estados do SERVi → status_chamado. "novo" e "aberto" ainda tramitam. */
const ESTADOS_DO_SERVI: Record<string, 'em_atendimento' | 'concluido'> = {
  novo: 'em_atendimento',
  aberto: 'em_atendimento',
  'em atendimento': 'em_atendimento',
  pendente: 'em_atendimento',
  fechado: 'concluido',
  resolvido: 'concluido',
  concluido: 'concluido',
  concluído: 'concluido',
};

/**
 * "19 d 7 h 12 m" é a coluna IDADE do SERVi, e é o único dado de tempo
 * que a tela lista. Convertida para a data de abertura por subtração —
 * aproximada, mas o dia acerta, que é o que os relatórios usam.
 */
function abertoEmPelaIdade(idade: string): string | null {
  const dias = idade.match(/(\d+)\s*d/);
  if (!dias?.[1]) return null;

  const data = new Date();
  data.setUTCDate(data.getUTCDate() - Number(dias[1]));
  return data.toISOString().slice(0, 10);
}

export interface LinhaDeChamado {
  protocolo: string;
  titulo: string;
  sala: string;
  prioridade: string;
  estado: string;
  fila: string;
  idade: string;
  aberto_em: string; // ISO se a planilha trouxe data; senão, vazio
}

export async function importarChamados(
  linhas: LinhaDeChamado[],
): Promise<ResultadoDaImportacao> {
  const locais = await indiceDeLocais();
  const problemas: ProblemaNaLinha[] = [];
  const paraInserir: Array<Record<string, unknown>> = [];
  const protocolosVistos = new Set<string>();

  linhas.forEach((linha, i) => {
    const numero = i + 2;

    if (!linha.titulo?.trim()) {
      problemas.push({ linha: numero, motivo: 'Chamado sem título.' });
      return;
    }

    let localId: string | null = null;
    if (linha.sala?.trim()) {
      localId = locais.get(linha.sala.trim().toUpperCase()) ?? null;
      if (!localId) {
        problemas.push({ linha: numero, motivo: `Sala "${linha.sala}" não existe.` });
        return;
      }
    }

    const protocolo = linha.protocolo?.trim() || null;
    if (protocolo) {
      if (protocolosVistos.has(protocolo)) {
        problemas.push({ linha: numero, motivo: `Chamado ${protocolo} repetido no arquivo.` });
        return;
      }
      protocolosVistos.add(protocolo);
    }

    const abertoEm =
      linha.aberto_em ||
      abertoEmPelaIdade(linha.idade ?? '') ||
      new Date().toISOString().slice(0, 10);

    const estado = ESTADOS_DO_SERVI[(linha.estado ?? '').trim().toLowerCase()] ?? 'em_atendimento';
    const carimbo = `${abertoEm}T12:00:00Z`;

    // Chamado que já existe no SERVi nunca entra como rascunho: ele já
    // foi enviado. A constraint chamados_envio_coerente exige enviado_em
    // para qualquer status que não seja rascunho, e a de fechamento
    // exige fechado_em nos status terminais.
    paraInserir.push({
      titulo: linha.titulo.trim(),
      local_id: localId,
      // A fila do SERVi é o destino real: GLOG::SMGE::Manutenção diz
      // muito mais do que "SEAMB".
      destino: linha.fila?.trim() || 'SEAMB',
      protocolo_externo: protocolo,
      prioridade: PRIORIDADES[(linha.prioridade ?? '').trim().toLowerCase()] ?? 'media',
      status: estado,
      aberto_em: carimbo,
      enviado_em: carimbo,
      fechado_em: estado === 'concluido' ? new Date().toISOString() : null,
    });
  });

  if (paraInserir.length === 0) {
    return { ok: false, importadas: 0, ignoradas: linhas.length, problemas };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from('chamados').insert(paraInserir);

  if (error) {
    return {
      ok: false,
      importadas: 0,
      ignoradas: linhas.length,
      problemas,
      mensagem: error.message,
    };
  }

  revalidatePath('/chamados');
  revalidatePath('/trabalho');
  revalidatePath('/hoje');
  return {
    ok: true,
    importadas: paraInserir.length,
    ignoradas: problemas.length,
    problemas,
  };
}
