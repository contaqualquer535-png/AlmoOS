'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/client';

function FormularioDeEntrada() {
  const router = useRouter();
  const parametros = useSearchParams();
  const proximo = parametros.get('proximo') ?? '/hoje';

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrarComSenha(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha não conferem.'
          : error.message,
      );
      setEnviando(false);
      return;
    }

    router.replace(proximo as never);
    router.refresh();
  }

  async function entrarComGoogle() {
    setEnviando(true);
    setErro(null);

    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?proximo=${encodeURIComponent(proximo)}`,
      },
    });

    if (error) {
      setErro(error.message);
      setEnviando(false);
    }
  }

  return (
    <div className="entrada">
      <p className="sobrescrito">CETEC / UCS</p>
      <h1 className="titulo" style={{ marginBottom: '1.5rem' }}>
        Entrar
      </h1>

      {erro ? <p className="erro">{erro}</p> : null}

      <form onSubmit={entrarComSenha}>
        <label className="campo">
          <span className="campo__rotulo">E-mail</span>
          <input
            className="campo__entrada"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="campo">
          <span className="campo__rotulo">Senha</span>
          <input
            className="campo__entrada"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>

        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <div className="entrada__separador">ou</div>

      <button
        className="botao botao--discreto"
        type="button"
        onClick={entrarComGoogle}
        disabled={enviando}
      >
        Entrar com a conta Google da UCS
      </button>
    </div>
  );
}

export default function PaginaDeEntrada() {
  return (
    <Suspense>
      <FormularioDeEntrada />
    </Suspense>
  );
}
