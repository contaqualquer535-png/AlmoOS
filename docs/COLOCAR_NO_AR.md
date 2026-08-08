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

## E — Insights diários

```
cd C:\Users\andrin\Desktop\almoOS
npx supabase secrets set GEMINI_API_KEY=sua_chave
npx supabase secrets set INSIGHTS_SEGREDO=escolha_uma_senha_longa
npx supabase functions deploy insights
```

Depois, no painel do Supabase: **Integrations → Cron → Create job**,
diário às 06:00, chamando a função por HTTP com o header
`x-insights-segredo`.

Os **pontos de atenção** na tela Hoje já funcionam sem nada disso. Isto
acrescenta só os **padrões observados**, e eles só terão o que dizer
depois de algumas semanas de uso.

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
