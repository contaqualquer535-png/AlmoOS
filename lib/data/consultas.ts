import 'server-only';

import type { PostgrestError } from '@supabase/supabase-js';

import { criarClienteServidor } from '@/lib/supabase/server';
import type {
  BlocoDaSerie,
  Chamado,
  DiaDaSerie,
  Insight,
  PontoDeAtencao,
  Relatorio,
  RelatorioSalvo,
  StatusVerificacao,
  Tarefa,
  ClasseStatusAtual,
  ItemInventario,
  LocalComTurmas,
  MovimentacaoInventario,
  PendenciaAberta,
  ElementoPlanta,
  Planta,
  PlanoDoDia,
  PlantaResumo,
  RondaDoDia,
  SuprimentoStatus,
} from '@/lib/types/database';

/**
 * Camada de acesso a dados. Nenhum componente fala com o Supabase
 * diretamente: quando o schema mudar, o conserto acontece aqui.
 */

/**
 * Erro do PostgREST vem com code, details e hint, e é neles que está a
 * causa. Só a message costuma ser genérica demais para diagnosticar.
 */
function descrever(acao: string, erro: PostgrestError): Error {
  const partes = [erro.message];
  if (erro.code) partes.push(`código ${erro.code}`);
  if (erro.details) partes.push(erro.details);
  if (erro.hint) partes.push(`dica: ${erro.hint}`);

  if (erro.code === 'PGRST202') {
    partes.push(
      'A função não está no cache do PostgREST. No painel do Supabase, ' +
        'Settings → API → Reload schema cache, ou rode: notify pgrst, \'reload schema\';',
    );
  }
  if (erro.code === '42501') {
    partes.push('Faltam privilégios: confira se a migration 0010 (RLS) foi aplicada.');
  }
  if (erro.code === 'PGRST205' || erro.code === '42P01') {
    partes.push(
      'A tabela ou view não existe no banco. Alguma migration de supabase/migrations/ ' +
        'ainda não foi aplicada: rode `npx supabase db push`.',
    );
  }

  const mensagem = `${acao}: ${partes.join(' · ')}`;

  // Em build de produção o Next troca o erro de Server Component por uma
  // mensagem genérica com digest. Sem este log, o motivo real não aparece
  // em lugar nenhum — nem na tela, nem no terminal de forma legível.
  console.error(`[dados] ${mensagem}`);

  return new Error(mensagem);
}

/** Data local de Caxias do Sul no formato YYYY-MM-DD. */
export function dataDeHoje(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
}

export async function buscarPlanoDoDia(data?: string): Promise<PlanoDoDia> {
  const supabase = await criarClienteServidor();
  const { data: resultado, error } = await supabase.rpc('montar_plano_do_dia', {
    p_data: data ?? dataDeHoje(),
  });

  if (error) {
    throw descrever('Não foi possível montar o plano do dia', error);
  }

  return resultado as unknown as PlanoDoDia;
}

export async function buscarStatusDaRonda(): Promise<RondaDoDia[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('vw_ronda_do_dia')
    .select('*')
    .order('bloco')
    .order('ordem_visita', { nullsFirst: false });

  if (error) {
    throw descrever('Não foi possível carregar a ronda', error);
  }

  return (data ?? []) as RondaDoDia[];
}

export async function buscarSuprimentos(): Promise<SuprimentoStatus[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('vw_suprimentos_status')
    .select('*')
    .order('abaixo_do_ponto', { ascending: false })
    .order('dias_restantes', { nullsFirst: false })
    .order('nome');

  if (error) {
    throw descrever('Não foi possível carregar os suprimentos', error);
  }

  return (data ?? []) as SuprimentoStatus[];
}

/** Agrupa mantendo a ordem em que os itens chegaram do banco. */
export function agruparPorBloco<T extends { bloco: string | null }>(
  itens: T[],
): Array<[string, T[]]> {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const chave = item.bloco ?? 'Sem bloco';
    const grupo = mapa.get(chave);
    if (grupo) {
      grupo.push(item);
    } else {
      mapa.set(chave, [item]);
    }
  }
  return [...mapa.entries()];
}

// ---------- Ronda de um local ----------

export interface ItemChecklist {
  id: string;
  nome: string;
  ordem: number;
}

export interface LocalBasico {
  id: string;
  codigo: string;
  nome: string | null;
  bloco: string | null;
}

/** Itens ativos do checklist, na ordem em que aparecem na ronda. */
export async function buscarItensChecklist(): Promise<ItemChecklist[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('itens_checklist')
    .select('id, nome, ordem')
    .eq('ativo', true)
    .order('ordem');

  if (error) throw descrever('Não foi possível carregar o checklist', error);
  return (data ?? []) as ItemChecklist[];
}

export async function buscarLocalPorCodigo(codigo: string): Promise<LocalBasico | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('locais')
    .select('id, codigo, nome, bloco')
    .eq('codigo', codigo)
    .maybeSingle();

  if (error) throw descrever('Não foi possível carregar a sala', error);
  return data as LocalBasico | null;
}

/** O que já foi lançado hoje neste local, indexado por item. */
export async function buscarVerificacoesDoDia(
  localId: string,
  data: string,
): Promise<Record<string, { status: StatusVerificacao; observacao: string | null }>> {
  const supabase = await criarClienteServidor();
  const { data: linhas, error } = await supabase
    .from('verificacoes')
    .select('item_id, status, observacao')
    .eq('local_id', localId)
    .eq('data', data);

  if (error) throw descrever('Não foi possível carregar os lançamentos', error);

  const porItem: Record<string, { status: StatusVerificacao; observacao: string | null }> = {};
  for (const linha of linhas ?? []) {
    porItem[linha.item_id as string] = {
      status: linha.status as StatusVerificacao,
      observacao: (linha.observacao as string | null) ?? null,
    };
  }
  return porItem;
}

// ---------- Insights ----------

/**
 * Os pontos de atenção calculados agora, direto do banco. Não dependem
 * da Edge Function nem de modelo nenhum: se o job de madrugada não
 * rodou, a tela mostra o estado de agora do mesmo jeito.
 */
export async function buscarPontosDeAtencao(): Promise<PontoDeAtencao[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('montar_contexto_para_insights');

  if (error) throw descrever('Não foi possível montar os pontos de atenção', error);
  return ((data as unknown as { pontos_atencao?: PontoDeAtencao[] })?.pontos_atencao ??
    []) as PontoDeAtencao[];
}

/** Última análise gravada pela Edge Function. Null antes do primeiro job. */
export async function buscarUltimoInsight(): Promise<Insight | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('insights_ia')
    .select('*')
    .order('gerado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw descrever('Não foi possível carregar os insights', error);
  return (data as Insight | null) ?? null;
}

// ---------- Relatórios e séries ----------

/** Segunda a domingo da semana que contém a data. ISO: semana começa na segunda. */
export function semanaDe(iso: string): { inicio: string; fim: string } {
  const data = new Date(`${iso}T12:00:00Z`);
  const diaDaSemana = (data.getUTCDay() + 6) % 7; // 0 = segunda
  const inicio = new Date(data);
  inicio.setUTCDate(data.getUTCDate() - diaDaSemana);
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 6);
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

/** Primeiro e último dia do mês que contém a data. */
export function mesDe(iso: string): { inicio: string; fim: string } {
  const [ano, mes] = iso.split('-').map(Number);
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { inicio, fim: `${ano}-${String(mes).padStart(2, '0')}-${ultimo}` };
}

/** Agregação ao vivo de um período qualquer. Não persiste nada. */
export async function buscarRelatorio(inicio: string, fim: string): Promise<Relatorio> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('montar_relatorio', {
    p_inicio: inicio,
    p_fim: fim,
  });

  if (error) throw descrever('Não foi possível montar o relatório', error);
  return data as unknown as Relatorio;
}

/** Snapshots já congelados, do mais recente para o mais antigo. */
export async function buscarRelatoriosSalvos(): Promise<RelatorioSalvo[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('relatorios')
    .select('*')
    .order('periodo_inicio', { ascending: false })
    .limit(50);

  if (error) throw descrever('Não foi possível carregar os relatórios', error);
  return (data ?? []) as RelatorioSalvo[];
}

export async function buscarSerieDaRonda(dias = 30): Promise<DiaDaSerie[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('serie_ronda_por_dia', { p_dias: dias });

  if (error) throw descrever('Não foi possível carregar a série da ronda', error);
  return (data ?? []) as unknown as DiaDaSerie[];
}

export async function buscarPendenciasPorBloco(): Promise<BlocoDaSerie[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('serie_pendencias_por_bloco');

  if (error) throw descrever('Não foi possível carregar as pendências por bloco', error);
  return (data ?? []) as unknown as BlocoDaSerie[];
}

// ---------- Inventário ----------

export interface FiltroInventario {
  localId?: string;
  responsavel?: string;
  busca?: string;
  /** 'emprestados' | 'no_lugar' | undefined (tudo) */
  situacao?: string;
}

export interface InventarioEmTela {
  itens: ItemInventario[];
  locais: Record<string, string>;
  responsaveis: string[];
  total: number;
  emprestados: number;
  atrasados: number;
}

/**
 * O filtro é aplicado no banco, não em memória: o inventário é a única
 * tabela deste sistema que pode crescer para milhares de linhas (todo
 * patrimônio etiquetado da UCS que passar pelo CETEC).
 *
 * Os contadores do topo, porém, contam o acervo inteiro e ignoram o
 * filtro — "3 atrasados" precisa continuar aparecendo mesmo quando a
 * busca está mostrando outra coisa.
 */
export async function buscarInventario(
  filtro: FiltroInventario = {},
): Promise<InventarioEmTela> {
  const supabase = await criarClienteServidor();

  let consulta = supabase.from('inventario').select('*').eq('ativo', true);

  if (filtro.localId) consulta = consulta.eq('local_atual_id', filtro.localId);
  if (filtro.responsavel) consulta = consulta.eq('responsavel', filtro.responsavel);
  if (filtro.situacao === 'emprestados') consulta = consulta.eq('emprestado', true);
  if (filtro.situacao === 'no_lugar') consulta = consulta.eq('emprestado', false);
  if (filtro.busca?.trim()) {
    const termo = `%${filtro.busca.trim()}%`;
    consulta = consulta.or(`item.ilike.${termo},codigo_barras.ilike.${termo}`);
  }

  const [itens, locais, acervo] = await Promise.all([
    consulta.order('item'),
    supabase.from('locais').select('id, codigo').eq('ativo', true),
    supabase
      .from('inventario')
      .select('emprestado, previsao_devolucao')
      .eq('ativo', true),
  ]);

  if (itens.error) throw descrever('Não foi possível carregar o inventário', itens.error);
  if (locais.error) throw descrever('Não foi possível carregar os locais', locais.error);
  if (acervo.error) throw descrever('Não foi possível contar o acervo', acervo.error);

  const porId: Record<string, string> = {};
  for (const l of locais.data ?? []) porId[l.id as string] = l.codigo as string;

  const hoje = dataDeHoje();
  const linhas = acervo.data ?? [];

  const responsaveis = [
    ...new Set(
      (itens.data ?? [])
        .map((i) => i.responsavel as string | null)
        .filter((r): r is string => Boolean(r)),
    ),
  ].sort();

  return {
    itens: (itens.data ?? []) as ItemInventario[],
    locais: porId,
    responsaveis,
    total: linhas.length,
    emprestados: linhas.filter((i) => i.emprestado).length,
    atrasados: linhas.filter(
      (i) => i.emprestado && i.previsao_devolucao && (i.previsao_devolucao as string) < hoje,
    ).length,
  };
}

export interface ItemComHistorico {
  item: ItemInventario;
  movimentacoes: MovimentacaoInventario[];
  locais: Record<string, string>;
}

export async function buscarItemDoInventario(id: string): Promise<ItemComHistorico | null> {
  const supabase = await criarClienteServidor();

  const [item, movimentacoes, locais] = await Promise.all([
    supabase.from('inventario').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('movimentacoes_inventario')
      .select('*')
      .eq('inventario_id', id)
      .order('data', { ascending: false }),
    supabase.from('locais').select('id, codigo'),
  ]);

  if (item.error) throw descrever('Não foi possível carregar o item', item.error);
  if (!item.data) return null;
  if (movimentacoes.error) {
    throw descrever('Não foi possível carregar o histórico', movimentacoes.error);
  }
  if (locais.error) throw descrever('Não foi possível carregar os locais', locais.error);

  const porId: Record<string, string> = {};
  for (const l of locais.data ?? []) porId[l.id as string] = l.codigo as string;

  return {
    item: item.data as ItemInventario,
    movimentacoes: (movimentacoes.data ?? []) as MovimentacaoInventario[],
    locais: porId,
  };
}

// ---------- Painel de salas ----------

export interface SalaDoPainel extends LocalComTurmas {
  pendencias_abertas: number;
  dias_da_pendencia_mais_antiga: number | null;
  itens_registrados: number;
  itens_esperados: number;
  tem_planta: boolean;
}

/**
 * Todos os ambientes ativos com o que se quer saber de relance: turma
 * vigente, pendência aberta e quanto da ronda de hoje já entrou.
 *
 * As três leituras são cruzadas aqui e não numa view porque cada uma tem
 * um recorte temporal diferente (vigente, aberto, hoje) e uma view só
 * ficaria com três left joins agregados — mais difícil de ler do que o
 * cruzamento em memória sobre 25 linhas.
 */
export async function buscarPainelDeSalas(): Promise<SalaDoPainel[]> {
  const supabase = await criarClienteServidor();
  const [locais, pendencias, ronda, plantas] = await Promise.all([
    supabase.from('vw_locais_com_turmas').select('*').eq('ativo', true),
    supabase.from('vw_pendencias_abertas').select('local_id, dias_aberta'),
    supabase.from('vw_ronda_do_dia').select('local_id, itens_registrados, itens_esperados'),
    supabase.from('plantas').select('local_id'),
  ]);

  if (locais.error) throw descrever('Não foi possível carregar os ambientes', locais.error);
  if (pendencias.error) {
    throw descrever('Não foi possível carregar as pendências', pendencias.error);
  }
  if (ronda.error) throw descrever('Não foi possível carregar a ronda', ronda.error);
  if (plantas.error) throw descrever('Não foi possível carregar as plantas', plantas.error);

  const porLocal = new Map<string, { total: number; maisAntiga: number }>();
  for (const p of pendencias.data ?? []) {
    const chave = p.local_id as string;
    const atual = porLocal.get(chave) ?? { total: 0, maisAntiga: 0 };
    porLocal.set(chave, {
      total: atual.total + 1,
      maisAntiga: Math.max(atual.maisAntiga, (p.dias_aberta as number) ?? 0),
    });
  }

  const rondaPorLocal = new Map(
    (ronda.data ?? []).map((r) => [
      r.local_id as string,
      { registrados: r.itens_registrados as number, esperados: r.itens_esperados as number },
    ]),
  );
  const comPlanta = new Set((plantas.data ?? []).map((p) => p.local_id as string));

  return ((locais.data ?? []) as LocalComTurmas[])
    .map((local) => {
      const pend = porLocal.get(local.id);
      const r = rondaPorLocal.get(local.id);
      return {
        ...local,
        pendencias_abertas: pend?.total ?? 0,
        dias_da_pendencia_mais_antiga: pend ? pend.maisAntiga : null,
        itens_registrados: r?.registrados ?? 0,
        itens_esperados: r?.esperados ?? 0,
        tem_planta: comPlanta.has(local.id),
      };
    })
    .sort(
      (a, b) =>
        (a.bloco ?? 'zzz').localeCompare(b.bloco ?? 'zzz') ||
        (a.ordem_visita ?? 999) - (b.ordem_visita ?? 999) ||
        a.codigo.localeCompare(b.codigo),
    );
}

export async function buscarPendenciasAbertas(): Promise<PendenciaAberta[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('vw_pendencias_abertas')
    .select('*')
    .order('dias_aberta', { ascending: false });

  if (error) throw descrever('Não foi possível carregar as pendências', error);
  return (data ?? []) as PendenciaAberta[];
}

// ---------- Tarefas e chamados ----------

export interface TarefasEChamados {
  tarefas: Tarefa[];
  chamados: Chamado[];
  /** Código do local por id, para rotular sem um join por linha. */
  locais: Record<string, string>;
}

/**
 * `incluirEncerrados` distingue a tela de trabalho da tela de consulta:
 * no dia a dia só interessa o que está aberto, mas o histórico precisa
 * ficar acessível sem virar outra rota.
 */
export async function buscarTarefasEChamados(
  incluirEncerrados = false,
): Promise<TarefasEChamados> {
  const supabase = await criarClienteServidor();

  let consultaTarefas = supabase
    .from('tarefas')
    .select('*')
    .order('prazo', { nullsFirst: false })
    .order('criado_em', { ascending: false });

  let consultaChamados = supabase
    .from('chamados')
    .select('*')
    .order('prioridade')
    .order('aberto_em');

  if (!incluirEncerrados) {
    consultaTarefas = consultaTarefas.in('status', ['pendente', 'em_andamento']);
    consultaChamados = consultaChamados.in('status', [
      'rascunho',
      'enviado',
      'em_atendimento',
    ]);
  }

  const [tarefas, chamados, locais] = await Promise.all([
    consultaTarefas,
    consultaChamados,
    supabase.from('locais').select('id, codigo').eq('ativo', true),
  ]);

  if (tarefas.error) throw descrever('Não foi possível carregar as tarefas', tarefas.error);
  if (chamados.error) throw descrever('Não foi possível carregar os chamados', chamados.error);
  if (locais.error) throw descrever('Não foi possível carregar os locais', locais.error);

  const porId: Record<string, string> = {};
  for (const l of locais.data ?? []) porId[l.id as string] = l.codigo as string;

  return {
    tarefas: (tarefas.data ?? []) as Tarefa[],
    chamados: (chamados.data ?? []) as Chamado[],
    locais: porId,
  };
}

export interface MensagemDeChamado {
  id: string;
  chamado_id: string;
  direcao: 'recebida' | 'enviada';
  assunto: string | null;
  remetente: string | null;
  corpo: string | null;
  recebido_em: string;
}

export interface ChamadoComConversa {
  chamado: Chamado;
  mensagens: MensagemDeChamado[];
  local: LocalBasico | null;
}

export async function buscarChamadoComConversa(
  id: string,
): Promise<ChamadoComConversa | null> {
  const supabase = await criarClienteServidor();

  const [chamado, mensagens] = await Promise.all([
    supabase.from('chamados').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('mensagens_chamado')
      .select('*')
      .eq('chamado_id', id)
      .order('recebido_em', { ascending: true }),
  ]);

  if (chamado.error) throw descrever('Não foi possível carregar o chamado', chamado.error);
  if (!chamado.data) return null;
  if (mensagens.error) {
    throw descrever('Não foi possível carregar as mensagens', mensagens.error);
  }

  const dados = chamado.data as Chamado;
  let local: LocalBasico | null = null;

  if (dados.local_id) {
    const { data } = await supabase
      .from('locais')
      .select('id, codigo, nome, bloco')
      .eq('id', dados.local_id)
      .maybeSingle();
    local = (data as LocalBasico | null) ?? null;
  }

  return {
    chamado: dados,
    mensagens: (mensagens.data ?? []) as MensagemDeChamado[],
    local,
  };
}

/** Locais ativos para preencher um <select>. */
export async function buscarLocaisParaSelecao(): Promise<LocalBasico[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('locais')
    .select('id, codigo, nome, bloco')
    .eq('ativo', true)
    .order('bloco')
    .order('codigo');

  if (error) throw descrever('Não foi possível carregar os locais', error);
  return (data ?? []) as LocalBasico[];
}

// ---------- Planta ----------

/** Índice de /planta: uma linha por sala que já tem planta desenhada. */
export async function buscarResumoDasPlantas(): Promise<PlantaResumo[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('vw_plantas_resumo')
    .select('*')
    .order('bloco')
    .order('ordem_visita', { nullsFirst: false });

  if (error) throw descrever('Não foi possível carregar as plantas', error);
  return (data ?? []) as PlantaResumo[];
}

export interface PlantaDoLocal {
  local: LocalBasico;
  planta: Planta | null;
  status: Record<string, ClasseStatusAtual>;
  historico: Record<string, ClasseStatusAtual[]>;
}

/**
 * Quantos registros de histórico carregar por sala. 30 classes × alguns
 * registros cada cabe folgado; o teto existe para a página não crescer
 * sem limite depois de anos de uso.
 */
const TETO_HISTORICO = 300;

/**
 * Planta de uma sala, o estado atual de cada classe e o histórico
 * recente, todos indexados por ref. `planta` volta null quando a sala
 * ainda não foi desenhada — a tela trata isso oferecendo o editor, não
 * um erro.
 *
 * O estado atual vem da view, não do histórico: o histórico é truncado
 * pelo teto acima e uma classe que ninguém toca há meses cairia fora
 * dele, aparecendo como "em ordem" sem ser.
 */
export async function buscarPlantaDoLocal(codigo: string): Promise<PlantaDoLocal | null> {
  const local = await buscarLocalPorCodigo(codigo);
  if (!local) return null;

  const supabase = await criarClienteServidor();
  const [resultadoPlanta, resultadoStatus, resultadoHistorico] = await Promise.all([
    supabase
      .from('plantas')
      .select('local_id, grid_cols, grid_rows, elementos, atualizado_em')
      .eq('local_id', local.id)
      .maybeSingle(),
    supabase.from('vw_classes_status_atual').select('*').eq('local_id', local.id),
    supabase
      .from('classes_status')
      .select('local_id, classe_ref, status, observacao, registrado_em')
      .eq('local_id', local.id)
      .order('registrado_em', { ascending: false })
      .limit(TETO_HISTORICO),
  ]);

  if (resultadoPlanta.error) {
    throw descrever('Não foi possível carregar a planta', resultadoPlanta.error);
  }
  if (resultadoStatus.error) {
    throw descrever('Não foi possível carregar o estado das classes', resultadoStatus.error);
  }
  if (resultadoHistorico.error) {
    throw descrever('Não foi possível carregar o histórico das classes', resultadoHistorico.error);
  }

  const bruta = resultadoPlanta.data;
  const planta: Planta | null = bruta
    ? {
        local_id: bruta.local_id as string,
        grid_cols: bruta.grid_cols as number,
        grid_rows: bruta.grid_rows as number,
        elementos: (bruta.elementos ?? []) as ElementoPlanta[],
        atualizado_em: bruta.atualizado_em as string,
      }
    : null;

  const status: Record<string, ClasseStatusAtual> = {};
  for (const linha of (resultadoStatus.data ?? []) as ClasseStatusAtual[]) {
    status[linha.classe_ref] = linha;
  }

  // Já vem do mais recente para o mais antigo; o agrupamento preserva
  // essa ordem, então a tela não precisa reordenar.
  const historico: Record<string, ClasseStatusAtual[]> = {};
  for (const linha of (resultadoHistorico.data ?? []) as ClasseStatusAtual[]) {
    (historico[linha.classe_ref] ??= []).push(linha);
  }

  return { local, planta, status, historico };
}
