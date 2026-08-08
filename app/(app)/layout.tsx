import Link from 'next/link';
import { criarClienteServidor } from '@/lib/supabase/server';
import { Navegacao } from '@/components/Navegacao';

export default async function CascaDoApp({ children }: { children: React.ReactNode }) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="casca">
      <header className="barra">
        <div className="barra__interno">
          <Link className="barra__marca" href="/hoje">
            Gestão CETEC
          </Link>
          <Navegacao />
          <form action="/sair" method="post">
            <button className="botao botao--discreto" type="submit">
              {user?.email ? `Sair (${user.email})` : 'Sair'}
            </button>
          </form>
        </div>
      </header>
      <main className="conteudo">{children}</main>
    </div>
  );
}
