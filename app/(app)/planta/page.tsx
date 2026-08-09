import { redirect } from 'next/navigation';

/**
 * O índice de plantas foi absorvido por /salas.
 *
 * Duas telas listando os mesmos ambientes obrigavam a lembrar em qual
 * delas estava o que se procura. A planta continua existindo, mas como
 * detalhe de cada sala — /planta/[codigo].
 *
 * O redirecionamento fica no lugar de apagar a rota porque links
 * antigos, favoritos e a barra de endereço do navegador continuam
 * apontando para cá.
 */
export default function PaginaPlantas() {
  redirect('/salas');
}
