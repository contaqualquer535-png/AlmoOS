'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { devolverRecurso, retirarRecurso, salvarRecurso } from '@/lib/data/mutacoes';
import { dataCurta, plural } from '@/lib/formato';
import type { EmprestimoDeRecurso, RecursoStatus } from '@/lib/types/database';
import type { LocalBasico } from '@/lib/data/consultas';

/**
 * Recursos contados: quantos existem, quantos estão fora, com quem.
 *
 * A pergunta que a tela responde em um olhar é "quantas extensões eu
 * ainda tenho". Por isso o disponível vem em corpo grande e o resto
 * fica menor — o total e o emprestado só interessam quando o disponível
 * surpreende.
 */
export function PainelRecursos({
  recursos,
  emprestimos,
  locais,
  ambientes,
}: {
  recursos: RecursoStatus[];
  emprestimos: EmprestimoDeRecurso[];
  locais: Record<string, string>;
  ambientes: LocalBasico[];
}) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();

  const [aberto, setAberto] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState('1');
  const [responsavel, setResponsavel] = useState('');
  const [localId, setLocalId] = useState('');
  const [previsao, setPrevisao] = useState('');

  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [rascunho, setRascunho] = useState({
    nome: '',
    unidade: 'un',
    quantidadeTotal: '0',
    minimoDesejado: '0',
    localGuardaId: '',
  });

  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const hoje = new Date().toISOString().slice(0, 10);

  function alternarRetirada(recurso: RecursoStatus) {
    const mesmo = aberto === recurso.id;
    setAberto(mesmo ? null : recurso.id);
    setEditando(null);
    setErro(null);
    setQuantidade('1');
    setResponsavel('');
    setLocalId('');
    setPrevisao('');
  }

  function abrirEdicao(recurso: RecursoStatus) {
    setEditando(recurso.id);
    setAberto(null);
    setCriando(false);
    setErro(null);
    setRascunho({
      nome: recurso.nome,
      unidade: recurso.unidade,
      quantidadeTotal: String(recurso.quantidade_total),
      minimoDesejado: String(recurso.minimo_desejado),
      localGuardaId: recurso.local_guarda_id ?? '',
    });
  }

  async function gravarCadastro(id?: string) {
    setOcupado(true);
    setErro(null);

    const resultado = await salvarRecurso({
      id,
      nome: rascunho.nome,
      unidade: rascunho.unidade,
      quantidadeTotal: Number(rascunho.quantidadeTotal),
      minimoDesejado: Number(rascunho.minimoDesejado),
      localGuardaId: rascunho.localGuardaId || undefined,
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'Não foi possível salvar.');
      return;
    }

    setEditando(null);
    setCriando(false);
    setRascunho({
      nome: '',
      unidade: 'un',
      quantidadeTotal: '0',
      minimoDesejado: '0',
      localGuardaId: '',
    });
    iniciarTransicao(() => router.refresh());
  }

  async function registrarRetirada(recurso: RecursoStatus) {
    setOcupado(true);
    setErro(null);

    const resultado = await retirarRecurso({
      recursoId: recurso.id,
      quantidade: Number(quantidade),
      responsavel: responsavel || undefined,
      localId: localId || undefined,
      previsaoDevolucao: previsao || undefined,
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'A retirada não foi registrada.');
      return;
    }

    setAberto(null);
    iniciarTransicao(() => router.refresh());
  }

  async function devolver(emprestimo: EmprestimoDeRecurso, parcial?: number) {
    setOcupado(true);
    setErro(null);

    const resultado = await devolverRecurso({
      emprestimoId: emprestimo.id,
      quantidade: parcial,
    });

    setOcupado(false);

    if (!resultado.ok) {
      setErro(resultado.mensagem ?? 'A devolução não foi registrada.');
      return;
    }
    iniciarTransicao(() => router.refresh());
  }

  const camposDoCadastro = (
    <div className="formulario-curto" style={{ marginTop: '0.75rem' }}>
      <input
        className="campo__entrada"
        type="text"
        placeholder="Nome do recurso"
        value={rascunho.nome}
        onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
      />
      <label className="planta__medida">
        <span className="campo__rotulo">Total</span>
        <input
          className="campo__entrada"
          type="number"
          min={0}
          value={rascunho.quantidadeTotal}
          onChange={(e) => setRascunho({ ...rascunho, quantidadeTotal: e.target.value })}
        />
      </label>
      <label className="planta__medida">
        <span className="campo__rotulo">Mínimo</span>
        <input
          className="campo__entrada"
          type="number"
          min={0}
          value={rascunho.minimoDesejado}
          onChange={(e) => setRascunho({ ...rascunho, minimoDesejado: e.target.value })}
        />
      </label>
      <select
        className="campo__entrada formulario-curto__estreito"
        value={rascunho.localGuardaId}
        onChange={(e) => setRascunho({ ...rascunho, localGuardaId: e.target.value })}
        aria-label="Onde fica guardado"
      >
        <option value="">Onde guarda</option>
        {ambientes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.codigo}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      {erro ? <p className="erro">{erro}</p> : null}

      <div className="nao-imprime" style={{ marginBottom: '1.25rem' }}>
        {criando ? (
          <>
            {camposDoCadastro}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                className="botao"
                type="button"
                disabled={ocupado || !rascunho.nome.trim()}
                onClick={() => gravarCadastro()}
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
          <button className="botao" type="button" onClick={() => setCriando(true)}>
            Novo recurso
          </button>
        )}
      </div>

      {recursos.length === 0 ? (
        <p className="vazio">
          Nenhum recurso cadastrado. Extensão, cabo HDMI, controle de projetor — o que
          você empresta e conta.
        </p>
      ) : null}

      <ul className="linhas">
        {recursos.map((recurso) => {
          const daqui = emprestimos.filter((e) => e.recurso_id === recurso.id);

          return (
            <li className="recurso" key={recurso.id}>
              <div className="recurso__linha">
                <span
                  className={`recurso__disponivel${
                    recurso.abaixo_do_minimo ? ' recurso__disponivel--baixo' : ''
                  }`}
                >
                  {recurso.quantidade_disponivel}
                </span>

                <span className="recurso__principal">
                  <span className="recurso__nome">{recurso.nome}</span>
                  <span className="linha__nota">
                    {recurso.quantidade_total} no total
                    {recurso.quantidade_emprestada > 0
                      ? ` · ${recurso.quantidade_emprestada} fora`
                      : ''}
                    {recurso.local_guarda ? ` · guardado em ${recurso.local_guarda}` : ''}
                    {recurso.retiradas_atrasadas > 0
                      ? ` · ${plural(
                          recurso.retiradas_atrasadas,
                          'retirada vencida',
                          'retiradas vencidas',
                        )}`
                      : ''}
                  </span>
                </span>

                <button
                  className="botao botao--discreto"
                  type="button"
                  disabled={recurso.quantidade_disponivel <= 0}
                  onClick={() => alternarRetirada(recurso)}
                >
                  {aberto === recurso.id ? 'Fechar' : 'Retirar'}
                </button>

                <button
                  className="botao botao--discreto"
                  type="button"
                  onClick={() => (editando === recurso.id ? setEditando(null) : abrirEdicao(recurso))}
                >
                  Editar
                </button>
              </div>

              {editando === recurso.id ? (
                <>
                  {camposDoCadastro}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      className="botao"
                      type="button"
                      disabled={ocupado}
                      onClick={() => gravarCadastro(recurso.id)}
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

              {aberto === recurso.id ? (
                <div className="formulario-curto" style={{ marginTop: '0.75rem' }}>
                  <label className="planta__medida">
                    <span className="campo__rotulo">Quantas</span>
                    <input
                      className="campo__entrada"
                      type="number"
                      min={1}
                      max={recurso.quantidade_disponivel}
                      value={quantidade}
                      onChange={(e) => setQuantidade(e.target.value)}
                    />
                  </label>
                  <input
                    className="campo__entrada"
                    type="text"
                    placeholder="Quem levou"
                    value={responsavel}
                    onChange={(e) => setResponsavel(e.target.value)}
                  />
                  <select
                    className="campo__entrada formulario-curto__estreito"
                    value={localId}
                    onChange={(e) => setLocalId(e.target.value)}
                    aria-label="Para onde foi"
                  >
                    <option value="">Para onde</option>
                    {ambientes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo}
                      </option>
                    ))}
                  </select>
                  <input
                    className="campo__entrada formulario-curto__estreito"
                    type="date"
                    value={previsao}
                    onChange={(e) => setPrevisao(e.target.value)}
                    aria-label="Devolve quando"
                  />
                  <button
                    className="botao"
                    type="button"
                    disabled={ocupado}
                    onClick={() => registrarRetirada(recurso)}
                  >
                    Registrar
                  </button>
                </div>
              ) : null}

              {daqui.length > 0 ? (
                <ul className="recurso__fora">
                  {daqui.map((emprestimo) => {
                    const atrasado =
                      emprestimo.previsao_devolucao !== null &&
                      emprestimo.previsao_devolucao < hoje;

                    return (
                      <li className="recurso__retirada" key={emprestimo.id}>
                        <span className="recurso__quantidade">{emprestimo.quantidade}</span>
                        <span className="recurso__destino">
                          {emprestimo.responsavel ?? 'sem responsável'}
                          {emprestimo.local_id ? ` · ${locais[emprestimo.local_id]}` : ''}
                        </span>
                        <span
                          className={`linha__medida${atrasado ? ' linha__medida--critico' : ''}`}
                        >
                          {emprestimo.previsao_devolucao
                            ? `devolve ${dataCurta(emprestimo.previsao_devolucao)}`
                            : `desde ${dataCurta(emprestimo.retirado_em.slice(0, 10))}`}
                        </span>
                        <button
                          className="botao botao--discreto"
                          type="button"
                          disabled={ocupado}
                          onClick={() => devolver(emprestimo)}
                        >
                          Devolver
                        </button>
                        {emprestimo.quantidade > 1 ? (
                          <button
                            className="botao botao--discreto"
                            type="button"
                            disabled={ocupado}
                            onClick={() => {
                              const texto = window.prompt(
                                `Quantas de ${emprestimo.quantidade} voltaram?`,
                                '1',
                              );
                              if (texto) void devolver(emprestimo, Number(texto));
                            }}
                          >
                            Parcial
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
