// Edge Function: insights do dia.
//
// Roda antes do horário de chegada (agendada por cron no Supabase) e
// grava uma linha em `insights_ia`. A tela lê a mais recente.
//
// A ordem importa: os pontos de atenção determinísticos são calculados
// e gravados independentemente da IA. Se o modelo falhar, estiver fora
// do ar ou nem estiver configurado, a linha é gravada do mesmo jeito,
// com `erro` preenchido. É para isso que a coluna existe (migration
// 0008) — o job não pode sumir em silêncio.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { escolherProvedor } from './provedores.ts';

interface PontoDeAtencao {
  tipo: string;
  referencia_id: string | null;
  mensagem: string;
  prioridade: 'alta' | 'media' | 'baixa';
}

interface Contexto {
  gerado_para: string;
  pontos_atencao: PontoDeAtencao[];
  dados: Record<string, unknown>;
}

function montarPrompt(contexto: Contexto): string {
  return [
    'Você analisa dados de manutenção predial de um centro tecnológico universitário.',
    '',
    'Abaixo estão agregados de duas semanas e do mês corrente, mais os chamados',
    'dos últimos 90 dias. Os alertas óbvios (chamado parado, estoque baixo, prazo',
    'vencido) JÁ foram calculados e não devem ser repetidos.',
    '',
    'Sua tarefa é encontrar padrões que só aparecem quando se olha o conjunto:',
    'concentração de um tipo de problema num bloco, item que quebra sempre no',
    'mesmo lugar, tendência de piora ou melhora entre as semanas, correlação entre',
    'consumo de suprimento e volume de chamados.',
    '',
    'Regras:',
    '- Só afirme o que os números sustentam. Não especule causa.',
    '- Cite os números concretos em cada padrão.',
    '- Se não houver padrão digno de nota, devolva a lista vazia. Isso é resposta',
    '  aceitável e preferível a inventar padrão.',
    '- Máximo de 5 padrões, em português do Brasil, uma frase cada.',
    '',
    'Responda APENAS com JSON no formato:',
    '{"padroes_identificados": ["...", "..."]}',
    '',
    'Dados:',
    JSON.stringify(contexto.dados),
  ].join('\n');
}

Deno.serve(async (requisicao) => {
  const env = Deno.env.toObject();

  const supabase = createClient(
    env.SUPABASE_URL!,
    // A service_role ignora o RLS. Só existe aqui dentro, no servidor do
    // Supabase, e nunca é exposta ao navegador.
    env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Proteção do endpoint: o cron manda o segredo no header. Sem isso,
  // qualquer um com a URL dispara o job.
  const segredo = env.INSIGHTS_SEGREDO;
  if (segredo && requisicao.headers.get('x-insights-segredo') !== segredo) {
    return new Response(JSON.stringify({ erro: 'não autorizado' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const { data, error } = await supabase.rpc('montar_contexto_para_insights');

  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const contexto = data as unknown as Contexto;
  const provedor = escolherProvedor(env);

  let padroes: string[] = [];
  let modelo = provedor.nome;
  let tokensSaida: number | null = null;
  let mensagemDeErro: string | null = null;

  if (provedor.disponivel) {
    try {
      const resposta = await provedor.analisar(montarPrompt(contexto));
      padroes = resposta.padroes;
      modelo = resposta.modelo;
      tokensSaida = resposta.tokensSaida;
    } catch (erro) {
      // Engolido de propósito: os pontos de atenção abaixo valem por si.
      mensagemDeErro = erro instanceof Error ? erro.message : String(erro);
    }
  } else {
    mensagemDeErro = 'Nenhum provedor de IA configurado; só os pontos determinísticos.';
  }

  const { error: erroGravacao } = await supabase.from('insights_ia').insert({
    resumo: {
      gerado_para: contexto.gerado_para,
      pontos_atencao: contexto.pontos_atencao,
      padroes_identificados: padroes,
    },
    modelo,
    tokens_saida: tokensSaida,
    erro: mensagemDeErro,
  });

  if (erroGravacao) {
    return new Response(JSON.stringify({ erro: erroGravacao.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      modelo,
      pontos: contexto.pontos_atencao.length,
      padroes: padroes.length,
      erro: mensagemDeErro,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
});
