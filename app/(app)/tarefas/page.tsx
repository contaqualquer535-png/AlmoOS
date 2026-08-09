import { redirect } from 'next/navigation';

/**
 * /tarefas foi dividida em /trabalho e /chamados.
 *
 * Tarefa e chamado respondem perguntas diferentes: uma é o que depende
 * de você, a outra é o que depende de terceiro. Juntas, o chamado
 * parecia estar sob seu controle.
 *
 * O redirecionamento fica no lugar de apagar a rota porque links
 * antigos e o histórico do navegador continuam apontando para cá.
 */
export default function PaginaTarefas() {
  redirect('/trabalho');
}
