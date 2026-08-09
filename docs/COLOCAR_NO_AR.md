# Passo a passo

Copie e cole, na ordem. Nenhum passo depende de você entender o anterior.

Se um passo der erro, pare nele.

---

## A — App no celular

Use o **cmd**, não o PowerShell nem o terminal do VS Code.

```
cd C:\Users\andrin\Desktop\almoOS\app-movel
npm run dev-build
```

Espere de 10 a 25 minutos. Aparece um link no fim.

1. Abra o link no celular e instale o APK. Permita "fonte desconhecida".
2. No cmd: `npx expo start --dev-client`
3. Abra o app instalado, leia o QR code do terminal.
4. Entre com o mesmo e-mail e senha do site.

Pronto quando a tela de ronda listar as salas.

---

## B — Site no ar

### B1. Subir para o GitHub

Crie um repositório vazio em github.com/new. Nome: `almoOS`. **Não**
marque nenhuma opção de inicialização.

No cmd:

```
cd C:\Users\andrin\Desktop\almoOS
git init
git add .
git commit -m "Sistema de gestão CETEC"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/almoOS.git
git push -u origin main
```

Se pedir login, o navegador abre. Autorize.

### B2. Publicar no Vercel

1. Entre em vercel.com com a conta do GitHub.
2. **Add New → Project**.
3. Importe o repositório `almoOS`.
4. Em **Root Directory**, deixe como está (a raiz).
5. **Antes de clicar em Deploy**, abra *Environment Variables* e
   adicione as quatro abaixo, uma por vez:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://mahvdcqhdhckzpsuucoy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a mesma do seu `.env.local` |
| `GEMINI_API_KEY` | a chave do Google AI Studio |
| `NEXT_PUBLIC_OTRS_URL` | o endereço do SERVi, sem barra no fim |

6. **Deploy.**

Espere uns 3 minutos. O Vercel dá uma URL, tipo
`almoos-xxxx.vercel.app`.

### B3. Liberar o login na URL nova

No painel do Supabase, projeto `almoOS`:

**Authentication → URL Configuration**

- Em *Site URL*, cole a URL do Vercel.
- Em *Redirect URLs*, adicione `https://SUA-URL.vercel.app/auth/callback`

Salve.

Pronto quando você abrir a URL do Vercel, entrar, e a tela Hoje carregar.

---

## C — Dados reais

Na aba **Importar** do site, nesta ordem. Comece colando **três linhas**
de cada, para conferir que o cabeçalho foi entendido, antes de colar o
arquivo inteiro.

1. **Patrimônio** — colunas: `codigo_barras, item, descricao, local`
2. **Chamados do SERVi** — abra "Meus Chamados" no SERVi, selecione a
   tabela inteira, copie, cole
3. **Ronda em papel** — colunas: `data, sala, item, status, observacao`

O estoque de suprimento não tem importador: são nove itens, faça pela
tela **Suprimentos**.

---

## D — E-mail do SERVi

Só isto, por enquanto:

1. Abra um e-mail do SERVi no Gmail.
2. Copie a mensagem inteira, incluindo o assunto.
3. No site, aba **Tarefas**, clique em "Colar e-mail do SERVi".
4. Cole e clique em Registrar.

Se o chamado aparecer na lista, funcionou. O encaminhamento automático
fica para outro dia — está no `docs/GUIA.md`, passo 6c.

---

## E — Insights diários (cron)

### E1. Publicar a função

```
cd C:\Users\andrin\Desktop\almoOS
```

```
npx supabase functions deploy insights --no-verify-jwt
```

O `--no-verify-jwt` é o mesmo caso do `email-servi`: o portão do Supabase
exige um `Authorization` em formato JWT, e as chaves novas
(`sb_publishable_…`) não são JWT. Quem protege o endpoint é o segredo.

```
npx supabase secrets set INSIGHTS_SEGREDO=umasenhalongasoletrasenumeros
```

```
npx supabase secrets set GEMINI_API_KEY=sua_chave_do_ai_studio
```

Use só letras e números no segredo. O PowerShell come aspas e símbolos, e
o sintoma disso é um 401 que parece bug.

### E2. Ligar as extensões

No painel do Supabase: **Database → Extensions**, procure e ative:

- `pg_cron` — o agendador
- `pg_net` — permite ao banco fazer requisições HTTP

Sem as duas o passo seguinte falha.

### E3. Agendar

No **SQL Editor**, trocando o `SEU_REF` e o segredo:

```sql
select cron.schedule(
  'insights-diario',
  -- Cron do Supabase roda em UTC. 09:00 UTC é 06:00 em Caxias do Sul.
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://SEU_REF.supabase.co/functions/v1/insights',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-insights-segredo', 'umasenhalongasoletrasenumeros'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

**Confira** que foi criado:

```sql
select jobname, schedule, active from cron.job;
```

**Teste sem esperar até amanhã** rodando o corpo do job à mão — o mesmo
`select net.http_post(...)` acima, solto. Depois veja se a linha
apareceu:

```sql
select gerado_em, modelo, erro from insights_ia order by gerado_em desc limit 3;
```

Se `erro` estiver preenchido, a mensagem diz o motivo. Os pontos de
atenção são gravados mesmo quando o modelo falha — por isso a linha
existe de qualquer jeito.

**Para desfazer:** `select cron.unschedule('insights-diario');`

### E4. O que ele acrescenta

Pouco, no começo, e vale saber. Os **pontos de atenção** da tela Hoje já
funcionam sem nada disso, porque são SQL. O cron acrescenta os **padrões
observados** e as **previsões qualitativas**, e essas só terão o que
dizer depois de algumas semanas de dado real.

Você também não precisa dele para usar a IA: o botão **Analisar agora**,
no cartão de Previsões, roda a mesma análise na hora.

---

## G — App no celular, do zero ao instalado

O Expo Go da Play Store **não serve**: ele está no SDK 54 e o projeto no
57. Você gera o próprio APK, o que resolve isso e é o que você quer no
fim das contas.

### G1. Preparar

```
cd C:\Users\andrin\Desktop\almoOS\app-movel
```

```
npm install
```

```
npx expo install --check
```

Use o **cmd**, não o terminal do VS Code — foi lá que o Git funcionou.

### G2. Conta no Expo

```
npx eas-cli@latest login
```

Se não tiver conta, crie em expo.dev. É gratuita e o plano free cobre
builds Android.

```
npx eas-cli@latest build:configure
```

### G3. Preencher as chaves

Abra `app-movel/eas.json`. As duas chaves do Supabase precisam estar nos
**três** perfis: `development`, `preview` e `production`. O build roda na
nuvem e não enxerga o seu `.env`.

Já estão preenchidas nos três — só confira se são as mesmas do
`.env.local`.

### G4. Development build

Este é o APK para desenvolver: ele carrega o código do seu PC e
recarrega quando você altera algo.

```
npm run dev-build
```

De 10 a 25 minutos. O EAS devolve um link.

1. Abra o link **no celular**, baixe e instale
2. O Android vai pedir para permitir instalação de fonte desconhecida —
   permita
3. No cmd: `npx expo start --dev-client`
4. Abra o app instalado e leia o QR code do terminal
5. Entre com o mesmo e-mail e senha do site

### G5. APK de uso

Quando o app estiver como você quer, gere o autônomo — este abre sozinho,
sem o seu computador ligado, e é o que vai para a ronda:

```
npm run apk
```

Instale por cima; é o mesmo pacote, então substitui.

A diferença: o `development` recarrega do seu PC e serve para
desenvolver; o `preview` tem o código embutido. Toda mudança de código
exige `npm run apk` de novo.

### G6. O teste que decide

Antes de usar numa ronda de verdade:

1. Entre no app com internet e deixe sincronizar
2. **Modo avião**
3. Lance uma sala inteira, registre um consumo, escaneie um item
4. Abra **Sincronização** e confira que tudo está listado
5. **Feche o app pela lista de recentes e abra de novo** — a fila
   continua lá?
6. Desligue o modo avião, toque em "Enviar agora"
7. Abra o site e confira que os lançamentos chegaram

O passo 5 é o que importa. Fila que some ao fechar o app é pior do que
não ter fila, porque você só descobre depois de já ter confiado.

### G7. Se der errado

**"Project is incompatible with this version of Expo Go"** — você leu o
QR com o Expo Go em vez do app que instalou. Use o seu.

**Build falha com erro de versão de pacote** — `npx expo install --check`
e aceite as correções.

**App abre e fica em branco** — provável falta das chaves no `eas.json`
do perfil que você construiu.

---

## F — Verificar o banco (pode esperar)

Deixe para quando não estiver com pressa. Serve para confirmar que as
triggers estão corretas antes de acumular muito histórico.

1. No Supabase, **New project**, nome `cetec-teste`. Gratuito e
   descartável.
2. No cmd, gere o arquivo com todas as migrations juntas:

```
cd C:\Users\andrin\Desktop\almoOS
powershell -Command "$sql = Get-ChildItem supabase\migrations\*.sql | Sort-Object Name | ForEach-Object { [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8) }; [IO.File]::WriteAllText(\"$PWD\supabase\tudo.sql\", ($sql -join \"`n`n\"), (New-Object Text.UTF8Encoding $false))"
```

3. Abra `supabase\tudo.sql` e confira que os acentos estão certos
   (`Privilégios`, não `PrivilÃ©gios`).
4. **Confirme no topo da tela que você está no `cetec-teste`**, não no
   `almoOS`. Os testes gravam dados de verdade.
5. No SQL Editor, três execuções: `tudo.sql`, depois `seed.sql`, depois
   `tests\01_regras.sql`.

Passou se aparecerem os avisos `... testes OK` e nenhum erro vermelho.
Depois apague o projeto de teste.

---

## O que não está feito

- Etapa 8: Google Calendar e Gmail. Depende do TI da UCS.
- Encaminhamento automático do e-mail do SERVi. Manual funciona.
- Usar o sistema por duas semanas antes de construir mais qualquer coisa.
