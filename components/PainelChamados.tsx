'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { criarChamado, moverChamado, registrarProtocolo } from '@/lib/data/mutacoes';
import { dataCurta } from '@/lib/formato';
import {
  ROTULO_PRIORIDADE,
  ROTULO_STATUS_CHAMADO,
  type Chamado,
  type PrioridadeChamado,
  type StatusChamado,
} from '@/lib/types/database';
import type { LocalBasico } from '@/lib/data/consultas';

const TRANSICOES: StatusChamado[] = [
  'rascunho',
  'enviado',
  'em_atendimento',
  'concluido',
  'cancelado',
];

const PRIORIDADES: PrioridadeChamado[] = ['baixa', 'media', 'alta'];

/** Dias corridos desde a abertura, para mostrar o que está encalhado. */
function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Link direto para o ticket no OTRS, montado a partir do protocolo.
 *
 * Não há integração: o OTRS aqui é usado pela tela dele, então o máximo
 * que dá para fazer sem credencial é poupar a busca pelo número. Sem
 * NEXT_PUBLIC_OTRS_URL configurada, o protocolo continua sendo só texto.
 */
function linkDoOtrs(protocolo: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_OTRS_URL;
  if (!base || !protocolo?.trim()) return null;
  // Interface do cliente (SERVi), não a de agente: é a que o operador
  // tem acesso. customer.pl, e não index.pl.
  return `${base.replace(/\/$/, '')}/customer.pl?Action=CustomerTicketSearch;Subaction=Search;TicketNumber=${encodeURIComponent(
    protocolo.trim(),
  )}`;
}

export function PainelChamados({
  chamados,
  locais,
  ambientes,
}: {
  chamados: Chamado[];
  locais: Record<string, string>;
  ambientes: LocalBasico[];
}) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [titulo, setTitulo] = useState('');
  const [localId, setLocalId] = useState('');
  const [prioridade, setPrioridade] = useState<PrioridadeChamado>('media');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function abrir(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);

    const resultado = await criarChamado({
      titulo,
      localId: localId || undefined,
      prioridade,
    });
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'O chamado não foi aberto.');
      return;
    }

    setTitulo('');
    setLocalId('');
    setPrioridade('media');
    iniciarTransicao(() => router.refresh());
  }

  async function mover(id: string, status: StatusChamado) {
    setOcupado(true);
    setErro(null);
    const resultado = await moverChamado(id, status);
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'O status não foi alterado.');
      return;
    }
    iniciarTransicao(() => router.refresh());
  }

  async function protocolar(id: string, valor: string) {
    const resultado = await registrarProtocolo(id, valor);
    if (!resultado.ok) setErro(resultado.mensagem ?? 'O protocolo não foi salvo.');
  }

  return (
    <>
      {erro ? <p className="erro">{erro}</p> : null}

      <form className="formulario-curto nao-imprime" onSubmit={abrir}>
        <input
          className="campo__entrada"
          type="text"
          placeholder="Novo chamado ao SEAMB"
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
        <select
          className="campo__entrada formulario-curto__estreito"
          value={prioridade}
          onChange={(e) => setPrioridade(e.target.value as PrioridadeChamado)}
          aria-label="Prioridade"
        >
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              {ROTULO_PRIORIDADE[p]}
            </option>
          ))}
        </select>
        <button className="botao" type="submit" disabled={ocupado || !titulo.trim()}>
          Abrir
        </button>
      </form>

      {chamados.length === 0 ? (
        <p className="vazio">Nenhum chamado.</p>
      ) : (
        <ul className="linhas">
          {chamados.map((chamado) => {
            const dias = diasDesde(chamado.aberto_em);
            const encalhado = dias >= 14 && chamado.fechado_em === null;

            return (
              <li className="item-trabalho" key={chamado.id}>
                <div className="item-trabalho__linha">
                  <span className={`etiqueta etiqueta--${chamado.prioridade}`}>
                    {ROTULO_PRIORIDADE[chamado.prioridade]}
                  </span>

                  <span className="item-trabalho__titulo">
                    <Link href={`/chamados/${chamado.id}`}>{chamado.titulo}</Link>
                    {chamado.local_id ? (
                      <span className="item-trabalho__local">{locais[chamado.local_id]}</span>
                    ) : null}
                  </span>

                  <span
                    className={`linha__medida${encalhado ? ' linha__medida--critico' : ''}`}
                    title={`Aberto em ${dataCurta(chamado.aberto_em.slice(0, 10))}`}
                  >
                    {dias} d
                  </span>
                </div>

                <div className="item-trabalho__linha">
                  <div className="item-trabalho__opcoes" role="group" aria-label={chamado.titulo}>
                    {TRANSICOES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`etiqueta etiqueta--acao${
                          chamado.status === status ? ' etiqueta--acao-ativa' : ''
                        }`}
                        aria-pressed={chamado.status === status}
                        disabled={ocupado}
                        onClick={() => mover(chamado.id, status)}
                      >
                        {ROTULO_STATUS_CHAMADO[status]}
                      </button>
                    ))}
                  </div>

                  <input
                    className="campo__entrada item-trabalho__protocolo"
                    type="text"
                    placeholder="Nº do chamado no OTRS"
                    defaultValue={chamado.protocolo_externo ?? ''}
                    onBlur={(e) => protocolar(chamado.id, e.target.value)}
                  />

                  {linkDoOtrs(chamado.protocolo_externo) ? (
                    <a
                      className="item-trabalho__historico"
                      href={linkDoOtrs(chamado.protocolo_externo)!}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir no OTRS
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
