'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { anotarProgresso, criarTarefa, moverTarefa } from '@/lib/data/mutacoes';
import { dataCurta } from '@/lib/formato';
import {
  ROTULO_STATUS_TAREFA,
  type StatusTarefa,
  type Tarefa,
} from '@/lib/types/database';
import type { LocalBasico } from '@/lib/data/consultas';

const TRANSICOES: StatusTarefa[] = ['pendente', 'em_andamento', 'concluida', 'cancelada'];

export function PainelTarefas({
  tarefas,
  locais,
  ambientes,
}: {
  tarefas: Tarefa[];
  locais: Record<string, string>;
  ambientes: LocalBasico[];
}) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [titulo, setTitulo] = useState('');
  const [localId, setLocalId] = useState('');
  const [prazo, setPrazo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function adicionar(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);

    const resultado = await criarTarefa({ titulo, localId: localId || undefined, prazo });
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'A tarefa não foi criada.');
      return;
    }

    setTitulo('');
    setLocalId('');
    setPrazo('');
    iniciarTransicao(() => router.refresh());
  }

  async function mover(id: string, status: StatusTarefa) {
    setOcupado(true);
    setErro(null);
    const resultado = await moverTarefa(id, status);
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'O status não foi alterado.');
      return;
    }
    iniciarTransicao(() => router.refresh());
  }

  async function anotar(id: string, texto: string) {
    const resultado = await anotarProgresso(id, texto);
    if (!resultado.ok) setErro(resultado.mensagem ?? 'A anotação não foi salva.');
  }

  return (
    <>
      {erro ? <p className="erro">{erro}</p> : null}

      <form className="formulario-curto nao-imprime" onSubmit={adicionar}>
        <input
          className="campo__entrada"
          type="text"
          placeholder="Nova tarefa"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          required
        />
        <select
          className="campo__entrada formulario-curto__estreito"
          value={localId}
          onChange={(e) => setLocalId(e.target.value)}
          aria-label="Ambiente"
        >
          <option value="">Sem local</option>
          {ambientes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.codigo}
            </option>
          ))}
        </select>
        <input
          className="campo__entrada formulario-curto__estreito"
          type="date"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
          aria-label="Prazo"
        />
        <button className="botao" type="submit" disabled={ocupado || !titulo.trim()}>
          Adicionar
        </button>
      </form>

      {tarefas.length === 0 ? (
        <p className="vazio">Nenhuma tarefa.</p>
      ) : (
        <ul className="linhas">
          {tarefas.map((tarefa) => {
            const atrasada =
              tarefa.prazo !== null &&
              tarefa.prazo < new Date().toISOString().slice(0, 10) &&
              tarefa.status !== 'concluida';

            return (
              <li className="item-trabalho" key={tarefa.id}>
                <div className="item-trabalho__linha">
                  <span className="item-trabalho__titulo">
                    {tarefa.titulo}
                    {tarefa.local_id ? (
                      <span className="item-trabalho__local">{locais[tarefa.local_id]}</span>
                    ) : null}
                  </span>

                  {tarefa.prazo ? (
                    <span
                      className={`linha__medida${atrasada ? ' linha__medida--critico' : ''}`}
                    >
                      {dataCurta(tarefa.prazo)}
                    </span>
                  ) : null}

                  <div className="item-trabalho__opcoes" role="group" aria-label={tarefa.titulo}>
                    {TRANSICOES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`etiqueta etiqueta--acao${
                          tarefa.status === status ? ' etiqueta--acao-ativa' : ''
                        }`}
                        aria-pressed={tarefa.status === status}
                        disabled={ocupado}
                        onClick={() => mover(tarefa.id, status)}
                      >
                        {ROTULO_STATUS_TAREFA[status]}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  className="campo__entrada item-trabalho__nota"
                  type="text"
                  placeholder="Onde parei…"
                  defaultValue={tarefa.observacao ?? ''}
                  onBlur={(e) => anotar(tarefa.id, e.target.value)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
