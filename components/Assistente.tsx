'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { TextoDoModelo } from '@/components/TextoDoModelo';

interface Parte {
  text?: string;
  functionCall?: { name: string; args: Record<string, never> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface Turno {
  role: 'user' | 'model';
  parts: Parte[];
}

interface Pendente {
  nome: string;
  args: Record<string, never>;
  resumo: string;
}

const SUGESTOES = [
  'O que está encalhado há mais tempo?',
  'Quais salas ainda faltam na ronda de hoje?',
  'Quando o café vai acabar?',
  'Abre um chamado de lâmpada queimada na C-212',
];

export function Assistente() {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [historico, setHistorico] = useState<Turno[]>([]);
  const [pergunta, setPergunta] = useState('');
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  async function chamar(corpo: {
    historico: Turno[];
    confirmacao?: { nome: string; args: Record<string, never> };
  }) {
    setOcupado(true);
    setErro(null);
    setPendente(null);

    try {
      const resposta = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setErro(dados.erro ?? 'O assistente não respondeu.');
        return;
      }

      setHistorico(dados.historico);
      if (dados.pendente) setPendente(dados.pendente);

      // A escrita já aconteceu no servidor; as outras telas precisam
      // reler. revalidatePath no Server Action não alcança um fetch.
      if (corpo.confirmacao) iniciarTransicao(() => router.refresh());
    } catch {
      setErro('Não foi possível falar com o servidor.');
    } finally {
      setOcupado(false);
      requestAnimationFrame(() => fim.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }

  async function enviar(texto: string) {
    const limpo = texto.trim();
    if (!limpo || ocupado) return;

    const novo: Turno[] = [...historico, { role: 'user', parts: [{ text: limpo }] }];
    setHistorico(novo);
    setPergunta('');
    await chamar({ historico: novo });
  }

  /**
   * Só mostra o que é conversa. Chamada de ferramenta e o JSON que ela
   * devolve ficam no histórico porque o modelo precisa deles, mas na tela
   * seriam ruído — o operador quer a resposta, não o encanamento.
   */
  const visiveis = historico
    .map((turno, i) => ({
      i,
      role: turno.role,
      texto: turno.parts
        .map((p) => p.text ?? '')
        .join('')
        .trim(),
      consultou: turno.parts.some((p) => p.functionCall),
    }))
    .filter((t) => t.texto || t.consultou);

  return (
    <div className="chat">
      <div className="chat__conversa">
        {visiveis.length === 0 ? (
          <div className="chat__inicio">
            <p className="vazio">
              Pergunte sobre o estado do CETEC, ou peça para criar uma tarefa ou
              chamado. Antes de gravar qualquer coisa, eu mostro o que vai ser feito
              e espero você confirmar.
            </p>
            <div className="chat__sugestoes">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="botao botao--discreto"
                  disabled={ocupado}
                  onClick={() => enviar(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          visiveis.map((turno) => (
            <div
              key={turno.i}
              className={`fala fala--${turno.role === 'user' ? 'operador' : 'assistente'}`}
            >
              {turno.texto ? (
                <div className="fala__texto">
                  <TextoDoModelo texto={turno.texto} />
                </div>
              ) : (
                <p className="fala__texto fala__texto--discreto">Consultando os dados…</p>
              )}
            </div>
          ))
        )}

        {ocupado ? <p className="vazio">Pensando…</p> : null}
        {erro ? <p className="erro">{erro}</p> : null}

        {pendente ? (
          <div className="confirmacao">
            <p className="confirmacao__titulo">Confirmar antes de gravar</p>
            <p className="confirmacao__acao">{pendente.resumo}</p>
            <div className="confirmacao__botoes">
              <button
                type="button"
                className="botao"
                disabled={ocupado}
                onClick={() =>
                  chamar({
                    historico,
                    confirmacao: { nome: pendente.nome, args: pendente.args },
                  })
                }
              >
                Confirmar
              </button>
              <button
                type="button"
                className="botao botao--discreto"
                disabled={ocupado}
                onClick={() => setPendente(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        <div ref={fim} />
      </div>

      <form
        className="chat__entrada nao-imprime"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(pergunta);
        }}
      >
        <input
          className="campo__entrada"
          type="text"
          placeholder="Pergunte ou peça alguma coisa"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          disabled={ocupado}
        />
        <button className="botao" type="submit" disabled={ocupado || !pergunta.trim()}>
          Enviar
        </button>
        {historico.length > 0 ? (
          <button
            type="button"
            className="botao botao--discreto"
            disabled={ocupado}
            onClick={() => {
              setHistorico([]);
              setPendente(null);
              setErro(null);
            }}
          >
            Limpar
          </button>
        ) : null}
      </form>
    </div>
  );
}
