import Link from 'next/link';
import { criarClienteServidor } from '@/lib/supabase/server';
import { buscarOpcoesDeAcaoRapida } from '@/lib/data/consultas';
import { Navegacao } from '@/components/Navegacao';
import { AcaoRapida } from '@/components/AcaoRapida';

export default async function CascaDoApp({ children }: { children: React.ReactNode }) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // O lançador precisa das listas em qualquer tela. Se o banco ainda não
  // tiver as tabelas novas, ele aparece vazio em vez de derrubar a
  // navegação inteira — a casca não pode falhar por causa de um extra.
  const opcoes = await buscarOpcoesDeAcaoRapida().catch(() => ({
    ambientes: [],
    suprimentos: [],
    recursos: [],
  }));

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
      <AcaoRapida opcoes={opcoes} />
    </div>
  );
}
