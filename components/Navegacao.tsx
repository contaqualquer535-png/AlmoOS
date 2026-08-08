'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS = [
  { href: '/hoje', rotulo: 'Hoje' },
  { href: '/ronda', rotulo: 'Ronda' },
  { href: '/salas', rotulo: 'Salas' },
  { href: '/planta', rotulo: 'Plantas' },
  { href: '/suprimentos', rotulo: 'Suprimentos' },
  { href: '/inventario', rotulo: 'Inventário' },
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
