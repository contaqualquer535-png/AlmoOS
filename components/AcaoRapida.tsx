'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  criarChamado,
  criarTarefa,
  lancarMovimentoDeSuprimento,
  retirarRecurso,
} from '@/lib/data/mutacoes';
import type { OpcoesDeAcaoRapida } from '@/lib/data/consultas';
import type { PrioridadeChamado } from '@/lib/types/database';

type Aba = 'tarefa' | 'chamado' | 'consumo' | 'retirada';

const ABAS: Array<{ chave: Aba; rotulo: string }> = [
  { chave: 'tarefa', rotulo: 'Tarefa' },
  { chave: 'chamado', rotulo: 'Chamado' },
  { chave: 'consumo', rotulo: 'Consumo' },
  { chave: 'retirada', rotulo: 'Retirada' },
];

/**
 * Lançador presente em todas as telas.
 *
 * A regra que ele resolve: anotar não pode custar navegação. Se para
 * registrar "levaram uma extensão" o operador precisa achar a tela
 * certa, ele não registra — anota num papel e o sistema fica com um
 * buraco. Ctrl+K abre de qualquer lugar.
 */
export function AcaoRapida({ opcoes }: { opcoes: OpcoesDeAcaoRapida }) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<Aba>('tarefa');
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const primeiroCampo = useRef<HTMLInputElement | HTMLSelectElement>(null);

  const [titulo, setTitulo] = useState('');
  const [localId, setLocalId] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState<PrioridadeChamado>('media');
  const [itemId, setItemId] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [responsavel, setResponsavel] = useState('');

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      // `key` pode vir indefinido em eventos sintéticos e durante
      // composição de acento. Sem esta guarda, o toLowerCase lança a
      // cada tecla e o console vira um muro de erro.
      const tecla = typeof evento.key === 'string' ? evento.key : '';

      if ((evento.ctrlKey || evento.metaKey) && tecla.toLowerCase() === 'k') {
        evento.preventDefault();
        setAberto((atual) => !atual);
        return;
      }

      if (tecla === 'Escape') setAberto(false);
    }

    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  useEffect(() => {
    if (aberto) primeiroCampo.current?.focus();
  }, [aberto, aba]);

  function limpar() {
    setTitulo('');
    setPrazo('');
    setQuantidade('1');
    setResponsavel('');
    setErro(null);
  }

  async function enviar() {
    setOcupado(true);
    setErro(null);
    setFeito(null);

    let resultado: { ok: boolean; mensagem?: string };
    let confirmacao = '';

    if (aba === 'tarefa') {
      resultado = await criarTarefa({
        titulo,
        localId: localId || undefined,
        prazo: prazo || undefined,
      });
      confirmacao = 'Tarefa criada.';
    } else if (aba === 'chamado') {
      resultado = await criarChamado({
        titulo,
        localId: localId || undefined,
        prioridade,
      });
      confirmacao = 'Chamado aberto como rascunho.';
    } else if (aba === 'consumo') {
      resultado = await lancarMovimentoDeSuprimento({
        suprimentoId: itemId,
        tipo: 'consumo',
        quantidade: Number(quantidade.replace(',', '.')),
      });
      confirmacao = 'Consumo lançado.';
    } else {
      resultado = await retirarRecurso({
        recursoId: itemId,
        quantidade: Number(quantidade),
        responsavel: responsavel || undefined,
        localId: localId || undefined,
      });
      confirmacao = 'Retirada registrada.';
    }

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível registrar.');
      return;
    }

    limpar();
    setFeito(confirmacao);
    iniciarTransicao(() => router.refresh());
    // Some sozinho: confirmação que exige clique para fechar vira mais
    // um clique no caminho do próximo registro.
    setTimeout(() => setFeito(null), 2500);
  }

  const podeEnviar =
    aba === 'tarefa' || aba === 'chamado'
      ? titulo.trim().length > 0
      : itemId !== '' && Number(quantidade) > 0;

  if (!aberto) {
    return (
      <button
        type="button"
        className="acao-rapida__gatilho nao-imprime"
        onClick={() => setAberto(true)}
        title="Registrar alguma coisa (Ctrl+K)"
      >
        <span aria-hidden="true">+</span>
        <span className="visualmente-oculto">Registrar alguma coisa</span>
      </button>
    );
  }

  return (
    <div className="acao-rapida nao-imprime" role="dialog" aria-label="Registro rápido">
      <div className="acao-rapida__cabeca">
        <div className="acao-rapida__abas" role="group" aria-label="O que registrar">
          {ABAS.map((item) => (
            <button
              key={item.chave}
              type="button"
              className={`etiqueta etiqueta--acao${
                aba === item.chave ? ' etiqueta--acao-ativa' : ''
              }`}
              aria-pressed={aba === item.chave}
              onClick={() => {
                setAba(item.chave);
                setItemId('');
                setErro(null);
              }}
            >
              {item.rotulo}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="acao-rapida__fechar"
          onClick={() => setAberto(false)}
          aria-label="Fechar"
        >
          ×
        </button>
      </div>

      <form
        className="acao-rapida__corpo"
        onSubmit={(e) => {
          e.preventDefault();
          if (podeEnviar) void enviar();
        }}
      >
        {aba === 'tarefa' || aba === 'chamado' ? (
          <>
            <input
              ref={primeiroCampo as React.RefObject<HTMLInputElement>}
              className="campo__entrada"
              type="text"
              placeholder={aba === 'tarefa' ? 'O que precisa ser feito' : 'O que abrir no SEAMB'}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
            <div className="acao-rapida__linha">
              <select
                className="campo__entrada"
                value={localId}
                onChange={(e) => setLocalId(e.target.value)}
                aria-label="Local"
              >
                <option value="">Sem local</option>
                {opcoes.ambientes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo}
                  </option>
                ))}
              </select>

              {aba === 'tarefa' ? (
                <input
                  className="campo__entrada"
                  type="date"
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                  aria-label="Prazo"
                />
              ) : (
                <select
                  className="campo__entrada"
                  value={prioridade}
                  onChange={(e) => setPrioridade(e.target.value as PrioridadeChamado)}
                  aria-label="Prioridade"
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </select>
              )}
            </div>
          </>
        ) : (
          <>
            <select
              ref={primeiroCampo as React.RefObject<HTMLSelectElement>}
              className="campo__entrada"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              aria-label={aba === 'consumo' ? 'Suprimento' : 'Recurso'}
            >
              <option value="">
                {aba === 'consumo' ? 'Qual suprimento' : 'Qual recurso'}
              </option>
              {(aba === 'consumo' ? opcoes.suprimentos : opcoes.recursos).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                  {'disponivel' in item ? ` (${item.disponivel} livres)` : ''}
                </option>
              ))}
            </select>

            <div className="acao-rapida__linha">
              <input
                className="campo__entrada"
                inputMode="decimal"
                placeholder="Quantas"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                aria-label="Quantidade"
              />

              {aba === 'retirada' ? (
                <>
                  <input
                    className="campo__entrada"
                    type="text"
                    placeholder="Quem levou"
                    value={responsavel}
                    onChange={(e) => setResponsavel(e.target.value)}
                  />
                  <select
                    className="campo__entrada"
                    value={localId}
                    onChange={(e) => setLocalId(e.target.value)}
                    aria-label="Para onde"
                  >
                    <option value="">Para onde</option>
                    {opcoes.ambientes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </div>
          </>
        )}

        {erro ? <p className="erro">{erro}</p> : null}
        {feito ? <p className="acao-rapida__feito">{feito}</p> : null}

        <button className="botao" type="submit" disabled={ocupado || !podeEnviar}>
          {ocupado ? 'Registrando…' : 'Registrar'}
        </button>
      </form>
    </div>
  );
}
