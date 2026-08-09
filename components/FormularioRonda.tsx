'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { apagarVerificacao, lancarVerificacao } from '@/lib/data/mutacoes';
import { dataCurta } from '@/lib/formato';
import { CODIGO_STATUS, ROTULO_STATUS, type StatusVerificacao } from '@/lib/types/database';
import type { ItemChecklist, LancamentoDoDia } from '@/lib/data/consultas';

const OPCOES: StatusVerificacao[] = ['ok', 'manutencao', 'resolvido', 'trocado'];

/**
 * Um item por linha, quatro botões grandes. O toque é o registro: não há
 * botão "salvar tudo", porque a ronda é interrompida o tempo todo e uma
 * tela cheia de trabalho não salvo é trabalho perdido.
 *
 * Tocar no código que já está marcado **apaga** o lançamento. Sem isso,
 * errar o botão não tinha desfazer: a chave é (local, item, data), então
 * dava para trocar de código, mas nunca voltar a "não lançado".
 */
export function FormularioRonda({
  localId,
  itens,
  lancados,
  anteriores = {},
}: {
  localId: string;
  itens: ItemChecklist[];
  lancados: Record<string, LancamentoDoDia>;
  anteriores?: Record<string, { quantidade: number; contado_em: string }>;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Record<string, LancamentoDoDia>>(lancados);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciarTransicao] = useTransition();

  function atualizar(itemId: string, valor: LancamentoDoDia | null) {
    setEstado((anterior) => {
      const copia = { ...anterior };
      if (valor === null) delete copia[itemId];
      else copia[itemId] = valor;
      return copia;
    });
  }

  async function marcar(item: ItemChecklist, status: StatusVerificacao) {
    const atual = estado[item.id];
    setSalvando(item.id);
    setErro(null);

    // Segundo toque no mesmo código desfaz.
    if (atual?.status === status) {
      const resultado = await apagarVerificacao({ localId, itemId: item.id });
      setSalvando(null);

      if (!resultado.ok) {
        setErro(resultado.mensagem ?? 'Não foi possível desfazer.');
        return;
      }

      atualizar(item.id, null);
      iniciarTransicao(() => router.refresh());
      return;
    }

    // Quantidade preservada entre trocas de código: o número de cadeiras
    // não muda porque o operador corrigiu ✓ para M.
    const quantidade =
      atual?.quantidade ?? (item.pede_quantidade ? (anteriores[item.id]?.quantidade ?? null) : null);

    const resultado = await lancarVerificacao({
      localId,
      itemId: item.id,
      status,
      observacao: atual?.observacao ?? undefined,
      quantidade,
    });

    setSalvando(null);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'O lançamento não foi gravado.');
      return;
    }

    atualizar(item.id, {
      status,
      observacao: atual?.observacao ?? null,
      quantidade,
    });
    iniciarTransicao(() => router.refresh());
  }

  async function contar(item: ItemChecklist, texto: string) {
    const atual = estado[item.id];
    if (!atual) return;

    const numero = texto.trim() === '' ? null : Math.max(0, Math.trunc(Number(texto)));
    if (numero !== null && Number.isNaN(numero)) return;

    atualizar(item.id, { ...atual, quantidade: numero });

    const resultado = await lancarVerificacao({
      localId,
      itemId: item.id,
      status: atual.status,
      observacao: atual.observacao ?? undefined,
      quantidade: numero,
    });

    if (!resultado.ok) setErro(resultado.mensagem ?? 'A contagem não foi gravada.');
    else iniciarTransicao(() => router.refresh());
  }

  async function anotar(item: ItemChecklist, texto: string) {
    const atual = estado[item.id];
    if (!atual) return;

    atualizar(item.id, { ...atual, observacao: texto });

    await lancarVerificacao({
      localId,
      itemId: item.id,
      status: atual.status,
      observacao: texto,
      quantidade: atual.quantidade,
    });
  }

  return (
    <>
      {erro ? <p className="erro">{erro}</p> : null}

      <ul className="linhas">
        {itens.map((item) => {
          const atual = estado[item.id];
          const anterior = anteriores[item.id];
          const precisaDeNota =
            atual?.status === 'manutencao' || (atual?.observacao ?? '') !== '';

          // Diferença em relação à última contagem: sumir cadeira aos
          // poucos só aparece na comparação.
          const diferenca =
            atual?.quantidade !== null && atual?.quantidade !== undefined && anterior
              ? atual.quantidade - anterior.quantidade
              : null;

          return (
            <li className="item-ronda" key={item.id}>
              <div className="item-ronda__linha">
                <span className="item-ronda__nome">
                  {item.nome}
                  {item.pede_quantidade && anterior ? (
                    <span className="linha__nota">
                      última contagem: {anterior.quantidade} em{' '}
                      {dataCurta(anterior.contado_em)}
                    </span>
                  ) : null}
                </span>

                {item.pede_quantidade && atual ? (
                  <span className="item-ronda__contagem">
                    <input
                      className="campo__entrada"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="qtd"
                      defaultValue={atual.quantidade ?? ''}
                      onBlur={(e) => contar(item, e.target.value)}
                      aria-label={`Quantas ${item.nome.toLowerCase()}`}
                    />
                    {diferenca !== null && diferenca !== 0 ? (
                      <span
                        className={`item-ronda__diferenca${
                          diferenca < 0 ? ' item-ronda__diferenca--menos' : ''
                        }`}
                      >
                        {diferenca > 0 ? `+${diferenca}` : diferenca}
                      </span>
                    ) : null}
                  </span>
                ) : null}

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
                        title={ativo ? `Desfazer ${ROTULO_STATUS[opcao]}` : ROTULO_STATUS[opcao]}
                      >
                        <span aria-hidden="true">{CODIGO_STATUS[opcao]}</span>
                        <span className="visualmente-oculto">
                          {ativo ? `Desfazer ${ROTULO_STATUS[opcao]}` : ROTULO_STATUS[opcao]}
                        </span>
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

      <p className="vazio">
        Tocar de novo no código que está marcado desfaz o lançamento.
      </p>
    </>
  );
}
