import 'server-only';

import { criarClienteServidor } from '@/lib/supabase/server';
import {
  criarChamado,
  criarTarefa,
  lancarMovimentoDeSuprimento,
} from '@/lib/data/mutacoes';
import { dataDeHoje } from '@/lib/data/consultas';
import type { PrioridadeChamado } from '@/lib/types/database';

/**
 * Ferramentas expostas ao modelo (seção 7.2 da especificação).
 *
 * A regra que organiza este arquivo: **leitura executa sozinha, escrita
 * pede confirmação**. Consultar não tem consequência e travar o fluxo
 * para confirmar um SELECT só ensinaria o operador a clicar em "sim" sem
 * ler. Já um insert é irreversível pela interface, e é exatamente aí que
 * a confirmação tem valor.
 *
 * A separação é declarada em `escreve` e imposta pelo endpoint, não pelo
 * prompt: um modelo persuadido a ignorar instrução ainda esbarra no
 * código.
 */

export interface Ferramenta {
  nome: string;
  descricao: string;
  escreve: boolean;
  parametros: Record<string, unknown>;
  /** Frase mostrada no botão de confirmação. Só para as de escrita. */
  resumir?: (args: Record<string, never>) => string;
  executar: (args: Record<string, never>) => Promise<unknown>;
}

type Args = Record<string, never>;

function texto(args: Args, chave: string): string {
  const valor = (args as Record<string, unknown>)[chave];
  return typeof valor === 'string' ? valor : '';
}

function numero(args: Args, chave: string): number {
  const valor = (args as Record<string, unknown>)[chave];
  return typeof valor === 'number' ? valor : Number(valor);
}

/** Resolve 'C-212' para o uuid. O modelo fala em código, o banco em id. */
async function idDoLocal(codigo: string): Promise<string | null> {
  if (!codigo) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from('locais')
    .select('id')
    .ilike('codigo', codigo.trim())
    .maybeSingle();
  return (data?.id as string) ?? null;
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: 'consultar_status',
    descricao:
      'Consulta o estado atual do CETEC. assunto="ronda" devolve o andamento da ronda de hoje; ' +
      '"pendencias" as pendências abertas; "suprimentos" o estoque com previsão de esgotamento; ' +
      '"inventario" os itens emprestados; "chamados" os chamados em aberto.',
    escreve: false,
    parametros: {
      type: 'object',
      properties: {
        assunto: {
          type: 'string',
          enum: ['ronda', 'pendencias', 'suprimentos', 'inventario', 'chamados'],
        },
      },
      required: ['assunto'],
    },
    async executar(args) {
      const supabase = await criarClienteServidor();
      const assunto = texto(args, 'assunto');

      if (assunto === 'ronda') {
        const { data } = await supabase.from('vw_ronda_do_dia').select('*');
        return { data: dataDeHoje(), salas: data ?? [] };
      }
      if (assunto === 'pendencias') {
        const { data } = await supabase
          .from('vw_pendencias_abertas')
          .select('local_codigo, bloco, item, dias_aberta, observacao, tem_chamado_aberto')
          .order('dias_aberta', { ascending: false });
        return data ?? [];
      }
      if (assunto === 'suprimentos') {
        const { data } = await supabase
          .from('vw_suprimentos_status')
          .select('nome, quantidade_atual, unidade, ponto_reposicao, dias_restantes, abaixo_do_ponto');
        return data ?? [];
      }
      if (assunto === 'inventario') {
        const { data } = await supabase
          .from('inventario')
          .select('item, codigo_barras, responsavel, previsao_devolucao, emprestado')
          .eq('ativo', true)
          .eq('emprestado', true);
        return data ?? [];
      }
      const { data } = await supabase
        .from('chamados')
        .select('titulo, destino, prioridade, status, aberto_em, protocolo_externo')
        .not('status', 'in', '("concluido","cancelado")');
      return data ?? [];
    },
  },

  {
    nome: 'criar_tarefa',
    descricao: 'Cria uma tarefa interna do operador. Use o código da sala, como "C-212", quando houver.',
    escreve: true,
    parametros: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        local: { type: 'string', description: 'Código da sala, opcional' },
        observacao: { type: 'string' },
        prazo: { type: 'string', description: 'Data no formato AAAA-MM-DD, opcional' },
      },
      required: ['titulo'],
    },
    resumir: (args) =>
      `Criar tarefa "${texto(args, 'titulo')}"${
        texto(args, 'local') ? ` em ${texto(args, 'local')}` : ''
      }${texto(args, 'prazo') ? `, prazo ${texto(args, 'prazo')}` : ''}`,
    async executar(args) {
      const localId = await idDoLocal(texto(args, 'local'));
      return criarTarefa({
        titulo: texto(args, 'titulo'),
        localId: localId ?? undefined,
        observacao: texto(args, 'observacao') || undefined,
        prazo: texto(args, 'prazo') || undefined,
      });
    },
  },

  {
    nome: 'criar_chamado',
    descricao:
      'Abre um chamado para o SEAMB ou manutenção predial. Nasce como rascunho: ' +
      'o envio ao setor externo continua sendo um passo manual na tela de tarefas.',
    escreve: true,
    parametros: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        local: { type: 'string', description: 'Código da sala, opcional' },
        descricao: { type: 'string' },
        prioridade: { type: 'string', enum: ['baixa', 'media', 'alta'] },
      },
      required: ['titulo'],
    },
    resumir: (args) =>
      `Abrir chamado "${texto(args, 'titulo')}"${
        texto(args, 'local') ? ` em ${texto(args, 'local')}` : ''
      }, prioridade ${texto(args, 'prioridade') || 'media'}`,
    async executar(args) {
      const localId = await idDoLocal(texto(args, 'local'));
      return criarChamado({
        titulo: texto(args, 'titulo'),
        descricao: texto(args, 'descricao') || undefined,
        localId: localId ?? undefined,
        prioridade: (texto(args, 'prioridade') || 'media') as PrioridadeChamado,
      });
    },
  },

  {
    nome: 'registrar_consumo',
    descricao:
      'Registra consumo ou reposição de suprimento. A quantidade é sempre positiva; ' +
      'o tipo define o sinal.',
    escreve: true,
    parametros: {
      type: 'object',
      properties: {
        suprimento: { type: 'string', description: 'Nome exato, como "Café"' },
        quantidade: { type: 'number' },
        tipo: { type: 'string', enum: ['consumo', 'reposicao'] },
      },
      required: ['suprimento', 'quantidade', 'tipo'],
    },
    resumir: (args) =>
      `Registrar ${texto(args, 'tipo')} de ${numero(args, 'quantidade')} de ${texto(
        args,
        'suprimento',
      )}`,
    async executar(args) {
      const supabase = await criarClienteServidor();
      const { data } = await supabase
        .from('suprimentos')
        .select('id')
        .ilike('nome', texto(args, 'suprimento').trim())
        .maybeSingle();

      if (!data) {
        return { ok: false, mensagem: `Suprimento "${texto(args, 'suprimento')}" não existe.` };
      }

      return lancarMovimentoDeSuprimento({
        suprimentoId: data.id as string,
        tipo: texto(args, 'tipo') as 'consumo' | 'reposicao',
        quantidade: numero(args, 'quantidade'),
      });
    },
  },
];

export function acharFerramenta(nome: string): Ferramenta | undefined {
  return FERRAMENTAS.find((f) => f.nome === nome);
}

/** Declaração no formato que o Gemini espera em `tools[].functionDeclarations`. */
export function declaracoesParaGemini() {
  return FERRAMENTAS.map((f) => ({
    name: f.nome,
    description: f.descricao,
    parameters: f.parametros,
  }));
}
