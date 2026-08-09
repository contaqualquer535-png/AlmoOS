# Sistema de Gestão CETEC

Gestão administrativa interna do CETEC / UCS: ronda de verificação das
salas, estoque de copa e manutenção, inventário e almoxarifado, tarefas,
chamados ao SEAMB e relatórios.

Princípio do projeto: **o dado nasce da captura em campo**. Relatório,
alerta e sugestão da IA são derivados — nunca digitados numa tabela.

## Estado

Etapas 1 a 3b concluídas: schema, dashboard, lançamento pela web e planta
interativa.

| # | Etapa | Estado |
|---|-------|--------|
| 1 | Schema Supabase + carga inicial dos ambientes | **pronto** |
| 2 | Dashboard: tela inicial + plano do dia | **pronto** |
| 3 | Lançamento web: ronda e suprimentos | **pronto** |
| 3b | Planta interativa: índice, detalhe e editor de layout | **pronto** |
| 4 | App React Native: ronda e suprimento, offline-first | **pronto** |
| 5 | App: scanner de código de barras | **pronto** |
| 6 | Relatórios + Edge Function de insights | **pronto** |
| 7 | Chat com IA e tool use | **pronto** |
| 7b | Ingestão dos e-mails do SERVi (OTRS da UCS) | **pronto** |
| 8 | Google Calendar / Gmail (depende do TI da UCS) | — |

Do código ao sistema em uso, na ordem certa:
[`docs/COLOCAR_NO_AR.md`](docs/COLOCAR_NO_AR.md).
Instalação detalhada, chave por chave: [`docs/GUIA.md`](docs/GUIA.md).

## Estrutura

```
app/
  (app)/hoje         resumo do dia
  (app)/ronda        lançamento do checklist, sala a sala
  (app)/inventario   patrimônio, empréstimo e histórico de movimentação
  (app)/notas        anotações livres, sem estrutura
  (app)/salas        todos os ambientes; cadastro e edição
  (app)/salas/:cod   linha do tempo de um ambiente e contagem no tempo
  (app)/recursos     extensão, cabo, controle: quantos há e com quem
  (app)/suprimentos  consumo e reposição
  (app)/assistente   chat com ferramentas, escrita sob confirmação
  (app)/importar     carga de CSV: patrimônio, ronda em papel, chamados
  (app)/relatorios   agregação por período, ao vivo e congelada
  (app)/pendencias   o que está aberto e o material de cada uma
  (app)/roteiro      folha de reparos imprimível, por bloco
  (app)/tarefas      tarefas internas e chamados ao SEAMB
  (app)/chamados/:id conversa do chamado, vinda dos e-mails do SERVi
  (app)/planta/:cod  planta da sala; o índice foi absorvido por /salas
  (app)/plano        folha de trabalho imprimível
  login         e-mail/senha e Google
lib/
  data/consultas.ts  leitura
  data/mutacoes.ts   escrita (Server Actions)
  supabase/     clientes de servidor e navegador
  types/        tipos do schema
components/
supabase/
  migrations/   aplicadas em ordem pelo nome do arquivo
  rollback/     um .down.sql por migration, ordem inversa
  tests/        bootstrap do ambiente + testes de regra
  seed.sql      ambientes, turmas, checklist e suprimentos reais
scripts/
  verificar.sh  aplica, testa e reverte num banco descartável
docs/
  ADR.md        por que o schema é assim
```

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do seu projeto
supabase db push             # aplica as migrations
npm run dev
```

Para validar o ciclo inteiro num PostgreSQL qualquer, sem Supabase CLI:

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres ./scripts/verificar.sh
```

O script cria um banco descartável, aplica as migrations, roda o seed e
os testes de regra, reverte tudo e confere que o schema `public` volta
vazio. Ele falha com código de saída diferente de zero se qualquer etapa
quebrar — serve como gate de CI sem configuração adicional.

`supabase/tests/00_bootstrap_supabase.sql` cria os objetos que o Supabase
já fornece (schema `auth`, `auth.users`, `auth.uid()`, roles `anon` e
`authenticated`). Não é uma migration e não deve ser aplicado no projeto
real.

## Modelo de dados em uma passada

**Locais.** Tabela única de ambientes físicos, incluindo almoxarifado e
um destino `EXTERNO`. `ronda_padrao` marca quem entra no checklist de 8
itens; banheiros, sala dos professores e o Teatrinho ficam de fora.

**Ronda.** `verificacoes` grava o que foi tocado (✓ / M / X / T) por
local, item e data — um registro por combinação, o que torna a
sincronização offline idempotente. Uma trigger deriva `pendencias`: `M`
abre, `X` ou `T` fecha. Só existe uma pendência aberta por local+item,
garantido por índice único parcial.

**Estoque.** `movimentos_suprimento` é o log; `suprimentos.quantidade_atual`
é mantida por trigger. Consumo médio e previsão de esgotamento saem de
`vw_suprimentos_status`, calculados sobre os últimos 30 dias.

**Inventário.** `movimentacoes_inventario` é o log; o estado do item
(local atual, responsável, previsão de devolução) é projeção mantida por
trigger. `emprestado` é coluna gerada — não pode divergir de "tem
responsável".

**Planta.** `plantas` guarda grid e elementos como JSON; `classes_status`
é log append-only por classe e o estado vigente sai de
`vw_classes_status_atual`. `vw_plantas_resumo` traz, por sala, a turma
vigente e quantas classes estão quebradas ou faltando. Decisão 01 do ADR: a planta é
documentação visual e não alimenta o item "Mesas/Cadeiras" da ronda.

**Plano do dia.** `montar_plano_do_dia(data)` devolve JSON com pendências,
suprimentos críticos, tarefas, chamados e locais que ainda faltam na
ronda. Recebe a data como parâmetro para permitir reconstruir o plano de
um dia passado. É a fonte única do dashboard e do PDF imprimível.

## Convenções

- Nomes de objetos em português, alinhados ao vocabulário do dia a dia.
- Toda tabela tem `criado_em`; tabelas mutáveis têm `atualizado_em`
  mantido pela trigger `set_atualizado_em()`.
- Toda função declara `set search_path = ''` e qualifica os objetos.
- Toda view usa `security_invoker = true`.
- Regra de negócio que protege integridade fica no banco (trigger ou
  constraint). Regra de apresentação fica na aplicação.
- Migration nunca é editada depois de aplicada — corrige-se com uma nova.
