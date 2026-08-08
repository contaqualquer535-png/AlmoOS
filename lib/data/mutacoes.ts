'use server';

import { revalidatePath } from 'next/cache';

import { criarClienteServidor } from '@/lib/supabase/server';
import { dataDeHoje } from '@/lib/data/consultas';
import type {
  ElementoPlanta,
  PrioridadeChamado,
  StatusChamado,
  StatusClasse,
  StatusTarefa,
  StatusVerificacao,
  TipoElemento,
  TipoMovimentacaoInventario,
  TipoRelatorio,
} from '@/lib/types/database';

const TIPOS_MOVIMENTACAO: readonly TipoMovimentacaoInventario[] = [
  'emprestimo',
  'devolucao',
  'transferencia',
];

/**
 * Escritas. Server Actions, então nada de chave ou regra de negócio chega
 * ao navegador — e o RLS ainda vale, porque a sessão é a do usuário.
 */

export interface Resultado {
  ok: boolean;
  mensagem?: string;
}

const STATUS_VALIDOS: readonly StatusVerificacao[] = [
  'ok',
  'manutencao',
  'resolvido',
  'trocado',
];

export async function lancarVerificacao(dados: {
  localId: string;
  itemId: string;
  status: StatusVerificacao;
  observacao?: string;
}): Promise<Resultado> {
  if (!STATUS_VALIDOS.includes(dados.status)) {
    return { ok: false, mensagem: 'Status inválido.' };
  }

  const supabase = await criarClienteServidor();
  const observacao = dados.observacao?.trim() || null;

  // upsert na chave (local, item, data): repetir o lançamento corrige,
  // não duplica. É o mesmo caminho que a sincronização offline vai usar.
  const { error } = await supabase.from('verificacoes').upsert(
    {
      local_id: dados.localId,
      item_id: dados.itemId,
      data: dataDeHoje(),
      status: dados.status,
      observacao,
      sincronizado_em: new Date().toISOString(),
    },
    { onConflict: 'local_id,item_id,data' },
  );

  if (error) {
    return { ok: false, mensagem: error.message };
  }

  revalidatePath('/hoje');
  revalidatePath('/plano');
  revalidatePath('/ronda');
  return { ok: true };
}

export async function lancarMovimentoDeSuprimento(dados: {
  suprimentoId: string;
  tipo: 'consumo' | 'reposicao';
  quantidade: number;
  observacao?: string;
}): Promise<Resultado> {
  if (!Number.isFinite(dados.quantidade) || dados.quantidade <= 0) {
    return { ok: false, mensagem: 'Informe uma quantidade maior que zero.' };
  }

  // A pessoa digita sempre um número positivo; o sinal é regra de dados.
  const quantidade = dados.tipo === 'consumo' ? -dados.quantidade : dados.quantidade;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from('movimentos_suprimento').insert({
    suprimento_id: dados.suprimentoId,
    tipo: dados.tipo,
    quantidade,
    observacao: dados.observacao?.trim() || null,
  });

  if (error) {
    return { ok: false, mensagem: error.message };
  }

  revalidatePath('/suprimentos');
  revalidatePath('/hoje');
  revalidatePath('/plano');
  return { ok: true };
}

/** Telas que mostram tarefa ou chamado e precisam reler depois de escrever. */
function revalidarTrabalho(): void {
  revalidatePath('/hoje');
  revalidatePath('/plano');
  revalidatePath('/tarefas');
}

export async function criarTarefa(dados: {
  titulo: string;
  localId?: string;
  observacao?: string;
  prazo?: string;
}): Promise<Resultado> {
  const titulo = dados.titulo.trim();
  if (!titulo) {
    return { ok: false, mensagem: 'A tarefa precisa de um título.' };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from('tarefas').insert({
    titulo,
    local_id: dados.localId || null,
    observacao: dados.observacao?.trim() || null,
    prazo: dados.prazo || null,
  });

  if (error) return { ok: false, mensagem: error.message };

  revalidarTrabalho();
  return { ok: true };
}

const STATUS_TAREFA: readonly StatusTarefa[] = [
  'pendente',
  'em_andamento',
  'concluida',
  'cancelada',
];

/**
 * Muda o status e acerta `concluida_em` junto. A constraint
 * `tarefas_conclusao_coerente` rejeita a linha se os dois discordarem,
 * então quem move o status é obrigado a mexer na data — melhor aqui, num
 * lugar só, do que espalhado por cada tela.
 */
export async function moverTarefa(
  id: string,
  status: StatusTarefa,
): Promise<Resultado> {
  if (!STATUS_TAREFA.includes(status)) {
    return { ok: false, mensagem: 'Status inválido.' };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from('tarefas')
    .update({
      status,
      concluida_em: status === 'concluida' ? new Date().toISOString() : null,
    })
    .eq('id', id);

  if (error) return { ok: false, mensagem: error.message };

  revalidarTrabalho();
  return { ok: true };
}

/** O "onde parei": anotação de progresso sem mudar o status. */
export async function anotarProgresso(id: string, observacao: string): Promise<Resultado> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from('tarefas')
    .update({ observacao: observacao.trim() || null })
    .eq('id', id);

  if (error) return { ok: false, mensagem: error.message };

  revalidarTrabalho();
  return { ok: true };
}

// ---------- Relatórios ----------

/**
 * Congela o período num snapshot. Existe como ação explícita porque o
 * relatório persistido é justamente o que não deve mudar depois: se um
 * lançamento antigo for corrigido amanhã, a tela ao vivo muda e o
 * snapshot não.
 */
export async function gerarRelatorio(dados: {
  tipo: TipoRelatorio;
  inicio: string;
  fim: string;
}): Promise<Resultado> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('gerar_relatorio', {
    p_tipo: dados.tipo,
    p_inicio: dados.inicio,
    p_fim: dados.fim,
  });

  if (error) return { ok: false, mensagem: error.message };

  revalidatePath('/relatorios');
  return { ok: true };
}

// ---------- Inventário ----------

function revalidarInventario(id?: string): void {
  revalidatePath('/inventario');
  if (id) revalidatePath(`/inventario/${id}`);
}

export async function cadastrarItem(dados: {
  item: string;
  codigoBarras?: string;
  descricao?: string;
  localPadraoId: string;
}): Promise<Resultado> {
  const item = dados.item.trim();
  if (!item) return { ok: false, mensagem: 'O item precisa de um nome.' };
  if (!dados.localPadraoId) return { ok: false, mensagem: 'Escolha o local padrão.' };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from('inventario').insert({
    item,
    codigo_barras: dados.codigoBarras?.trim() || null,
    descricao: dados.descricao?.trim() || null,
    local_padrao_id: dados.localPadraoId,
    // Nasce onde é a casa dele. Se estiver em outro lugar, isso é uma
    // movimentação — e movimentação é evento, não estado inicial.
    local_atual_id: dados.localPadraoId,
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false, mensagem: 'Já existe um item com esse código de barras.' };
    }
    return { ok: false, mensagem: error.message };
  }

  revalidarInventario();
  return { ok: true };
}

/**
 * Registra a movimentação e nada mais. A trigger
 * `aplicar_movimentacao_no_inventario` cuida de mover o item, preencher
 * ou limpar o responsável e resolver a origem — por isso aqui não há
 * nenhum update em `inventario`. Escrever nas duas tabelas seria a forma
 * mais fácil de deixá-las divergentes.
 */
export async function movimentarItem(dados: {
  inventarioId: string;
  tipo: TipoMovimentacaoInventario;
  localDestinoId: string;
  responsavel?: string;
  previsaoDevolucao?: string;
  observacao?: string;
}): Promise<Resultado> {
  if (!TIPOS_MOVIMENTACAO.includes(dados.tipo)) {
    return { ok: false, mensagem: 'Tipo de movimentação inválido.' };
  }
  if (!dados.localDestinoId) {
    return { ok: false, mensagem: 'Escolha o destino.' };
  }
  // Espelha a constraint movimentacoes_emprestimo_tem_responsavel: melhor
  // devolver a frase do que deixar o Postgres responder em inglês.
  if (dados.tipo === 'emprestimo' && !dados.responsavel?.trim()) {
    return { ok: false, mensagem: 'Empréstimo precisa de um responsável.' };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from('movimentacoes_inventario').insert({
    inventario_id: dados.inventarioId,
    tipo: dados.tipo,
    local_destino_id: dados.localDestinoId,
    responsavel: dados.tipo === 'emprestimo' ? dados.responsavel!.trim() : null,
    previsao_devolucao: dados.tipo === 'emprestimo' ? dados.previsaoDevolucao || null : null,
    observacao: dados.observacao?.trim() || null,
  });

  if (error) return { ok: false, mensagem: error.message };

  revalidarInventario(dados.inventarioId);
  return { ok: true };
}

/** Baixa lógica: o histórico de movimentação precisa continuar de pé. */
export async function desativarItem(id: string): Promise<Resultado> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from('inventario').update({ ativo: false }).eq('id', id);

  if (error) return { ok: false, mensagem: error.message };

  revalidarInventario(id);
  return { ok: true };
}

// ---------- Chamados ----------

const STATUS_CHAMADO: readonly StatusChamado[] = [
  'rascunho',
  'enviado',
  'em_atendimento',
  'concluido',
  'cancelado',
];

export async function criarChamado(dados: {
  titulo: string;
  descricao?: string;
  localId?: string;
  pendenciaId?: string;
  destino?: string;
  prioridade?: PrioridadeChamado;
}): Promise<Resultado> {
  const titulo = dados.titulo.trim();
  if (!titulo) return { ok: false, mensagem: 'O chamado precisa de um título.' };

  const supabase = await criarClienteServidor();
  // Nasce como rascunho: o chamado só "existe" para o SEAMB depois de
  // enviado, e é o envio que carimba enviado_em.
  const { error } = await supabase.from('chamados').insert({
    titulo,
    descricao: dados.descricao?.trim() || null,
    local_id: dados.localId || null,
    pendencia_id: dados.pendenciaId || null,
    destino: dados.destino?.trim() || 'SEAMB',
    prioridade: dados.prioridade ?? 'media',
    status: 'rascunho',
  });

  if (error) return { ok: false, mensagem: error.message };

  revalidarTrabalho();
  return { ok: true };
}

/**
 * Move o chamado pelo ciclo de vida acertando os dois carimbos que as
 * constraints exigem:
 *
 *   chamados_envio_coerente      → só rascunho pode ter enviado_em nulo
 *   chamados_fechamento_coerente → fechado_em existe exatamente nos
 *                                  status terminais
 *
 * Voltar para um status anterior é permitido de propósito: o SEAMB às
 * vezes devolve um chamado dado como concluído, e reabrir deve ser um
 * clique, não um insert novo que perderia o protocolo.
 */
export async function moverChamado(
  id: string,
  status: StatusChamado,
): Promise<Resultado> {
  if (!STATUS_CHAMADO.includes(status)) {
    return { ok: false, mensagem: 'Status inválido.' };
  }

  const supabase = await criarClienteServidor();
  const { data: atual, error: erroLeitura } = await supabase
    .from('chamados')
    .select('enviado_em')
    .eq('id', id)
    .maybeSingle();

  if (erroLeitura) return { ok: false, mensagem: erroLeitura.message };
  if (!atual) return { ok: false, mensagem: 'Chamado não encontrado.' };

  const agora = new Date().toISOString();
  const terminal = status === 'concluido' || status === 'cancelado';
  // Preserva o enviado_em original; só inventa a data se o chamado
  // estiver pulando o passo de envio.
  const enviadoEm =
    status === 'rascunho' ? null : ((atual.enviado_em as string | null) ?? agora);

  const { error } = await supabase
    .from('chamados')
    .update({ status, enviado_em: enviadoEm, fechado_em: terminal ? agora : null })
    .eq('id', id);

  if (error) return { ok: false, mensagem: error.message };

  revalidarTrabalho();
  return { ok: true };
}

/** Número que o setor externo devolve depois de receber o chamado. */
export async function registrarProtocolo(id: string, protocolo: string): Promise<Resultado> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from('chamados')
    .update({ protocolo_externo: protocolo.trim() || null })
    .eq('id', id);

  if (error) return { ok: false, mensagem: error.message };

  revalidarTrabalho();
  return { ok: true };
}

// ---------- Planta ----------

const STATUS_CLASSE_VALIDOS: readonly StatusClasse[] = ['ok', 'quebrada', 'faltando'];

const TIPOS_ELEMENTO: readonly TipoElemento[] = [
  'classe',
  'quadro',
  'porta',
  'mesa_professor',
  'projetor',
];

/**
 * Registra o estado de uma classe. INSERT sempre, nunca UPDATE:
 * `classes_status` é log append-only e o estado atual é a linha mais
 * recente, projetada por vw_classes_status_atual. Ao contrário da ronda,
 * aqui interessa o histórico da cadeira — quando quebrou, quando voltou.
 */
export async function registrarStatusDeClasse(dados: {
  localId: string;
  classeRef: string;
  status: StatusClasse;
  observacao?: string;
  codigoDoLocal: string;
}): Promise<Resultado> {
  if (!STATUS_CLASSE_VALIDOS.includes(dados.status)) {
    return { ok: false, mensagem: 'Status inválido.' };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from('classes_status').insert({
    local_id: dados.localId,
    classe_ref: dados.classeRef,
    status: dados.status,
    observacao: dados.observacao?.trim() || null,
  });

  if (error) return { ok: false, mensagem: error.message };

  revalidatePath('/planta');
  revalidatePath(`/planta/${encodeURIComponent(dados.codigoDoLocal)}`);
  return { ok: true };
}

/**
 * Grava o desenho da sala. A planta é documentação visual (decisão 01 do
 * ADR), então salvar o layout inteiro de uma vez é aceitável — é edição
 * ocasional feita sentado, não captura em campo.
 */
export async function salvarPlanta(dados: {
  localId: string;
  codigoDoLocal: string;
  gridCols: number;
  gridRows: number;
  elementos: ElementoPlanta[];
}): Promise<Resultado> {
  const { gridCols, gridRows, elementos } = dados;

  if (!Number.isInteger(gridCols) || gridCols < 1 || gridCols > 40) {
    return { ok: false, mensagem: 'A largura do grid precisa ficar entre 1 e 40.' };
  }
  if (!Number.isInteger(gridRows) || gridRows < 1 || gridRows > 40) {
    return { ok: false, mensagem: 'A altura do grid precisa ficar entre 1 e 40.' };
  }

  const refsVistas = new Set<string>();
  for (const elemento of elementos) {
    if (!TIPOS_ELEMENTO.includes(elemento.tipo)) {
      return { ok: false, mensagem: `Tipo de elemento desconhecido: ${elemento.tipo}.` };
    }
    if (!elemento.ref?.trim()) {
      return { ok: false, mensagem: 'Todo elemento precisa de uma referência.' };
    }
    if (elemento.x < 0 || elemento.x >= gridCols || elemento.y < 0 || elemento.y >= gridRows) {
      return { ok: false, mensagem: `O elemento ${elemento.ref} caiu fora do grid.` };
    }
    // A ref é a chave que liga o desenho ao histórico em classes_status.
    // Duplicá-la faria duas células compartilharem o mesmo estado.
    if (refsVistas.has(elemento.ref)) {
      return { ok: false, mensagem: `Referência repetida: ${elemento.ref}.` };
    }
    refsVistas.add(elemento.ref);
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from('plantas').upsert(
    {
      local_id: dados.localId,
      grid_cols: gridCols,
      grid_rows: gridRows,
      elementos,
    },
    { onConflict: 'local_id' },
  );

  if (error) return { ok: false, mensagem: error.message };

  revalidatePath('/planta');
  revalidatePath(`/planta/${encodeURIComponent(dados.codigoDoLocal)}`);
  return { ok: true };
}

/** Atalho da tela Hoje. O acerto de concluida_em mora em moverTarefa. */
export async function concluirTarefa(id: string): Promise<Resultado> {
  return moverTarefa(id, 'concluida');
}
