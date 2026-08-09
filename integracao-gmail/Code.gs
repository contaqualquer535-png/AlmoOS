/**
 * Ponte entre o Gmail da UCS e o almoOS.
 *
 * Por que Apps Script e não um conector.
 *
 * O Workspace da UCS bloqueia aplicativos OAuth de terceiros, o que
 * derruba tanto os conectores prontos quanto um app próprio no Google
 * Cloud. O Apps Script escapa disso por não ser terceiro: ele roda
 * dentro da sua conta, com a sua permissão, e o Google o trata como
 * código seu.
 *
 * Efeito colateral bom: dispensa Postmark, Cloudflare Email Routing e
 * regra de encaminhamento externo. O script lê a caixa e faz POST
 * direto na Edge Function `email-servi`, que já existe.
 *
 * ---------------------------------------------------------------
 * COMO INSTALAR
 *
 * 1. script.google.com → Novo projeto → cole este arquivo inteiro
 * 2. Engrenagem (Configurações do projeto) → Propriedades do script →
 *    adicione três:
 *
 *      URL_EMAIL_SERVI  https://SEU_REF.supabase.co/functions/v1/email-servi
 *      SEGREDO          o mesmo valor de EMAIL_SEGREDO nos secrets
 *      CHAVE_ANON       a anon/publishable do Supabase (Settings → API)
 *
 *    A CHAVE_ANON existe porque o portão do Supabase exige um
 *    Authorization em toda Edge Function, antes de o código rodar. Ela
 *    não é secreta — é a mesma que o site expõe no navegador — e o que
 *    de fato protege este endpoint é o SEGREDO.
 *
 *    Guardar em propriedades e não no código: o script pode ser
 *    compartilhado ou exportado, e as chaves não devem ir junto.
 *
 * 3. Rode `enviarNaoProcessados` uma vez à mão e autorize quando o
 *    Google pedir. Vai aparecer um aviso de "app não verificado" —
 *    é o seu próprio script, siga em Avançado → Ir para o projeto.
 *
 * 4. Relógio (Acionadores) → Adicionar acionador →
 *    função `enviarNaoProcessados`, por tempo, a cada hora.
 * ---------------------------------------------------------------
 */

// Ajuste se o remetente do SERVi for outro. Confira em um e-mail real:
// o assunto sempre traz [Chamado#001538977].
var BUSCA = 'subject:(Chamado#) newer_than:90d -label:almoos-processado';

// Rótulo aplicado ao que já subiu. É o que torna a execução repetida
// inofensiva: sem ele, cada hora reenviaria a caixa inteira.
var ROTULO = 'almoos-processado';

// Teto por execução. O Apps Script tem limite de tempo e de chamadas
// externas por dia; melhor processar 50 por hora do que estourar a cota
// tentando 500 de uma vez.
var MAXIMO_POR_EXECUCAO = 50;

function enviarNaoProcessados() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('URL_EMAIL_SERVI');
  var segredo = props.getProperty('SEGREDO');
  var chaveAnon = props.getProperty('CHAVE_ANON');

  if (!url) {
    throw new Error('Falta a propriedade URL_EMAIL_SERVI nas configurações do projeto.');
  }
  // A CHAVE_ANON é opcional e provavelmente desnecessária.
  //
  // O portão do Supabase exige um Authorization em formato JWT. As
  // chaves novas (sb_publishable_…) são opacas, não JWT, e o portão as
  // recusa com UNAUTHORIZED_INVALID_JWT_FORMAT. Por isso a função é
  // publicada com --no-verify-jwt e quem a protege é o SEGREDO.
  //
  // A propriedade continua sendo lida para quem ainda tiver a chave
  // antiga, no formato eyJ…, e preferir manter a verificação ligada.
  var cabecalhos = {};
  if (chaveAnon) cabecalhos['Authorization'] = 'Bearer ' + chaveAnon;
  if (segredo) cabecalhos['x-email-segredo'] = segredo;

  var rotulo = GmailApp.getUserLabelByName(ROTULO) || GmailApp.createLabel(ROTULO);
  var conversas = GmailApp.search(BUSCA, 0, MAXIMO_POR_EXECUCAO);

  var enviadas = 0;
  var falhas = 0;

  for (var i = 0; i < conversas.length; i++) {
    var conversa = conversas[i];
    var mensagens = conversa.getMessages();
    var todasOk = true;

    for (var j = 0; j < mensagens.length; j++) {
      var mensagem = mensagens[j];

      var corpo = {
        subject: mensagem.getSubject(),
        from: mensagem.getFrom(),
        date: mensagem.getDate().toISOString(),
        // getPlainBody e não getBody: o corpo em HTML traria a
        // maquiagem do OTRS junto, e o extrator só quer o texto.
        text: mensagem.getPlainBody(),
        messageId: mensagem.getId(),
      };

      try {
        var resposta = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          headers: cabecalhos,
          payload: JSON.stringify(corpo),
          muteHttpExceptions: true,
        });

        var codigo = resposta.getResponseCode();

        if (codigo >= 200 && codigo < 300) {
          enviadas++;
        } else {
          todasOk = false;
          falhas++;
          Logger.log('Falhou (' + codigo + '): ' + resposta.getContentText());
        }
      } catch (erro) {
        todasOk = false;
        falhas++;
        Logger.log('Erro de rede: ' + erro);
      }
    }

    // Só rotula quando a conversa inteira subiu. Rotular no meio
    // perderia as mensagens que faltaram, e a idempotência do lado do
    // banco (Message-ID único) torna o reenvio inofensivo.
    if (todasOk) rotulo.addToThread(conversa);
  }

  Logger.log(
    conversas.length + ' conversas · ' + enviadas + ' mensagens enviadas · ' + falhas + ' falhas',
  );
}

/**
 * Extrai os chamados abertos para uma planilha, no formato que a aba
 * Importar do almoOS entende.
 *
 * Serve para a carga inicial: em vez de esperar o acionador processar
 * 90 dias de histórico mensagem a mensagem, você gera a tabela de uma
 * vez, confere com o olho e cola.
 */
function gerarPlanilhaDeChamados() {
  var conversas = GmailApp.search('subject:(Chamado#) newer_than:180d', 0, 200);
  var vistos = {};
  var linhas = [['chamado', 'titulo', 'estado', 'fila', 'idade']];

  for (var i = 0; i < conversas.length; i++) {
    var mensagens = conversas[i].getMessages();
    var ultima = mensagens[mensagens.length - 1];
    var assunto = ultima.getSubject();

    var numero = assunto.match(/\[\s*Chamado#\s*(\d+)\s*\]/i);
    if (!numero) continue;
    if (vistos[numero[1]]) continue;
    vistos[numero[1]] = true;

    var titulo = assunto.replace(/\[[^\]]*\]\s*/g, '').replace(/^.*?:\s*/, '').trim();
    var texto = ultima.getPlainBody();

    var fila = texto.match(/\b([A-Z]{2,}(?:::[^\s,;<>"']+){1,3})/);
    var fechado = /fechamento|chamado fechado|encerrad/i.test(assunto);

    var dias = Math.floor(
      (new Date().getTime() - mensagens[0].getDate().getTime()) / 86400000,
    );

    linhas.push([
      numero[1],
      titulo,
      fechado ? 'fechado' : 'aberto',
      fila ? fila[1] : '',
      dias + ' d',
    ]);
  }

  var planilha = SpreadsheetApp.create('Chamados SERVi — ' + new Date().toLocaleDateString('pt-BR'));
  planilha.getActiveSheet().getRange(1, 1, linhas.length, 5).setValues(linhas);

  Logger.log('Planilha criada: ' + planilha.getUrl());
  Logger.log(linhas.length - 1 + ' chamados');
  return planilha.getUrl();
}
