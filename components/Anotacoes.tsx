'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  anotar,
  apagarAnotacao,
  arquivarAnotacao,
  editarAnotacao,
  fixarAnotacao,
} from '@/lib/data/mutacoes';
import { dataHoraCurta } from '@/lib/formato';
import type { Anotacao } from '@/lib/types/database';

/**
 * Bloco de rascunho.
 *
 * Tudo no sistema exige forma: verificação precisa de item e código,
 * tarefa precisa de título, chamado precisa de destino. Mas metade do
 * que se anota no dia ainda não tem forma — "o zelador falou que a
 * fechadura da K-205 está dura". Sem lugar para isso, a frase vai para
 * o papel e some.
 *
 * Por isso aqui o único campo obrigatório é o texto. Enter grava, e a
 * caixa continua aberta para a próxima.
 */
export function Anotacoes({
  anotacoes,
  locais,
  compacto = false,
}: {
  anotacoes: Anotacao[];
  locais: Record<string, string>;
  compacto?: boolean;
}) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function recarregar() {
    iniciarTransicao(() => router.refresh());
  }

  async function gravar() {
    if (!texto.trim()) return;

    setOcupado(true);
    setErro(null);

    const resultado = await anotar({ texto });
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'A anotação não foi gravada.');
      return;
    }

    setTexto('');
    recarregar();
  }

  async function salvarEdicao(id: string) {
    setOcupado(true);
    const resultado = await editarAnotacao(id, rascunho);
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível editar.');
      return;
    }

    setEditando(null);
    recarregar();
  }

  async function executar(acao: () => Promise<{ ok: boolean; mensagem?: string }>) {
    setOcupado(true);
    const resultado = await acao();
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível concluir.');
      return;
    }
    recarregar();
  }

  return (
    <>
      {erro ? <p className="erro">{erro}</p> : null}

      <div className="nota-nova nao-imprime">
        <textarea
          className="campo__entrada nota-nova__campo"
          placeholder="Anote qualquer coisa. Enter grava, Shift+Enter quebra linha."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void gravar();
            }
          }}
          rows={compacto ? 2 : 3}
        />
        <button
          className="botao"
          type="button"
          disabled={ocupado || !texto.trim()}
          onClick={gravar}
        >
          Anotar
        </button>
      </div>

      {anotacoes.length === 0 ? (
        <p className="vazio">Nenhuma anotação.</p>
      ) : (
        <ul className="notas">
          {anotacoes.map((nota) => (
            <li className={`nota${nota.fixada ? ' nota--fixada' : ''}`} key={nota.id}>
              {editando === nota.id ? (
                <>
                  <textarea
                    className="campo__entrada"
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    rows={3}
                  />
                  <div className="nota__acoes">
                    <button
                      className="etiqueta etiqueta--acao"
                      type="button"
                      disabled={ocupado}
                      onClick={() => salvarEdicao(nota.id)}
                    >
                      Salvar
                    </button>
                    <button
                      className="etiqueta etiqueta--acao"
                      type="button"
                      onClick={() => setEditando(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="nota__texto">{nota.texto}</p>
                  <p className="nota__rodape">
                    <span>{dataHoraCurta(nota.criado_em)}</span>
                    {nota.local_id ? <span>· {locais[nota.local_id]}</span> : null}
                  </p>

                  <div className="nota__acoes nao-imprime">
                    <button
                      className={`etiqueta etiqueta--acao${
                        nota.fixada ? ' etiqueta--acao-ativa' : ''
                      }`}
                      type="button"
                      disabled={ocupado}
                      onClick={() => executar(() => fixarAnotacao(nota.id, !nota.fixada))}
                    >
                      {nota.fixada ? 'Desafixar' : 'Fixar'}
                    </button>
                    <button
                      className="etiqueta etiqueta--acao"
                      type="button"
                      onClick={() => {
                        setEditando(nota.id);
                        setRascunho(nota.texto);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="etiqueta etiqueta--acao"
                      type="button"
                      disabled={ocupado}
                      onClick={() => executar(() => arquivarAnotacao(nota.id))}
                    >
                      Arquivar
                    </button>
                    <button
                      className="etiqueta etiqueta--acao"
                      type="button"
                      disabled={ocupado}
                      onClick={() => {
                        if (window.confirm('Apagar esta anotação de vez?')) {
                          void executar(() => apagarAnotacao(nota.id));
                        }
                      }}
                    >
                      Apagar
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
