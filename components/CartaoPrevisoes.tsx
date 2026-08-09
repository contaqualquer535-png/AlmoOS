'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { gerarInsightAgora } from '@/lib/data/mutacoes';
import { dataCurta, dataHoraCurta } from '@/lib/formato';
import type { Insight, Previsoes } from '@/lib/types/database';

/**
 * Previsões numa tela só, com a origem separada.
 *
 * Em cima, o que é conta: reincidência por intervalo médio, esgotamento
 * por saldo dividido pelo consumo. Embaixo, o que é leitura de modelo.
 * A separação não é organizacional, é epistêmica — "o café acaba dia 14"
 * e "parece haver relação entre X e Y" têm graus de confiança muito
 * diferentes e não podem dividir a mesma lista.
 */
export function CartaoPrevisoes({
  previsoes,
  insight,
}: {
  previsoes: Previsoes;
  insight: Insight | null;
}) {
  const router = useRouter();
  const [, iniciarTransicao] = useTransition();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const qualitativas = insight?.resumo?.previsoes_qualitativas ?? [];

  async function analisar() {
    setOcupado(true);
    setAviso(null);

    const resultado = await gerarInsightAgora();
    setOcupado(false);

    // ok com mensagem significa que gravou os pontos mas o modelo falhou.
    setAviso(resultado.mensagem ?? null);
    if (resultado.ok) iniciarTransicao(() => router.refresh());
  }

  const nada =
    previsoes.reincidencia.length === 0 &&
    previsoes.esgotamento.length === 0 &&
    previsoes.consumo_acelerando.length === 0 &&
    qualitativas.length === 0;

  return (
    <>
      <div className="cartao__corpo cartao__corpo--alto">
        {nada ? (
          <p className="vazio">
            Nada previsto. As projeções aparecem depois de algumas semanas de
            histórico — reincidência precisa de pelo menos duas ocorrências do
            mesmo item na mesma sala.
          </p>
        ) : null}

        {previsoes.esgotamento.length > 0 ? (
          <>
            <p className="rotulo-de-grupo">Estoque</p>
            <ul className="linhas">
              {previsoes.esgotamento.slice(0, 5).map((e) => (
                <li className="linha" key={e.nome}>
                  <span className="linha__principal">
                    <span className="linha__titulo">{e.nome}</span>
                    <span className="linha__nota">
                      acaba {dataCurta(e.previsao_esgotamento)}
                      {e.variacao_percentual !== null && e.variacao_percentual > 15
                        ? ` · consumo subiu ${e.variacao_percentual}%`
                        : ''}
                    </span>
                  </span>
                  <span
                    className={`linha__medida${
                      e.dias_restantes <= 7
                        ? ' linha__medida--critico'
                        : e.dias_restantes <= 21
                          ? ' linha__medida--alerta'
                          : ''
                    }`}
                  >
                    {e.dias_restantes} d
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {previsoes.reincidencia.length > 0 ? (
          <>
            <p className="rotulo-de-grupo">Deve quebrar de novo</p>
            <ul className="linhas">
              {previsoes.reincidencia.slice(0, 6).map((r) => (
                <li className="linha" key={`${r.local_codigo}-${r.item}`}>
                  <span className="linha__codigo">{r.local_codigo}</span>
                  <span className="linha__principal">
                    <span className="linha__titulo">{r.item}</span>
                    <span className="linha__nota">
                      {r.ocorrencias}× · a cada {r.intervalo_medio_dias} dias
                    </span>
                  </span>
                  <span
                    className={`linha__medida${
                      r.faltam <= 0 ? ' linha__medida--critico' : ''
                    }`}
                  >
                    {r.faltam <= 0 ? 'passou' : `${r.faltam} d`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {previsoes.salas_criticas.length > 0 ? (
          <>
            <p className="rotulo-de-grupo">Salas acumulando</p>
            <ul className="linhas">
              {previsoes.salas_criticas.slice(0, 5).map((s) => (
                <li className="linha" key={s.local_codigo}>
                  <span className="linha__codigo">{s.local_codigo}</span>
                  <span className="linha__principal">
                    <span className="linha__nota">
                      {s.pendencias_abertas} abertas · mais antiga há{' '}
                      {s.dias_da_mais_antiga} dias
                      {s.tem_chamado ? ' · já tem chamado' : ' · sem chamado'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {qualitativas.length > 0 ? (
          <>
            <p className="rotulo-de-grupo">Leitura do modelo</p>
            <ul className="linhas">
              {qualitativas.map((p) => (
                <li className="linha" key={p}>
                  <span className="linha__principal">{p}</span>
                </li>
              ))}
            </ul>
            <p className="nota-de-origem">
              Interpretação de {insight?.modelo}, não medição. As listas acima são
              conta sobre o histórico; esta não.
            </p>
          </>
        ) : null}

        {aviso ? <p className="erro">{aviso}</p> : null}
      </div>

      <div className="cartao__rodape">
        <button
          type="button"
          className="botao botao--discreto"
          disabled={ocupado}
          onClick={analisar}
        >
          {ocupado ? 'Analisando…' : 'Analisar agora'}
        </button>
        {insight ? (
          <span className="linha__nota" style={{ marginLeft: '0.625rem' }}>
            última: {dataHoraCurta(insight.gerado_em)}
          </span>
        ) : null}
      </div>
    </>
  );
}
