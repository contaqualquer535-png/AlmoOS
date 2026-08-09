# Guia de instalação

Do zero até o dashboard rodando em produção. Cada passo diz o que você
precisa em mãos e como confirmar que deu certo.

Tempo estimado: 40 minutos na primeira vez.

---

## O que você vai precisar

| Item | Onde consegue | Custo |
|---|---|---|
| Conta Supabase | supabase.com | grátis no plano free |
| Conta Vercel | vercel.com | grátis no plano hobby |
| Repositório Git | GitHub | grátis |
| Node.js 20 ou superior | nodejs.org — versão LTS | — |

O Supabase CLI não precisa ser instalado: use `npx supabase ...`, que
baixa a ferramenta na hora. Instalar global (`npm i -g supabase`) falha
com frequência no Windows.

Nada aqui exige liberação do TI da UCS. Isso só entra na etapa 8
(Calendar e Gmail), que ainda não foi construída.

---

## 1. Criar o projeto no Supabase

1. Em supabase.com, **New project**.
2. Nome: `cetec-sistema`. Região: **South America (São Paulo)** — é a
   mais próxima e reduz a latência de cada consulta.
3. Guarde a senha do banco que ele pede. Você vai precisar dela no passo
   3 e ela não aparece de novo.

## 2. Pegar as duas chaves

No painel do projeto, **Settings → API**. Copie:

| Nome no painel | Vai para a variável |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Project API keys → `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

**Nenhuma das duas é secreta.** Ambas aparecem no navegador de quem
acessa o site, e é assim mesmo que deve ser: quem protege os dados é o
RLS do banco, não o sigilo da chave. Por isso elas têm o prefixo
`NEXT_PUBLIC_`.

A chave `service_role`, na mesma tela, **é secreta e não é usada por
este projeto**. Ela ignora o RLS inteiro. Não coloque em variável de
ambiente do Vercel, não commite, não cole em chat. Ela só vai aparecer
na etapa 6, dentro de uma Edge Function, que roda no servidor do
Supabase e nunca no navegador.

Localmente, no PowerShell:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

No Mac ou Linux, `cp .env.example .env.local`.

Cole os dois valores depois do sinal de igual, sem aspas e sem espaço.

## 3. Aplicar o schema

```powershell
npm install
npx supabase login
npx supabase link --project-ref SEU_REF   # o ref está na URL do painel
npx supabase db push                      # aplica supabase/migrations/
npx supabase db query --file supabase/seed.sql
```

Isso carrega os ambientes reais: 25 locais, 17 turmas, 8 itens de
checklist, 9 suprimentos e a planta padrão das 17 salas de aula.

Se você já tinha aplicado o schema antes da etapa 3b, o `db push` aplica
só a migration nova (`...120000_vw_plantas_resumo`) e o seed acrescenta
as plantas sem tocar no resto — ele é idempotente.

**Sem terminal, se preferir.** As migrations são arquivos de texto comuns.
Abra o **SQL Editor** no painel do Supabase e cole o conteúdo de cada
arquivo de `supabase/migrations/` na ordem numérica, rodando um de cada
vez — `...090000` primeiro, `...090900` por último. Depois cole o
`supabase/seed.sql`. O resultado é idêntico; o CLI só automatiza esse
copiar e colar.

O seed é idempotente — rodar duas vezes não duplica nada.

**Confira:** em **Table Editor**, a tabela `locais` deve ter 25 linhas e
`itens_checklist` 8.

**Ajuste que provavelmente você precisa fazer:** as alocações de turma no
seed assumem semestre começando em `2026-08-01`. Se for outra data, mude
a linha `date '2026-08-01'` no `seed.sql` antes de rodar.

## 4. Criar seu usuário

**Authentication → Users → Add user → Create new user.** Use o e-mail
institucional e uma senha. Marque *Auto Confirm User*, senão o Supabase
espera confirmação por e-mail e você não entra.

Este é o único usuário do sistema. O RLS libera tudo para qualquer
autenticado, então **não crie outros usuários** sem antes ler a decisão
05 no `docs/ADR.md`.

## 5. Rodar local

```powershell
npm run dev
```

O terminal fica ocupado enquanto o site roda — é assim mesmo. Ctrl+C para
parar.

Abra `http://localhost:3000`. Você cai no login. Entre com o usuário do
passo 4.

Na primeira vez todos os suprimentos aparecem como "repor", porque o
estoque inicial é zero. Isso é esperado. Lance o estoque real assim, no
**SQL Editor** do Supabase:

```sql
insert into movimentos_suprimento (suprimento_id, tipo, quantidade, observacao)
select id, 'reposicao', 5, 'estoque inicial'
from suprimentos where nome = 'Café';
```

Dá para lançar pela interface também, em **Suprimentos** — o SQL acima só
é mais rápido para carregar vários itens de uma vez.

## 6. Entrar com a conta Google (opcional)

Só faz sentido se a conta Google Workspace da UCS permitir apps de
terceiros — a mesma dúvida que já está registrada como pendência na
especificação. Se não permitir, e-mail e senha resolvem.

1. No Google Cloud Console, crie um **OAuth 2.0 Client ID** do tipo *Web
   application*.
2. Em *Authorized redirect URIs*, cole a URL que o Supabase mostra em
   **Authentication → Providers → Google**. Ela termina em
   `/auth/v1/callback`.
3. Cole o Client ID e o Client Secret nesse mesmo painel do Supabase e
   ative o provedor.
4. Em **Authentication → URL Configuration**, ponha o domínio de produção
   em *Site URL* e adicione `https://SEU-DOMINIO/auth/callback` em
   *Redirect URLs*. Sem isso o login funciona local e quebra em produção.

O Client Secret do Google é secreto de verdade. Ele fica guardado no
Supabase e nunca no repositório.

## 6b. Insights automáticos (opcional)

Os **pontos de atenção** — chamado parado, estoque baixo, prazo vencido,
ronda incompleta — são calculados em SQL e já aparecem na tela Hoje sem
nenhuma configuração. Não dependem de IA e não custam nada.

O que a Edge Function acrescenta são os **padrões observados**: leitura
do conjunto que só aparece comparando semanas e blocos. Isso, sim, passa
por um modelo de linguagem.

**Escolha do provedor.** A função aceita dois, e a escolha é variável de
ambiente:

| Provedor | Variáveis | Custo |
|---|---|---|
| Gemini | `GEMINI_API_KEY`, do Google AI Studio | gratuito, **sem cartão**, com limite por minuto e por dia |
| Compatível com OpenAI | `IA_BASE_URL`, `IA_API_KEY`, `IA_MODELO` | depende do serviço; cobre Groq, OpenRouter, Together e Ollama local |
| Claude | `ANTHROPIC_API_KEY`, do console.anthropic.com | créditos pré-pagos |

Nenhuma assinatura de chat — nem Claude Pro, nem Google AI Pro — dá
acesso à API. São produtos separados nos dois casos.

**A chave gratuita do Gemini não pede cartão.** Cartão só entra se você
quiser sair da camada gratuita. Vale saber a diferença: na gratuita, o
Google usa o conteúdo enviado para melhorar produtos e revisores humanos
podem lê-lo; na paga, não. O contexto enviado por esta função é agregado
e não inclui nome de pessoa — ver decisão 09 do ADR.

Para usar Ollama na sua máquina, com o site rodando local:

```powershell
npx supabase secrets set PROVEDOR_IA=compativel
npx supabase secrets set IA_BASE_URL=http://localhost:11434/v1
npx supabase secrets set IA_MODELO=llama3.1
```

Note que a Edge Function roda no servidor do Supabase e **não** alcança
seu `localhost` — Ollama só serve quando você roda a função localmente
com `npx supabase functions serve`.

Sem chave nenhuma configurada a função continua rodando: grava os pontos
determinísticos e registra na coluna `erro` que não houve análise.

```powershell
npx supabase secrets set GEMINI_API_KEY=sua_chave
npx supabase secrets set INSIGHTS_SEGREDO=algo_longo_e_aleatorio
npx supabase functions deploy insights
```

`INSIGHTS_SEGREDO` protege o endpoint: sem ele, qualquer um com a URL
dispara o job. Para trocar de provedor depois:
`npx supabase secrets set PROVEDOR_IA=claude`.

**Agendar.** No painel, **Integrations → Cron**, crie um job diário às
06:00 chamando a função por HTTP, com o header `x-insights-segredo`.

**Confira:** rode uma vez à mão e veja a linha aparecer em
`insights_ia`. A tela Hoje passa a mostrar "Padrões observados" na
coluna da direita.

## 6c. E-mails do SERVi (opcional, mas vale muito)

O SERVi notifica tudo por e-mail, e o assunto sempre traz
`[Chamado#001538977]`. Esse número é a chave: com ele, cada mensagem
encontra o chamado aqui dentro — e cria o chamado se ele ainda não
existir.

**Funciona hoje, sem configurar nada:** em **Tarefas**, ou na página de
um chamado, abra "Colar e-mail do SERVi" e cole a mensagem inteira.

**Automático**, se você criar a regra de encaminhamento:

```powershell
npx supabase secrets set EMAIL_SEGREDO=algo_longo_e_aleatorio
npx supabase functions deploy email-servi
```

A função fica em
`https://SEU_REF.supabase.co/functions/v1/email-servi?segredo=...`
e aceita POST em JSON. Ela reconhece os formatos do Postmark, do
SendGrid e o genérico — o segredo pode ir no header `x-email-segredo` ou
na querystring, porque nem todo serviço de entrada deixa configurar
header.

Você precisa de um serviço que receba e-mail e faça esse POST. Duas
opções sem custo:

| Serviço | Precisa de domínio? |
|---|---|
| Postmark Inbound | não — dá um endereço `@inbound.postmarkapp.com` |
| Cloudflare Email Routing + Email Worker | sim, um domínio no Cloudflare |

Depois, no Gmail da UCS: **Configurações → Filtros → Criar filtro**, com
remetente do SERVi, ação *Encaminhar para* o endereço do serviço. O
Gmail exige confirmar o endereço de destino uma vez.

**Idempotência.** A mensagem é gravada com o `Message-ID` do e-mail,
que é único. Reencaminhar a mesma mensagem não duplica nada — e a tela
avisa que já estava registrada.

**Fechamento é conservador.** O chamado só é marcado como concluído se o
assunto contiver "fechamento", "chamado fechado" ou "encerrad". Na
dúvida ele continua aberto: fechar sozinho o que ainda tramita
esconderia justamente o que está encalhado.

**Confira:** cole um e-mail à mão e veja o chamado aparecer em Tarefas,
com a mensagem na página dele.

## 7. Publicar no Vercel

1. Suba o repositório no GitHub.
2. No Vercel, **Add New → Project** e importe o repositório. Ele detecta
   Next.js sozinho.
3. Em **Environment Variables**, adicione as duas do passo 2, marcando
   *Production*, *Preview* e *Development*.
4. **Deploy.**

**Confira:** abra a URL, entre, e a tela Hoje carrega com os 17 azulejos
de sala — as que entram na ronda padrão.

Se você usar domínio próprio, volte ao passo 6.4 e atualize as URLs no
Supabase.

---

## Resumo das chaves

| Chave | Secreta? | Onde vive | Usada por |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | não | `.env.local` e Vercel | site |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | não | `.env.local` e Vercel | site |
| Senha do banco Postgres | **sim** | seu gerenciador de senhas | `supabase link` |
| `service_role` key | **sim** | ainda não usada | Edge Function (etapa 6) |
| Google Client Secret | **sim** | painel do Supabase | login Google |
| `ANTHROPIC_API_KEY` | **sim** | ainda não usada | IA (etapas 6 e 7) |

Regra prática: se o nome começa com `NEXT_PUBLIC_`, o navegador vê. Se
não começa, nunca pode chegar no navegador.

---

## Verificar que está tudo íntegro

```bash
npm run typecheck    # tipos
npm run build        # compilação
./scripts/verificar.sh   # banco: aplica, testa e reverte
```

O `verificar.sh` precisa de um PostgreSQL onde você possa criar e
derrubar bancos. Rodando o Supabase local (`supabase start`), use:

```bash
PGHOST=localhost PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres ./scripts/verificar.sh
```

---

## Windows

**`cp` não é um comando reconhecido** — é do Unix. No PowerShell use
`Copy-Item origem destino`.

**`npm` não é reconhecido** — o Node.js não está instalado, ou o terminal
foi aberto antes da instalação. Instale o LTS de nodejs.org, feche todos
os terminais e abra um novo. Se persistir, reinicie o computador: o
Windows nem sempre atualiza o PATH sozinho.

**Abrir o terminal já na pasta certa** — no Explorer, dentro da pasta do
projeto, segure Shift, clique com o botão direito num espaço vazio e
escolha *Abrir janela do PowerShell aqui*.

**`npx supabase` pede confirmação na primeira vez** — responda `y`. Ele
baixa a ferramenta em cache e nas próximas vezes já vai direto.

---

## Quando algo der errado

**"Variável de ambiente NEXT_PUBLIC_SUPABASE_URL não definida"** — falta
o `.env.local`, ou você o criou depois de subir o `npm run dev`. Pare e
suba de novo; o Next só lê o arquivo na inicialização.

**Login aceita a senha e volta para a tela de login** — o usuário não foi
confirmado. Volte ao passo 4 e marque *Auto Confirm User*.

**Telas carregam vazias, sem erro** — RLS funcionando e você sem sessão
válida. Saia e entre de novo. Se persistir, confirme em **Table Editor →
locais → RLS** que a política `operador_acesso_total_locais` existe.

**"permission denied for table"** — a migration `0010` não foi aplicada.
Rode `supabase db push` de novo.

**Login com Google devolve `redirect_uri_mismatch`** — a URL no Google
Cloud não bate com a do Supabase. Elas precisam ser idênticas, incluindo
`https://` e sem barra no fim.
