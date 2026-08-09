'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS = [
  { href: '/hoje', rotulo: 'Hoje' },
  { href: '/ronda', rotulo: 'Ronda' },
  // /planta continua existindo como detalhe de cada sala, mas saiu da
  // navegação: listar o mesmo conjunto em duas abas obrigava a lembrar
  // em qual delas estava o que se procura.
  { href: '/salas', rotulo: 'Salas' },
  { href: '/suprimentos', rotulo: 'Suprimentos' },
  { href: '/recursos', rotulo: 'Recursos' },
  { href: '/inventario', rotulo: 'Inventário' },
  { href: '/pendencias', rotulo: 'Pendências' },
  { href: '/roteiro', rotulo: 'Roteiro' },
  { href: '/tarefas', rotulo: 'Tarefas' },
  { href: '/relatorios', rotulo: 'Relatórios' },
  { href: '/plano', rotulo: 'Plano do dia' },
  { href: '/assistente', rotulo: 'Assistente' },
  { href: '/importar', rotulo: 'Importar' },
] as const;

export function Navegacao() {
  const caminho = usePathname();

  return (
    <nav className="barra__nav" aria-label="Seções">
      {ITENS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`barra__link${caminho.startsWith(item.href) ? ' barra__link--ativo' : ''}`}
          aria-current={caminho.startsWith(item.href) ? 'page' : undefined}
        >
          {item.rotulo}
        </Link>
      ))}
    </nav>
  );
}
