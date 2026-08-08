'use client';

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="conteudo">
      <p className="sobrescrito">Erro</p>
      <h1 className="titulo">Esta tela não carregou</h1>
      <p className="erro" style={{ marginTop: '1rem' }}>
        {error.message}
      </p>

      {/* Em produção o Next substitui a mensagem real por um texto
          genérico e só entrega o digest. Sem esta dica, quem vê a tela
          não tem como saber que o motivo está no log do servidor. */}
      {error.digest ? (
        <p className="vazio">
          O motivo está no log do servidor, na linha com o digest{' '}
          <code>{error.digest}</code>. Rodando <code>npm run dev</code> a mensagem
          aparece aqui inteira.
        </p>
      ) : null}

      <button className="botao" type="button" onClick={reset}>
        Tentar de novo
      </button>
    </div>
  );
}
