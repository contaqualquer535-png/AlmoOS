'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  ajustarSaldo,
  desativarSuprimento,
  lancarMovimentoDeSuprimento,
  salvarSuprimento,
} from '@/lib/data/mutacoes';
import { dataCurta, quantidade as formatar, plural } from '@/lib/formato';
import type { CategoriaSuprimento, SuprimentoStatus } from '@/lib/types/database';

const CATEGORIAS: CategoriaSuprimento[] = ['copa', 'manutencao', 'limpeza'];

const ROTULO_CATEGORIA: Record<CategoriaSuprimento, string> = {
  copa: 'Copa',
  manutencao: 'Manutenção',
  limpeza: 'Limpeza',
};

const VAZIO = {
  nome: '',
  categoria: 'copa' as CategoriaSuprimento,
  unidade: 'un',
  pontoReposicao: '0',
};

/**
 * Estoque completo: lançar, cadastrar, editar parâmetro e corrigir saldo.
 *
 * `quantidade_atual` não é editável em lugar nenhum desta tela, e é
 * deliberado — o saldo é derivado dos movimentos por trigger (decisão 06
 * do ADR). Corrigir é contar e lançar a diferença como ajuste, o que
 * deixa rastro. Editar o número direto apagaria a divergência sem
 * explicá-la.
 */
export function PainelSuprimentos({ suprimentos }: { suprimentos: SuprimentoStatus[] }) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [lancando, setLancando] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [contando, setContando] = useState<string | null>(null);
  const [contagem, setContagem] = useState('');
  const [rascunho, setRascunho] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function recarregar() {
    iniciarTransicao(() => router.refresh());
  }

  async function lancar(s: SuprimentoStatus, tipo: 'consumo' | 'reposicao') {
    const valor = Number((lancando[s.id] ?? '').replace(',', '.'));
    setOcupado(true);
    setErro(null);

    const resultado = await lancarMovimentoDeSuprimento({
      suprimentoId: s.id,
      tipo,
      quantidade: valor,
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'O lançamento não foi gravado.');
      return;
    }

    setLancando((atual) => ({ ...atual, [s.id]: '' }));
    recarregar();
  }

  function abrirEdicao(s: SuprimentoStatus) {
    setEditando(s.id);
    setCriando(false);
    setContando(null);
    setErro(null);
    setRascunho({
      nome: s.nome,
      categoria: s.categoria,
      unidade: s.unidade,
      pontoReposicao: String(s.ponto_reposicao),
    });
  }

  async function gravar(id?: string) {
    setOcupado(true);
    setErro(null);

    const resultado = await salvarSuprimento({
      id,
      nome: rascunho.nome,
      categoria: rascunho.categoria,
      unidade: rascunho.unidade,
      pontoReposicao: Number(rascunho.pontoReposicao.replace(',', '.')),
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível salvar.');
      return;
    }

    setEditando(null);
    setCriando(false);
    setRascunho(VAZIO);
    recarregar();
  }

  async function desativar(s: SuprimentoStatus) {
    if (!window.confirm(`Tirar "${s.nome}" da lista? O histórico é preservado.`)) return;

    setOcupado(true);
    const resultado = await desativarSuprimento(s.id);
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível desativar.');
      return;
    }
    recarregar();
  }

  async function corrigir(s: SuprimentoStatus) {
    setOcupado(true);
    setErro(null);

    const resultado = await ajustarSaldo({
      suprimentoId: s.id,
      saldoContado: Number(contagem.replace(',', '.')),
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível ajustar.');
      return;
    }

    setContando(null);
    setContagem('');
    recarregar();
  }

  const formulario = (
    <div className="formulario-curto" style={{ marginTop: '0.75rem' }}>
      <input
        className="campo__entrada"
        type="text"
        placeholder="Nome do suprimento"
        value={rascunho.nome}
        onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
      />
      <select
        className="campo__entrada formulario-curto__estreito"
        value={rascunho.categoria}
        onChange={(e) =>
          setRascunho({ ...rascunho, categoria: e.target.value as CategoriaSuprimento })
        }
        aria-label="Categoria"
      >
        {CATEGORIAS.map((c) => (
          <option key={c} value={c}>
            {ROTULO_CATEGORIA[c]}
          </option>
        ))}
      </select>
      <input
        className="campo__entrada formulario-curto__estreito"
        type="text"
        placeholder="un, kg, pacote"
        value={rascunho.unidade}
        onChange={(e) => setRascunho({ ...rascunho, unidade: e.target.value })}
        aria-label="Unidade"
      />
      <label className="planta__medida">
        <span className="campo__rotulo">Repor em</span>
        <input
          className="campo__entrada"
          inputMode="decimal"
          value={rascunho.pontoReposicao}
          onChange={(e) => setRascunho({ ...rascunho, pontoReposicao: e.target.value })}
        />
      </label>
    </div>
  );

  const categorias = [...new Set(suprimentos.map((s) => s.categoria))];

  return (
    <>
      {erro ? <p className="erro">{erro}</p> : null}

      <div className="nao-imprime" style={{ marginBottom: '1.25rem' }}>
        {criando ? (
          <>
            {formulario}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                className="botao"
                type="button"
                disabled={ocupado || !rascunho.nome.trim()}
                onClick={() => gravar()}
              >
                Cadastrar
              </button>
              <button
                className="botao botao--discreto"
                type="button"
                onClick={() => setCriando(false)}
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <button
            className="botao"
            type="button"
            onClick={() => {
              setRascunho(VAZIO);
              setCriando(true);
              setEditando(null);
            }}
          >
            Novo suprimento
          </button>
        )}
      </div>

      {categorias.map((categoria) => (
        <section className="secao" key={categoria}>
          <div className="secao__cabeca">
            <h2 className="secao__titulo">
              {ROTULO_CATEGORIA[categoria as CategoriaSuprimento] ?? categoria}
            </h2>
            <span className="secao__contagem">
              {suprimentos.filter((s) => s.categoria === categoria && s.abaixo_do_ponto).length}{' '}
              para repor
            </span>
          </div>

          <ul className="linhas">
            {suprimentos
              .filter((s) => s.categoria === categoria)
              .map((s) => (
                <li className="item-trabalho" key={s.id}>
                  <div className="item-trabalho__linha">
                    <span className="item-trabalho__titulo">
                      {s.nome}
                      <span className="linha__nota">
                        {formatar(s.quantidade_atual, s.unidade)} em estoque · repor em{' '}
                        {s.ponto_reposicao}
                        {s.consumo_medio_dia > 0
                          ? ` · gasta ${formatar(s.consumo_medio_dia, s.unidade)} por dia`
                          : ''}
                        {s.previsao_esgotamento
                          ? ` · acaba por volta de ${dataCurta(s.previsao_esgotamento)}`
                          : ''}
                      </span>
                    </span>

                    <div className="lancamento">
                      <input
                        className="campo__entrada lancamento__quantidade"
                        inputMode="decimal"
                        placeholder={s.unidade}
                        value={lancando[s.id] ?? ''}
                        onChange={(e) =>
                          setLancando((atual) => ({ ...atual, [s.id]: e.target.value }))
                        }
                        aria-label={`Quantidade de ${s.nome}`}
                      />
                      <button
                        className="botao botao--discreto"
                        type="button"
                        disabled={ocupado || !lancando[s.id]}
                        onClick={() => lancar(s, 'consumo')}
                      >
                        Saiu
                      </button>
                      <button
                        className="botao botao--discreto"
                        type="button"
                        disabled={ocupado || !lancando[s.id]}
                        onClick={() => lancar(s, 'reposicao')}
                      >
                        Entrou
                      </button>
                    </div>

                    <span
                      className={`linha__medida${
                        s.abaixo_do_ponto ? ' linha__medida--alerta' : ''
                      }`}
                    >
                      {s.abaixo_do_ponto
                        ? 'repor'
                        : s.dias_restantes !== null
                          ? plural(s.dias_restantes, 'dia', 'dias')
                          : 'ok'}
                    </span>
                  </div>

                  <div className="item-trabalho__linha nao-imprime">
                    <button
                      className="etiqueta etiqueta--acao"
                      type="button"
                      onClick={() => (editando === s.id ? setEditando(null) : abrirEdicao(s))}
                    >
                      Editar
                    </button>
                    <button
                      className="etiqueta etiqueta--acao"
                      type="button"
                      onClick={() => {
                        setContando(contando === s.id ? null : s.id);
                        setContagem(String(s.quantidade_atual));
                      }}
                    >
                      Contei
                    </button>
                    <button
                      className="etiqueta etiqueta--acao"
                      type="button"
                      disabled={ocupado}
                      onClick={() => desativar(s)}
                    >
                      Remover
                    </button>
                  </div>

                  {editando === s.id ? (
                    <>
                      {formulario}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                          className="botao"
                          type="button"
                          disabled={ocupado}
                          onClick={() => gravar(s.id)}
                        >
                          Salvar
                        </button>
                        <button
                          className="botao botao--discreto"
                          type="button"
                          onClick={() => setEditando(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : null}

                  {contando === s.id ? (
                    <div className="formulario-curto" style={{ marginTop: '0.75rem' }}>
                      <label className="planta__medida">
                        <span className="campo__rotulo">Contei</span>
                        <input
                          className="campo__entrada"
                          inputMode="decimal"
                          value={contagem}
                          onChange={(e) => setContagem(e.target.value)}
                        />
                      </label>
                      <button
                        className="botao"
                        type="button"
                        disabled={ocupado}
                        onClick={() => corrigir(s)}
                      >
                        Corrigir saldo
                      </button>
                      <span className="linha__nota">
                        A diferença entra como ajuste no histórico, com data.
                      </span>
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
