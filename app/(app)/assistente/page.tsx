import { buscarUsoDeIa } from '@/lib/data/consultas';
import { Assistente } from '@/components/Assistente';

export const dynamic = 'force-dynamic';

/** Milhares com ponto, para 12480 virar 12.480. */
function milhar(n: number): string {
  return new Intl.NumberFormat('pt-BR').format(n);
}

export default async function PaginaAssistente() {
  // O contador não pode derrubar o chat: se a migration do registro de
  // uso ainda não foi aplicada, a tela abre sem ele.
  const uso = await buscarUsoDeIa().catch(() => null);

  return (
    <>
      <p className="sobrescrito">Consulta e ação sobre os dados do CETEC</p>
      <h1 className="titulo">Assistente</h1>

      {uso ? (
        <div className="indicadores">
          <div className="indicador">
            <span className="indicador__valor">{uso.hoje.chamadas}</span>
            <span className="indicador__rotulo">chamadas hoje</span>
          </div>
          <div className="indicador">
            <span className="indicador__valor">{uso.ultima_hora}</span>
            <span className="indicador__rotulo">na última hora</span>
          </div>
          <div className="indicador">
            <span className="indicador__valor">
              {milhar(uso.hoje.tokens_entrada + uso.hoje.tokens_saida)}
            </span>
            <span className="indicador__rotulo">tokens hoje</span>
          </div>
          <div className="indicador">
            <span className="indicador__valor">{milhar(uso.mes.chamadas)}</span>
            <span className="indicador__rotulo">chamadas no mês</span>
          </div>
          <div className={`indicador${uso.hoje.erros > 0 ? ' indicador--alerta' : ''}`}>
            <span className="indicador__valor">{uso.hoje.erros}</span>
            <span className="indicador__rotulo">falhas hoje</span>
          </div>
        </div>
      ) : null}

      <p className="nota-de-origem" style={{ marginTop: '1rem' }}>
        Estes números são o que <em>você</em> gastou, não o que resta. O Google não
        informa a cota restante por API — só o custo de cada resposta. Se o assistente
        começar a recusar com &ldquo;limite atingido&rdquo;, é a cota do minuto ou do
        dia, e passa sozinha.
        {uso && Object.keys(uso.por_contexto).length > 0 ? (
          <>
            {' '}
            Nos últimos 30 dias:{' '}
            {Object.entries(uso.por_contexto)
              .map(([contexto, n]) => `${n} de ${contexto}`)
              .join(', ')}
            .
          </>
        ) : null}
      </p>

      <p className="nota-de-origem">
        As respostas vêm de um modelo lendo o banco pelas ferramentas. Consulta ele faz
        sozinho; gravar tarefa, chamado ou suprimento só depois da sua confirmação.
        Números importantes vale conferir na tela correspondente.
      </p>

      <Assistente />
    </>
  );
}
