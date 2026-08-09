// Tipos do schema. Espelham as migrations em supabase/migrations.
//
// Regerar depois de qualquer migration:
//   supabase gen types typescript --linked > lib/types/database.ts
// Enquanto o projeto não estiver linkado, mantenha este arquivo à mão —
// mas ele é a fonte de verdade do lado do cliente e precisa acompanhar
// o schema.

export type StatusVerificacao = 'ok' | 'manutencao' | 'resolvido' | 'trocado';
export type TipoResolucao = 'resolvido' | 'trocado';
export type TipoLocal =
  | 'sala'
  | 'banheiro'
  | 'apoio'
  | 'teatro'
  | 'almoxarifado'
  | 'externo';
export type CategoriaSuprimento = 'copa' | 'manutencao' | 'limpeza';
export type StatusClasse = 'ok' | 'quebrada' | 'faltando';
export type TipoElemento =
  | 'classe'
  | 'quadro'
  | 'porta'
  | 'mesa_professor'
  | 'projetor';
export type StatusTarefa = 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
export type PrioridadeChamado = 'baixa' | 'media' | 'alta';
export type TipoMovimentacaoInventario = 'emprestimo' | 'devolucao' | 'transferencia';
export type StatusChamado =
  | 'rascunho'
  | 'enviado'
  | 'em_atendimento'
  | 'concluido'
  | 'cancelado';

/** Códigos como aparecem na planilha impressa. */
export const CODIGO_STATUS: Record<StatusVerificacao, string> = {
  ok: '✓',
  manutencao: 'M',
  resolvido: 'X',
  trocado: 'T',
};

export const ROTULO_STATUS: Record<StatusVerificacao, string> = {
  ok: 'Ok',
  manutencao: 'Manutenção pendente',
  resolvido: 'Resolvido',
  trocado: 'Trocado',
};

export const ROTULO_STATUS_CLASSE: Record<StatusClasse, string> = {
  ok: 'Em ordem',
  quebrada: 'Quebrada',
  faltando: 'Faltando',
};

/** Glifo de cada tipo no grid. Decorativo — o nome vai no aria-label. */
export const GLIFO_ELEMENTO: Record<TipoElemento, string> = {
  classe: '',
  quadro: '▬',
  porta: '⌐',
  mesa_professor: '▭',
  projetor: '◉',
};

export const ROTULO_ELEMENTO: Record<TipoElemento, string> = {
  classe: 'Classe',
  quadro: 'Quadro',
  porta: 'Porta',
  mesa_professor: 'Mesa do professor',
  projetor: 'Projetor',
};

// ---------- Retorno de public.montar_plano_do_dia(date) ----------

export interface PendenciaDoPlano {
  id: string;
  local_codigo: string;
  bloco: string | null;
  ordem_visita: number | null;
  item: string;
  aberta_em: string;
  dias_aberta: number;
  observacao: string | null;
}

export interface SuprimentoCritico {
  nome: string;
  quantidade_atual: number;
  unidade: string;
  ponto_reposicao: number;
}

export interface TarefaDoPlano {
  id: string;
  titulo: string;
  status: StatusTarefa;
  prazo: string | null;
  observacao: string | null;
}

export interface ChamadoDoPlano {
  id: string;
  titulo: string;
  prioridade: PrioridadeChamado;
  status: StatusChamado;
  destino: string;
  dias_aberto: number;
}

export interface LocalPendenteDeRonda {
  codigo: string;
  bloco: string | null;
}

export interface PlanoDoDia {
  data: string;
  e_dia_de_ronda: boolean;
  pendencias: PendenciaDoPlano[];
  suprimentos_criticos: SuprimentoCritico[];
  tarefas: TarefaDoPlano[];
  chamados: ChamadoDoPlano[];
  locais_pendentes_de_ronda: LocalPendenteDeRonda[];
}

// ---------- Views ----------

export interface SuprimentoStatus {
  id: string;
  nome: string;
  categoria: CategoriaSuprimento;
  unidade: string;
  quantidade_atual: number;
  ponto_reposicao: number;
  consumo_medio_dia: number;
  dias_restantes: number | null;
  previsao_esgotamento: string | null;
  abaixo_do_ponto: boolean;
}

export interface RondaDoDia {
  local_id: string;
  codigo: string;
  bloco: string | null;
  ordem_visita: number | null;
  itens_registrados: number;
  itens_esperados: number;
}

export interface LocalComTurmas {
  id: string;
  codigo: string;
  nome: string | null;
  bloco: string | null;
  tipo: TipoLocal;
  ronda_padrao: boolean;
  ordem_visita: number | null;
  ativo: boolean;
  turmas_vigentes: string[];
}

export interface PendenciaAberta {
  id: string;
  local_id: string;
  local_codigo: string;
  bloco: string | null;
  ordem_visita: number | null;
  item_id: string;
  item: string;
  aberta_em: string;
  dias_aberta: number;
  observacao: string | null;
  tem_chamado_aberto: boolean;
}

// ---------- Tarefas e chamados ----------

export interface Tarefa {
  id: string;
  titulo: string;
  local_id: string | null;
  pendencia_id: string | null;
  status: StatusTarefa;
  observacao: string | null;
  prazo: string | null;
  concluida_em: string | null;
  criado_em: string;
}

export interface Chamado {
  id: string;
  titulo: string;
  descricao: string | null;
  local_id: string | null;
  pendencia_id: string | null;
  destino: string;
  protocolo_externo: string | null;
  prioridade: PrioridadeChamado;
  status: StatusChamado;
  aberto_em: string;
  enviado_em: string | null;
  fechado_em: string | null;
}

export const ROTULO_STATUS_TAREFA: Record<StatusTarefa, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const ROTULO_STATUS_CHAMADO: Record<StatusChamado, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const ROTULO_PRIORIDADE: Record<PrioridadeChamado, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

/** Status que contam como "ainda em aberto" em cada entidade. */
export const TAREFAS_ABERTAS: readonly StatusTarefa[] = ['pendente', 'em_andamento'];
export const CHAMADOS_ABERTOS: readonly StatusChamado[] = [
  'rascunho',
  'enviado',
  'em_atendimento',
];

// ---------- Insights ----------

export type TipoPontoDeAtencao =
  | 'chamado_parado'
  | 'pendencia_antiga'
  | 'suprimento_critico'
  | 'devolucao_atrasada'
  | 'tarefa_atrasada'
  | 'ronda_incompleta';

export interface PontoDeAtencao {
  tipo: TipoPontoDeAtencao;
  referencia_id: string | null;
  mensagem: string;
  prioridade: PrioridadeChamado;
}

export interface Insight {
  id: string;
  gerado_em: string;
  resumo: {
    gerado_para: string;
    pontos_atencao: PontoDeAtencao[];
    padroes_identificados: string[];
  };
  modelo: string;
  tokens_saida: number | null;
  erro: string | null;
}

export const ROTULO_PONTO: Record<TipoPontoDeAtencao, string> = {
  chamado_parado: 'Chamado',
  pendencia_antiga: 'Pendência',
  suprimento_critico: 'Estoque',
  devolucao_atrasada: 'Empréstimo',
  tarefa_atrasada: 'Tarefa',
  ronda_incompleta: 'Ronda',
};

// ---------- Painel ----------

export interface Painel {
  gerado_em: string;
  janela_dias: number;
  ranking_itens: Array<{ item: string; aberturas: number }>;
  ranking_locais: Array<{
    codigo: string;
    bloco: string | null;
    aberturas: number;
    itens: string;
  }>;
  idade_pendencias: {
    ate_7: number;
    de_7_14: number;
    de_14_30: number;
    mais_30: number;
  };
  semanas: Array<{ semana: string; abertas: number; fechadas: number }>;
  vencimentos: Array<{
    quando: string;
    tipo: 'recurso' | 'tarefa' | 'inventario' | 'suprimento';
    descricao: string;
    detalhe: string;
  }>;
  chamados_por_fila: Array<{ fila: string; abertos: number }>;
  dias_medios_ate_fechar: number | null;
  contagem_atual: Record<string, number>;
  perdas_de_contagem: Array<{
    codigo: string;
    item: string;
    agora: number;
    antes: number;
    diferenca: number;
    contado_em: string;
  }>;
  consumo_semanal: Array<{ nome: string; semana: string; consumido: number }>;
}

// ---------- Relatórios ----------

export type TipoRelatorio = 'diario' | 'semanal' | 'mensal';

export interface Relatorio {
  periodo_inicio: string;
  periodo_fim: string;
  dias_de_ronda: number;
  ronda: {
    esperado: number;
    feito: number;
    /** Percentual, ou null quando não houve dia de ronda no período. */
    cobertura: number | null;
  };
  verificacoes_por_status: Partial<Record<StatusVerificacao, number>>;
  pendencias: {
    abertas_no_periodo: number;
    fechadas_no_periodo: number;
    resolvidas: number;
    trocadas: number;
    em_aberto_no_fim: number;
  };
  por_bloco: Array<{ bloco: string; aberturas: number }>;
  por_item: Array<{ item: string; aberturas: number }>;
  suprimentos: Array<{ nome: string; unidade: string; consumido: number }>;
  chamados: { abertos: number; fechados: number; em_aberto_no_fim: number };
  tarefas: { criadas: number; concluidas: number };
}

export interface RelatorioSalvo {
  id: string;
  tipo: TipoRelatorio;
  periodo_inicio: string;
  periodo_fim: string;
  conteudo: Relatorio;
  gerado_em: string;
}

export interface DiaDaSerie {
  dia: string;
  dia_de_ronda: boolean;
  feito: number;
  esperado: number;
}

export interface BlocoDaSerie {
  bloco: string;
  abertas: number;
  dias_da_mais_antiga: number;
}

// ---------- Recursos emprestáveis por quantidade ----------

export interface RecursoStatus {
  id: string;
  nome: string;
  descricao: string | null;
  unidade: string;
  quantidade_total: number;
  minimo_desejado: number;
  local_guarda_id: string | null;
  local_guarda: string | null;
  quantidade_emprestada: number;
  quantidade_disponivel: number;
  retiradas_abertas: number;
  abaixo_do_minimo: boolean;
  retiradas_atrasadas: number;
}

export interface EmprestimoDeRecurso {
  id: string;
  recurso_id: string;
  quantidade: number;
  responsavel: string | null;
  local_id: string | null;
  observacao: string | null;
  retirado_em: string;
  previsao_devolucao: string | null;
  devolvido_em: string | null;
}

export interface ContagemDeMobiliario {
  total_classes: number;
  classes_quebradas: number;
  classes_faltando: number;
  classes_em_ordem: number;
  salas_com_planta: number;
}

// ---------- Inventário ----------

export interface ItemInventario {
  id: string;
  codigo_barras: string | null;
  item: string;
  descricao: string | null;
  local_padrao_id: string;
  local_atual_id: string;
  responsavel: string | null;
  emprestado_em: string | null;
  previsao_devolucao: string | null;
  /** Coluna gerada no banco: nunca diverge de "tem responsável". */
  emprestado: boolean;
  ativo: boolean;
}

export interface MovimentacaoInventario {
  id: string;
  inventario_id: string;
  tipo: TipoMovimentacaoInventario;
  local_origem_id: string | null;
  local_destino_id: string;
  responsavel: string | null;
  previsao_devolucao: string | null;
  observacao: string | null;
  data: string;
}

export const ROTULO_MOVIMENTACAO: Record<TipoMovimentacaoInventario, string> = {
  emprestimo: 'Empréstimo',
  devolucao: 'Devolução',
  transferencia: 'Transferência',
};

// ---------- Planta ----------

/** Um elemento posicionado no grid. Espelha plantas.elementos[]. */
export interface ElementoPlanta {
  ref: string;
  tipo: TipoElemento;
  x: number;
  y: number;
}

export interface Planta {
  local_id: string;
  grid_cols: number;
  grid_rows: number;
  elementos: ElementoPlanta[];
  atualizado_em: string;
}

export interface ClasseStatusAtual {
  local_id: string;
  classe_ref: string;
  status: StatusClasse;
  observacao: string | null;
  registrado_em: string;
}

export interface PlantaResumo {
  local_id: string;
  codigo: string;
  nome: string | null;
  bloco: string | null;
  ordem_visita: number | null;
  /** Nulos enquanto o ambiente não tiver planta desenhada. */
  grid_cols: number | null;
  grid_rows: number | null;
  atualizado_em: string | null;
  turmas_vigentes: string[];
  total_classes: number;
  classes_quebradas: number;
  classes_faltando: number;
  tem_planta: boolean;
}
