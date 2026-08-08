// Edge Function: recebe e-mail encaminhado do SERVi.
//
// Você cria uma regra no Gmail encaminhando as mensagens do SERVi para
// um endereço processado por um serviço de entrada (Cloudflare Email
// Worker, Postmark Inbound, SendGrid Parse — qualquer um serve). Esse
// serviço faz POST aqui.
//
// A função aceita três formatos de corpo de propósito: cada provedor
// nomeia os campos do seu jeito, e trocar de provedor não deveria
// exigir código novo.
//
//   { "subject", "from", "text", "date", "messageId" }   genérico
//   { "Subject", "From", "TextBody", "Date", "MessageID" }  Postmark
//   { "assunto", "remetente", "corpo" }                  colagem manual
//
// Toda a decisão — casar pelo protocolo, criar o chamado se faltar,
// fechar quando o assunto indicar — mora na função SQL
// `registrar_mensagem_de_chamado`. Aqui é só transporte.

import { createClient } from 'jsr:@supabase/supabase-js@2';

function extrairProtocolo(texto: string): string | null {
  const entreColchetes = texto.match(/\[\s*chamado\s*#\s*(\d{4,})\s*\]/i);
  if (entreColchetes) return entreColchetes[1];
  const solto = texto.match(/chamado\s*#?\s*(\d{6,})/i);
  return solto ? solto[1] : null;
}

function extrairFila(texto: string): string | null {
  const achado = texto.match(/\b([A-Z]{2,}(?:::[^\s,;<>"']+){1,3})/);
  return achado ? achado[1] : null;
}

function primeiroTexto(...valores: unknown[]): string {
  for (const valor of valores) {
    if (typeof valor === 'string' && valor.trim()) return valor.trim();
  }
  return '';
}

Deno.serve(async (requisicao) => {
  const env = Deno.env.toObject();

  // Endpoint público por natureza — quem entrega e-mail não faz login.
  // O segredo vai no header ou na querystring, porque alguns serviços de
  // entrada não deixam configurar header.
  const segredo = env.EMAIL_SEGREDO;
  if (segredo) {
    const url = new URL(requisicao.url);
    const informado =
      requisicao.headers.get('x-email-segredo') ?? url.searchParams.get('segredo');
    if (informado !== segredo) {
      return new Response(JSON.stringify({ erro: 'não autorizado' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await requisicao.json();
  } catch {
    return new Response(JSON.stringify({ erro: 'corpo inválido' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const assunto = primeiroTexto(corpo.subject, corpo.Subject, corpo.assunto);
  const texto = primeiroTexto(
    corpo.text,
    corpo.TextBody,
    corpo.corpo,
    corpo.body,
    corpo.plain,
  );
  const remetente = primeiroTexto(corpo.from, corpo.From, corpo.remetente) || null;
  const dataBruta = primeiroTexto(corpo.date, corpo.Date, corpo.data);
  const idExterno =
    primeiroTexto(corpo.messageId, corpo.MessageID, corpo['message-id']) || null;

  const protocolo = extrairProtocolo(assunto) ?? extrairProtocolo(texto);

  if (!protocolo) {
    // 200, e não erro: o serviço de entrada reentregaria em laço, e
    // e-mail sem número de chamado simplesmente não é do SERVi.
    return new Response(
      JSON.stringify({ ignorado: true, motivo: 'sem número de chamado no assunto' }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  const quando = dataBruta ? new Date(dataBruta) : new Date();
  const recebidoEm = Number.isNaN(quando.getTime())
    ? new Date().toISOString()
    : quando.toISOString();

  const supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data, error } = await supabase.rpc('registrar_mensagem_de_chamado', {
    p_protocolo: protocolo,
    p_assunto: assunto || `Chamado #${protocolo}`,
    p_remetente: remetente,
    p_corpo: texto || null,
    p_recebido_em: recebidoEm,
    p_id_externo: idExterno,
    p_fila: extrairFila(texto || assunto),
  });

  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, protocolo, ...data }), {
    headers: { 'content-type': 'application/json' },
  });
});
