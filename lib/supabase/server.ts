import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * O pacote aceita duas formas de API de cookie e o tipo do parâmetro vira
 * uma união, o que impede a inferência contextual. Anotamos explicitamente.
 */
type CookiesParaDefinir = Array<{ name: string; value: string; options: CookieOptions }>;

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Sempre criado por requisição: o cliente carrega a sessão do usuário e não
 * pode ser compartilhado entre requisições.
 */
export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    exigirEnv('NEXT_PUBLIC_SUPABASE_URL'),
    exigirEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesParaDefinir: CookiesParaDefinir) {
          try {
            cookiesParaDefinir.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components não podem escrever cookies. A renovação do
            // token acontece no middleware, então ignorar aqui é seguro.
          }
        },
      },
    },
  );
}

function exigirEnv(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(
      `Variável de ambiente ${nome} não definida. Copie .env.example para .env.local.`,
    );
  }
  return valor;
}
