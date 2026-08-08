import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/server';

/**
 * Retorno do OAuth: troca o código por uma sessão e grava o cookie.
 * O Supabase redireciona para cá depois do consentimento no Google.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get('code');
  const proximo = searchParams.get('proximo') ?? '/hoje';

  if (!codigo) {
    return NextResponse.redirect(`${origin}/login?erro=codigo_ausente`);
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.exchangeCodeForSession(codigo);

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=troca_falhou`);
  }

  // Só aceita caminho interno: evita redirecionamento aberto.
  const destino = proximo.startsWith('/') && !proximo.startsWith('//') ? proximo : '/hoje';
  return NextResponse.redirect(`${origin}${destino}`);
}
