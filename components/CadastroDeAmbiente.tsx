'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { desativarLocal, salvarLocal } from '@/lib/data/mutacoes';
import type { TipoLocal } from '@/lib/types/database';

const TIPOS: Array<{ valor: TipoLocal; rotulo: string }> = [
  { valor: 'sala', rotulo: 'Sala de aula' },
  { valor: 'apoio', rotulo: 'Apoio' },
  { valor: 'banheiro', rotulo: 'Banheiro' },
  { valor: 'teatro', rotulo: 'Teatro' },
  { valor: 'almoxarifado', rotulo: 'Almoxarifado' },
  { valor: 'externo', rotulo: 'Externo' },
];

export interface AmbienteEditavel {
  id: string;
  codigo: string;
  nome: string | null;
  bloco: string | null;
  tipo: TipoLocal;
  ronda_padrao: boolean;
  ordem_visita: number | null;
}

const VAZIO = {
  codigo: '',
  nome: '',
  bloco: '',
  tipo: 'sala' as TipoLocal,
  rondaPadrao: true,
  ordemVisita: '',
};

/**
 * Cadastro de ambiente.
 *
 * "Remover" desativa, não apaga. `locais` é referenciada por
 * verificações, pendências, chamados, inventário e alocações, quase
 * sempre com `on delete restrict` — apagar uma sala com histórico seria
 * recusado pelo banco, e se não fosse levaria o histórico junto.
 *
 * `ronda_padrao` é a decisão que mais importa no formulário: ela define
 * se o ambiente entra no checklist de 8 itens de segunda, quarta e
 * sexta. Um armazém provavelmente não deve entrar.
 */
export function CadastroDeAmbiente({
  ambientes,
  blocos,
}: {
  ambientes: AmbienteEditavel[];
  blocos: string[];
}) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function abrirNovo() {
    setRascunho(VAZIO);
    setEditando(null);
    setAberto(true);
    setErro(null);
  }

  function abrirEdicao(a: AmbienteEditavel) {
    setRascunho({
      codigo: a.codigo,
      nome: a.nome ?? '',
      bloco: a.bloco ?? '',
      tipo: a.tipo,
      rondaPadrao: a.ronda_padrao,
      ordemVisita: a.ordem_visita === null ? '' : String(a.ordem_visita),
    });
    setEditando(a.id);
    setAberto(true);
    setErro(null);
  }

  async function gravar() {
    setOcupado(true);
    setErro(null);

    const resultado = await salvarLocal({
      id: editando ?? undefined,
      codigo: rascunho.codigo,
      nome: rascunho.nome || undefined,
      bloco: rascunho.bloco || undefined,
      tipo: rascunho.tipo,
      rondaPadrao: rascunho.rondaPadrao,
      ordemVisita: rascunho.ordemVisita === '' ? null : Number(rascunho.ordemVisita),
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível salvar.');
      return;
    }

    setAberto(false);
    setEditando(null);
    setRascunho(VAZIO);
    iniciarTransicao(() => router.refresh());
  }

  async function desativar(a: AmbienteEditavel) {
    const aviso =
      `Tirar ${a.codigo} da lista?\n\n` +
      'O histórico é preservado — ronda, pendências e chamados continuam ' +
      'existindo. O ambiente só deixa de aparecer nas telas.';

    if (!window.confirm(aviso)) return;

    setOcupado(true);
    const resultado = await desativarLocal(a.id);
    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível desativar.');
      return;
    }
    iniciarTransicao(() => router.refresh());
  }

  return (
    <div className="nao-imprime">
      {erro ? <p className="erro">{erro}</p> : null}

      {aberto ? (
        <div className="cadastro-ambiente">
          <div className="formulario-curto">
            <input
              className="campo__entrada formulario-curto__estreito"
              type="text"
              placeholder="Código"
              value={rascunho.codigo}
              onChange={(e) => setRascunho({ ...rascunho, codigo: e.target.value })}
              aria-label="Código do ambiente"
            />
            <input
              className="campo__entrada"
              type="text"
              placeholder="Nome (opcional)"
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
            <input
              className="campo__entrada formulario-curto__estreito"
              type="text"
              list="blocos-existentes"
              placeholder="Bloco"
              value={rascunho.bloco}
              onChange={(e) => setRascunho({ ...rascunho, bloco: e.target.value })}
              aria-label="Bloco"
            />
            <datalist id="blocos-existentes">
              {blocos.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <select
              className="campo__entrada formulario-curto__estreito"
              value={rascunho.tipo}
              onChange={(e) => setRascunho({ ...rascunho, tipo: e.target.value as TipoLocal })}
              aria-label="Tipo"
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
            <label className="planta__medida">
              <span className="campo__rotulo">Ordem</span>
              <input
                className="campo__entrada"
                type="number"
                value={rascunho.ordemVisita}
                onChange={(e) => setRascunho({ ...rascunho, ordemVisita: e.target.value })}
              />
            </label>
          </div>

          <label className="cadastro-ambiente__ronda">
            <input
              type="checkbox"
              checked={rascunho.rondaPadrao}
              onChange={(e) => setRascunho({ ...rascunho, rondaPadrao: e.target.checked })}
            />
            <span>
              Entra na ronda de segunda, quarta e sexta, com os 8 itens do checklist
            </span>
          </label>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              className="botao"
              type="button"
              disabled={ocupado || !rascunho.codigo.trim()}
              onClick={gravar}
            >
              {editando ? 'Salvar' : 'Cadastrar'}
            </button>
            <button
              className="botao botao--discreto"
              type="button"
              onClick={() => {
                setAberto(false);
                setEditando(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button className="botao" type="button" onClick={abrirNovo}>
          Novo ambiente
        </button>
      )}

      <details className="colar-email" style={{ marginTop: '1rem' }}>
        <summary className="colar-email__resumo">Editar ou remover ambientes</summary>

        <ul className="linhas">
          {ambientes.map((a) => (
            <li className="linha" key={a.id}>
              <span className="linha__codigo">{a.codigo}</span>
              <span className="linha__principal">
                <span className="linha__nota">
                  {a.nome ?? TIPOS.find((t) => t.valor === a.tipo)?.rotulo}
                  {a.bloco ? ` · ${a.bloco}` : ''}
                  {a.ronda_padrao ? ' · na ronda' : ''}
                </span>
              </span>
              <button
                className="etiqueta etiqueta--acao"
                type="button"
                onClick={() => abrirEdicao(a)}
              >
                Editar
              </button>
              <button
                className="etiqueta etiqueta--acao"
                type="button"
                disabled={ocupado}
                onClick={() => desativar(a)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
