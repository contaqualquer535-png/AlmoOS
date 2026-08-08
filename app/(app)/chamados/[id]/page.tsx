import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buscarChamadoComConversa } from '@/lib/data/consultas';
import { dataHoraCurta, plural } from '@/lib/formato';
import { ROTULO_PRIORIDADE, ROTULO_STATUS_CHAMADO } from '@/lib/types/database';
import { ColarEmailDoServi } from '@/components/ColarEmailDoServi';

export const dynamic = 'force-dynamic';

function linkDoServi(protocolo: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_OTRS_URL;
  if (!base || !protocolo?.trim()) return null;
  return `${base.replace(/\/$/, '')}/customer.pl?Action=CustomerTicketSearch;Subaction=Search;TicketNumber=${encodeURIComponent(
    protocolo.trim(),
  )}`;
}

/**
 * A conversa de um chamado num lugar só.
 *
 * É a resposta direta a "perco a resposta no meio do e-mail": tudo que o
 * SERVi mandou sobre este chamado, em ordem, com a data. O corpo vem em
 * <pre> porque e-mail de sistema é texto puro com quebras que importam.
 */
export default async function PaginaDoChamado({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dados = await buscarChamadoComConversa(id);

  if (!dados) notFound();

  const { chamado, mensagens, local } = dados;
  const dias = Math.max(
    0,
    Math.floor((Date.now() - new Date(chamado.aberto_em).getTime()) / 86_400_000),
  );
  const link = linkDoServi(chamado.protocolo_externo);

  return (
    <>
      <p className="sobrescrito">
        {chamado.protocolo_externo ? `Chamado #${chamado.protocolo_externo}` : 'Sem protocolo'}
        {' · '}
        {chamado.destino}
      </p>
      <h1 className="titulo">{chamado.titulo}</h1>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador__valor">{ROTULO_STATUS_CHAMADO[chamado.status]}</span>
          <span className="indicador__rotulo">estado</span>
        </div>
        <div className={`indicador${dias >= 14 && !chamado.fechado_em ? ' indicador--critico' : ''}`}>
          <span className="indicador__valor">{dias}</span>
          <span className="indicador__rotulo">
            {chamado.fechado_em ? 'dias até fechar' : 'dias em aberto'}
          </span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{ROTULO_PRIORIDADE[chamado.prioridade]}</span>
          <span className="indicador__rotulo">prioridade</span>
        </div>
        <div className="indicador">
          <span className="indicador__valor">{mensagens.length}</span>
          <span className="indicador__rotulo">mensagens do SERVi</span>
        </div>
      </div>

      {local ? (
        <p className="vazio">
          Local: <Link href={`/planta/${encodeURIComponent(local.codigo)}`}>{local.codigo}</Link>
          {local.nome ? ` — ${local.nome}` : ''}
        </p>
      ) : null}

      {chamado.descricao ? <p className="vazio">{chamado.descricao}</p> : null}

      <section className="secao">
        <div className="secao__cabeca">
          <h2 className="secao__titulo">Conversa</h2>
          <span className="secao__contagem">
            {plural(mensagens.length, 'mensagem', 'mensagens')}
          </span>
        </div>

        {mensagens.length === 0 ? (
          <p className="vazio">
            Nenhuma mensagem registrada. Cole abaixo um e-mail do SERVi sobre este
            chamado, ou configure o encaminhamento automático — passo 6c do guia de
            instalação.
          </p>
        ) : (
          <ol className="linhas">
            {mensagens.map((m) => (
              <li className="mensagem" key={m.id}>
                <div className="mensagem__cabeca">
                  <span className="mensagem__data">{dataHoraCurta(m.recebido_em)}</span>
                  {m.remetente ? (
                    <span className="mensagem__remetente">{m.remetente}</span>
                  ) : null}
                </div>
                {m.assunto ? <p className="mensagem__assunto">{m.assunto}</p> : null}
                {m.corpo ? <pre className="mensagem__corpo">{m.corpo}</pre> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div style={{ marginTop: '1.5rem' }}>
        <ColarEmailDoServi />
      </div>

      <p
        className="nao-imprime"
        style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
      >
        <Link className="botao botao--discreto" href="/tarefas">
          Voltar para os chamados
        </Link>
        {link ? (
          <a className="botao botao--discreto" href={link} target="_blank" rel="noreferrer">
            Abrir no SERVi
          </a>
        ) : null}
      </p>
    </>
  );
}
