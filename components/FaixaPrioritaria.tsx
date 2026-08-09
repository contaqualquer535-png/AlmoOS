import Link from 'next/link';

import type { PontoDeAtencao, Previsoes } from '@/lib/types/database';

/**
 * União literal em vez de string.
 *
 * Com `typedRoutes` ligado, o Next só aceita em `href` rotas que ele
 * conhece. Tipar como string quebra a compilação — e a restrição é boa:
 * um destino escrito errado aqui viraria link morto silencioso.
 */
type Destino = '/ronda' | '/trabalho' | '/chamados' | '/suprimentos' | '/recursos';

export interface ItemPrioritario {
  texto: string;
  urgencia: 'alta' | 'media';
  para: Destino;
}

/**
 * A primeira coisa que se lê ao abrir o sistema.
 *
 * O mosaico abaixo mostra tudo; esta faixa mostra o que não pode
 * esperar. A diferença importa porque um painel completo tem o defeito
 * de tratar tudo com o mesmo peso — e o operador chega de manhã
 * precisando saber por onde começar, não como está cada coisa.
 *
 * Só entra aqui o que é fato apurado: chamado parado, estoque no fim,
 * prazo vencido. Nada de leitura de modelo — essa fica no cartão de
 * previsões, com a procedência declarada.
 */
export function FaixaPrioritaria({
  pontos,
  previsoes,
  pendenciasAntigas,
  salasFaltando,
  ehDiaDeRonda,
}: {
  pontos: PontoDeAtencao[];
  previsoes: Previsoes;
  pendenciasAntigas: number;
  salasFaltando: number;
  ehDiaDeRonda: boolean;
}) {
  const itens: ItemPrioritario[] = [];

  if (ehDiaDeRonda && salasFaltando > 0) {
    itens.push({
      texto: `${salasFaltando} ${salasFaltando === 1 ? 'sala falta' : 'salas faltam'} na ronda`,
      urgencia: salasFaltando > 8 ? 'alta' : 'media',
      para: '/ronda',
    });
  }

  // Chamado encalhado e prazo vencido vêm dos pontos determinísticos,
  // que já chegam ordenados por prioridade e idade.
  for (const ponto of pontos.filter((p) => p.prioridade === 'alta').slice(0, 4)) {
    itens.push({
      texto: ponto.mensagem,
      urgencia: 'alta',
      para:
        ponto.tipo === 'chamado_parado'
          ? '/chamados'
          : ponto.tipo === 'suprimento_critico'
            ? '/suprimentos'
            : ponto.tipo === 'devolucao_atrasada'
              ? '/recursos'
              : '/trabalho',
    });
  }

  const acabando = previsoes.esgotamento.filter((e) => e.dias_restantes <= 7);
  if (acabando.length > 0) {
    itens.push({
      texto: `Comprar: ${acabando.map((e) => e.nome).join(', ')}`,
      urgencia: 'alta',
      para: '/suprimentos',
    });
  }

  if (pendenciasAntigas > 0) {
    itens.push({
      texto: `${pendenciasAntigas} ${
        pendenciasAntigas === 1 ? 'pendência aberta' : 'pendências abertas'
      } há mais de duas semanas`,
      urgencia: 'media',
      para: '/trabalho',
    });
  }

  if (itens.length === 0) {
    return (
      <p className="prioridade prioridade--limpa">
        <span className="prioridade__marca">Livre</span>
        <span>
          Nada urgente. Nenhum prazo vencido, nenhum estoque no fim, nenhum chamado
          encalhado.
        </span>
      </p>
    );
  }

  return (
    <div className="prioridade">
      <span className="prioridade__marca">Primeiro</span>

      <ol className="prioridade__lista">
        {itens.slice(0, 6).map((item, i) => (
          <li
            className={`prioridade__item${
              item.urgencia === 'alta' ? ' prioridade__item--alta' : ''
            }`}
            key={`${item.texto}-${i}`}
          >
            <Link href={item.para}>{item.texto}</Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
