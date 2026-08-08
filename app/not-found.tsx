import Link from 'next/link';

export default function NaoEncontrado() {
  return (
    <div className="conteudo">
      <p className="sobrescrito">404</p>
      <h1 className="titulo">Esta página não existe</h1>
      <p style={{ marginTop: '1rem' }}>
        <Link className="botao" href="/hoje">
          Voltar para Hoje
        </Link>
      </p>
    </div>
  );
}
