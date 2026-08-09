'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Sete abas, agrupadas pelo tipo de pergunta que cada uma responde.
 *
 *   Hoje       — como está tudo
 *   Ronda      — o registro do dia
 *   Trabalho   — o que depende de mim
 *   Chamados   — o que depende de terceiro
 *   Salas      — o inventário de espaços
 *   Estoque    — o que se gasta e o que se empresta
 *   Relatórios — o que aconteceu
 *
 * Roteiro, Notas, Plantas, Inventário, Assistente e Importar não têm
 * aba própria: são alcançados de dentro da tela a que pertencem. Aba é
 * caro — cada uma exige lembrar que existe.
 */
const ITENS = [
  { href: '/hoje', rotulo: 'Hoje' },
  { href: '/ronda', rotulo: 'Ronda' },
  { href: '/trabalho', rotulo: 'Trabalho' },
  { href: '/chamados', rotulo: 'Chamados' },
  { href: '/salas', rotulo: 'Salas' },
  { href: '/almoxarifado', rotulo: 'Almoxarifado' },
  { href: '/relatorios', rotulo: 'Relatórios' },
  { href: '/assistente', rotulo: 'Assistente' },
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
