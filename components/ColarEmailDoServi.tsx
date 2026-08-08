'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { registrarEmailDoServi, type ResultadoDoEmail } from '@/lib/data/importacao';

/**
 * Caixa de colagem para o e-mail do SERVi.
 *
 * Recebe o e-mail inteiro, com cabeçalhos ou sem: o que importa é o
 * número entre colchetes no assunto. Se o chamado ainda não existir
 * aqui, ele é criado — o operador abre chamado pela tela do SERVi, e
 * exigir cadastro prévio faria a ingestão só funcionar para os que ele
 * já lembrou de registrar duas vezes.
 */
export function ColarEmailDoServi() {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<ResultadoDoEmail | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function registrar() {
    setOcupado(true);
    setResultado(null);

    const saida = await registrarEmailDoServi(texto);
    setResultado(saida);
    setOcupado(false);

    if (saida.ok) {
      setTexto('');
      iniciarTransicao(() => router.refresh());
    }
  }

  function descrever(saida: ResultadoDoEmail): string {
    if (!saida.ok) return saida.mensagem ?? 'Não foi possível registrar.';
    if (saida.repetida) return `Chamado ${saida.protocolo}: esta mensagem já estava registrada.`;

    const partes = [`Chamado ${saida.protocolo} atualizado`];
    if (saida.criouChamado) partes.push('e cadastrado aqui pela primeira vez');
    if (saida.fechou) partes.push('e marcado como concluído');
    return `${partes.join(' ')}.`;
  }

  return (
    <details className="colar-email nao-imprime">
      <summary className="colar-email__resumo">Colar e-mail do SERVi</summary>

      <p className="vazio">
        Cole a mensagem inteira, incluindo o assunto. O número entre colchetes é o
        que liga a mensagem ao chamado; se ele ainda não existir aqui, é criado.
      </p>

      <textarea
        className="campo__entrada importador__area"
        placeholder={
          'Subject: [Chamado#001538977] Abertura de chamado #001538977: Serviços de Lavanderia\n' +
          'From: servi@ucs.br\n\n' +
          'Caro usuário: Victor Andrin Neves Lima, seu chamado foi recebido…'
        }
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setResultado(null);
        }}
        spellCheck={false}
      />

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          className="botao"
          type="button"
          disabled={ocupado || !texto.trim()}
          onClick={registrar}
        >
          {ocupado ? 'Registrando…' : 'Registrar mensagem'}
        </button>
      </div>

      {resultado ? (
        <p className={resultado.ok ? 'vazio' : 'erro'}>{descrever(resultado)}</p>
      ) : null}
    </details>
  );
}
