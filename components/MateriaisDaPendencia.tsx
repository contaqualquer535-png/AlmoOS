'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { marcarMaterial, removerMaterial } from '@/lib/data/mutacoes';
import type { MaterialDaPendencia } from '@/lib/types/database';

/**
 * O que levar para resolver esta pendência.
 *
 * As sugestões existem porque a lista real é curta e repetitiva — pilha,
 * lâmpada, chave de fenda. Digitar "Pilha AA" quinze vezes por semana,
 * cada vez com uma grafia, quebraria o agrupamento do roteiro, que junta
 * por descrição exata.
 */
const SUGESTOES = [
  'Pilha AA',
  'Pilha AAA',
  'Lâmpada reserva',
  'Relógio de parede',
  'Vassoura',
  'Chave de fenda',
  'Alicate',
  'Escada',
  'Marcador de quadro',
  'Apagador',
];

export function MateriaisDaPendencia({
  pendenciaId,
  materiais,
  suprimentos,
}: {
  pendenciaId: string;
  materiais: MaterialDaPendencia[];
  suprimentos: Array<{ id: string; nome: string; unidade: string }>;
}) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function acrescentar() {
    setOcupado(true);
    setErro(null);

    // Casa com suprimento pelo nome quando houver: assim o roteiro
    // consegue avisar que não há saldo antes de você sair da sala.
    const suprimento = suprimentos.find(
      (s) => s.nome.toLowerCase() === descricao.trim().toLowerCase(),
    );

    const resultado = await marcarMaterial({
      pendenciaId,
      descricao,
      quantidade: Number(quantidade.replace(',', '.')),
      unidade: suprimento?.unidade,
      suprimentoId: suprimento?.id,
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível marcar.');
      return;
    }

    setDescricao('');
    setQuantidade('1');
    iniciarTransicao(() => router.refresh());
  }

  async function remover(id: string) {
    setOcupado(true);
    const resultado = await removerMaterial(id);
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível remover.');
      return;
    }
    iniciarTransicao(() => router.refresh());
  }

  return (
    <div className="materiais">
      {materiais.length > 0 ? (
        <ul className="materiais__lista">
          {materiais.map((m) => (
            <li className="materiais__item" key={m.id}>
              <span>
                {m.quantidade} {m.unidade} · {m.descricao}
              </span>
              <button
                type="button"
                className="materiais__remover"
                disabled={ocupado}
                onClick={() => remover(m.id)}
                aria-label={`Remover ${m.descricao}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {aberto ? (
        <div className="formulario-curto" style={{ marginTop: '0.5rem' }}>
          <input
            className="campo__entrada"
            type="text"
            list={`sugestoes-${pendenciaId}`}
            placeholder="O que levar"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
          <datalist id={`sugestoes-${pendenciaId}`}>
            {[...new Set([...suprimentos.map((s) => s.nome), ...SUGESTOES])].map((nome) => (
              <option key={nome} value={nome} />
            ))}
          </datalist>

          <input
            className="campo__entrada formulario-curto__estreito"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            aria-label="Quantidade"
          />
          <button
            className="botao"
            type="button"
            disabled={ocupado || !descricao.trim()}
            onClick={acrescentar}
          >
            Marcar
          </button>
          <button
            className="botao botao--discreto"
            type="button"
            onClick={() => setAberto(false)}
          >
            Fechar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="etiqueta etiqueta--acao"
          onClick={() => setAberto(true)}
        >
          {materiais.length > 0 ? 'Levar mais' : 'O que levar'}
        </button>
      )}

      {erro ? <p className="erro">{erro}</p> : null}
    </div>
  );
}
