# Ponte Gmail → almoOS

O Workspace da UCS bloqueia aplicativos OAuth de terceiros. Isso derruba
os conectores prontos e também um app próprio no Google Cloud, que é o
que a etapa 8 da especificação previa.

O **Apps Script** contorna isso sem contornar nenhuma política: ele não
é terceiro. Roda dentro da sua conta, com a sua autorização, e o Google
o trata como código seu — do mesmo jeito que trata uma fórmula que você
escreve numa planilha.

## O que ele faz

Duas funções, com propósitos diferentes.

**`enviarNaoProcessados`** roda de hora em hora e manda cada e-mail novo
do SERVi para a Edge Function `email-servi`. É a ingestão contínua: o
chamado aparece no almoOS sozinho, com a conversa junto, e entra nos
pontos de atenção sem você registrar nada.

**`gerarPlanilhaDeChamados`** é para a carga inicial. Varre 180 dias,
monta uma planilha no formato que a aba **Importar** entende, e devolve
o link. Você confere com o olho e cola.

## Por que isso dispensa o passo 6c do guia

O `docs/GUIA.md` descrevia um caminho com Postmark ou Cloudflare Email
Routing recebendo um encaminhamento do Gmail. Aquilo existia justamente
porque eu supunha que ler a caixa direto seria bloqueado.

Com o Apps Script não é: nada sai da conta institucional para um serviço
externo de e-mail, e não é preciso domínio próprio. Se você já tinha
montado o encaminhamento, pode desfazer.

## Instalar

Está tudo comentado no topo de `Code.gs`. Resumo:

1. `script.google.com` → Novo projeto → cole o `Code.gs`
2. Configurações do projeto → Propriedades do script:
   - `URL_INSIGHTS` = `https://SEU_REF.supabase.co/functions/v1/email-servi`
   - `SEGREDO` = o mesmo valor de `EMAIL_SEGREDO` nos secrets do Supabase
3. Rode `gerarPlanilhaDeChamados` uma vez e autorize
4. Acionadores → `enviarNaoProcessados`, por tempo, a cada hora

Na autorização vai aparecer "app não verificado". É o seu próprio
script: Avançado → Ir para o projeto.

## Se o TI bloquear o Apps Script também

Alguns administradores restringem Apps Script por domínio. Se for o
caso, o caminho manual continua valendo e não depende de ninguém: em
**Tarefas**, "Colar e-mail do SERVi", cole a mensagem.

## O que ele deliberadamente não faz

Não escreve, não responde, não arquiva. Só lê e aplica um rótulo. Um
script que roda sozinho de hora em hora sobre a caixa institucional deve
ter o menor poder possível — e ler é tudo que a ingestão precisa.
