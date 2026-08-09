import { Fragment } from 'react';

/**
 * Renderiza o markdown simples que o modelo produz.
 *
 * Escrito à mão em vez de trazer react-markdown por dois motivos. O
 * primeiro é peso: são três construções — negrito, lista e parágrafo —
 * e a biblioteca traria um parser completo de CommonMark para isso.
 *
 * O segundo é segurança, e é o que decide: nada aqui interpreta HTML.
 * O texto vem de um modelo que leu conteúdo de e-mail externo, e um
 * renderizador que aceite HTML transformaria essa cadeia num caminho de
 * injeção. Aqui o texto vira nós de texto do React, sempre escapados.
 */

/** Quebra **negrito** em pedaços, sem tocar em mais nada. */
function comNegrito(linha: string): React.ReactNode[] {
  return linha.split(/(\*\*[^*]+\*\*)/g).map((pedaco, i) => {
    if (pedaco.startsWith('**') && pedaco.endsWith('**') && pedaco.length > 4) {
      return <strong key={i}>{pedaco.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{pedaco}</Fragment>;
  });
}

export function TextoDoModelo({ texto }: { texto: string }) {
  const linhas = texto.split('\n');
  const blocos: React.ReactNode[] = [];

  let lista: string[] = [];
  let paragrafo: string[] = [];

  function fecharLista() {
    if (lista.length === 0) return;
    blocos.push(
      <ul className="fala__lista" key={`lista-${blocos.length}`}>
        {lista.map((item, i) => (
          <li key={i}>{comNegrito(item)}</li>
        ))}
      </ul>,
    );
    lista = [];
  }

  function fecharParagrafo() {
    if (paragrafo.length === 0) return;
    blocos.push(
      <p className="fala__paragrafo" key={`p-${blocos.length}`}>
        {comNegrito(paragrafo.join(' '))}
      </p>,
    );
    paragrafo = [];
  }

  for (const linha of linhas) {
    const limpa = linha.trim();

    // Marcador de lista em qualquer das três formas que o modelo usa.
    const item = limpa.match(/^[-*•]\s+(.*)$/) ?? limpa.match(/^\d+[.)]\s+(.*)$/);

    if (item?.[1]) {
      fecharParagrafo();
      lista.push(item[1]);
      continue;
    }

    if (limpa === '') {
      fecharLista();
      fecharParagrafo();
      continue;
    }

    fecharLista();
    paragrafo.push(limpa);
  }

  fecharLista();
  fecharParagrafo();

  return <>{blocos}</>;
}
