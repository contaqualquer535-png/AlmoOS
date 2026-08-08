'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { lancarVerificacao } from '@/lib/data/mutacoes';
import { CODIGO_STATUS, ROTULO_STATUS, type StatusVerificacao } from '@/lib/types/database';
import type { ItemChecklist } from '@/lib/data/consultas';

const OPCOES: StatusVerificacao[] = ['ok', 'manutencao', 'resolvido', 'trocado'];

interface Lancamento {
  status: StatusVerificacao;
  observacao: string | null;
}

/**
 * Um item por linha, quatro botões grandes. O toque é o registro: não há
 * botão "salvar tudo", porque a ronda é interrompida o tempo todo e uma
 * tela cheia de trabalho não salvo é trabalho perdido.
 */
export function FormularioRonda({
  localId,
  itens,
  lancados,
}: {
  localId: string;
  itens: ItemChecklist[];
  lancados: Record<string, Lancamento>;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Record<string, Lancamento>>(lancados);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciarTransicao] = useTransition();

  async function marcar(item: ItemChecklist, status: StatusVerificacao) {
    setSalvando(item.id);
    setErro(null);

    const observacao = estado[item.id]?.observacao ?? null;
    const resultado = await lancarVerificacao({
      localId,
      itemId: item.id,
      status,
      observacao: observacao ?? undefined,
    });

    setSalvando(null);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'O lançamento não foi gravado.');
      return;
    }

    setEstado((anterior) => ({ ...anterior, [item.id]: { status, observacao } }));
    iniciarTransicao(() => router.refresh());
  }

  async function anotar(item: ItemChecklist, texto: string) {
    const atual = estado[item.id];
    setEstado((anterior) => ({
      ...anterior,
      [item.id]: { status: atual?.status ?? 'ok', observacao: texto },
    }));

    if (!atual) return; // sem status lançado ainda, nada a gravar

    await lancarVerificacao({
      localId,
      itemId: item.id,
      status: atual.status,
      observacao: texto,
    });
  }

  return (
    <>
      {erro ? <p className="erro">{erro}</p> : null}

      <ul className="linhas">
        {itens.map((item) => {
          const atual = estado[item.id];
          const precisaDeNota =
            atual?.status === 'manutencao' || (atual?.observacao ?? '') !== '';

          return (
            <li className="item-ronda" key={item.id}>
              <div className="item-ronda__linha">
                <span className="item-ronda__nome">{item.nome}</span>
                <div className="item-ronda__opcoes" role="group" aria-label={item.nome}>
                  {OPCOES.map((opcao) => {
                    const ativo = atual?.status === opcao;
                    return (
                      <button
                        key={opcao}
                        type="button"
                        className={`opcao opcao--${opcao}${ativo ? ' opcao--ativa' : ''}`}
                        aria-pressed={ativo}
                        disabled={salvando === item.id}
                        onClick={() => marcar(item, opcao)}
                        title={ROTULO_STATUS[opcao]}
                      >
                        <span aria-hidden="true">{CODIGO_STATUS[opcao]}</span>
                        <span className="visualmente-oculto">{ROTULO_STATUS[opcao]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {precisaDeNota ? (
                <input
                  className="campo__entrada item-ronda__nota"
                  type="text"
                  placeholder="O que foi observado?"
                  defaultValue={atual?.observacao ?? ''}
                  onBlur={(e) => anotar(item, e.target.value)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
