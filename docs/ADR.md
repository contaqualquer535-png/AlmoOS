# Registro de decisões de arquitetura

Cada decisão registra o problema, a escolha e o que ela custa. Quem for
alterar o schema depois deve ler isto antes — várias escolhas parecem
arbitrárias sem o contexto.

---

## 01 — A planta da sala é camada visual, não fonte da ronda

**Problema.** O rascunho tinha `classes_status` (estado por classe no
grid) e o item "Mesas/Cadeiras" do checklist descrevendo a mesma
realidade. Duas fontes de verdade para o mesmo fato.

**Decisão.** A planta é documentação visual. O item "Mesas/Cadeiras"
continua sendo um toque na ronda, e não há trigger nem derivação ligando
as duas coisas.

**Por quê.** A ronda percorre 17 salas em seg/qua/sex. Marcar classe a
classe no grid multiplicaria o tempo de captura por um ganho de precisão
que ninguém pediu. A planta serve para responder "qual cadeira?" quando o
problema já existe, e para montar layout — não para o registro diário.

**Custo aceito.** Se a planta disser que 3 classes estão quebradas e o
checklist marcar ✓, ninguém reclama. É divergência tolerada de propósito.

**Se mudar de ideia.** Fazer o item derivar da planta é aditivo: bastaria
uma view e uma flag por local dizendo qual dos dois é a fonte. Nenhuma
tabela precisa mudar.

---

## 02 — `verificacoes` é registro de campo; `pendencias` é ciclo de vida

**Problema.** No rascunho, `verificacoes.status` misturava condição
(`ok`, `manutencao`) com evento (`resolvido`, `trocado`). O relatório
semanal "itens M→X resolvidos" exigiria comparar linhas entre datas, e
"há quantos dias essa cadeira está quebrada" seria impossível de
responder.

**Decisão.** `verificacoes` guarda o que foi tocado numa data,
preservando os quatro códigos da planilha (✓/M/X/T). `pendencias` é a
máquina de estados, derivada por trigger: `M` abre, `X`/`T` fecha com o
tipo de resolução. A aplicação nunca escreve em `pendencias`.

**Nota sobre append-only.** Na conversa inicial descrevi `verificacoes`
como append-only. Não deu para manter: o índice único
`(local_id, item_id, data)` é o que garante idempotência da
sincronização offline, e ele obriga a correção do mesmo dia a ser um
UPDATE. A escolha foi ficar com a idempotência — sem ela, uma
sincronização repetida duplica a ronda inteira. O histórico entre dias
continua sendo log íntegro, e a trigger trata a correção explicitamente
(um `M` corrigido para `ok` descarta a pendência que ele mesmo abriu).

**`ok` não fecha pendência.** O encerramento é explícito, via `X` ou `T`,
como já é a convenção na planilha em uso.

---

## 03 — Tarefa e chamado são entidades distintas

**Decisão.** `tarefas` é o que o operador executa. `chamados` é o que sai
do CETEC para o SEAMB / manutenção predial.

**Por quê.** Os ciclos de vida não coincidem. A tarefa acaba quando ele
termina. O chamado depende de terceiro e precisa de protocolo externo,
data de envio e acompanhamento — daí `status_chamado` ter `rascunho`,
`enviado`, `em_atendimento`. Unificar em uma tabela com um campo `tipo`
deixaria metade das colunas nulas em metade das linhas.

**Rastreabilidade.** Ambas podem referenciar `pendencia_id`, o que fecha
o circuito: item marcado `M` na ronda → pendência → chamado ao SEAMB →
`X` na ronda seguinte.

---

## 04 — `salas` virou `locais`; almoxarifado é uma linha

**Problema.** `inventario.local_atual text` misturava UUID de sala com a
string `'almoxarifado'`. Todo filtro por local viraria `case`, e nenhum
FK protegeria a integridade.

**Decisão.** Uma tabela `locais` com `tipo` cobrindo sala, banheiro,
apoio, teatro, almoxarifado e externo. `inventario.local_atual_id` e
`local_padrao_id` são FKs normais; movimentação tem origem e destino
homogêneos.

**Ganho colateral.** Um segundo depósito, ou o Teatrinho virando local de
guarda de equipamento, é um `insert` — não uma migration.

---

## 05 — Operador único, com o caminho de upgrade preparado

**Decisão.** RLS com política única: autenticado tem acesso total,
anônimo não tem nada. Sem tabela de papéis, sem multi-tenant.

**O que foi preparado mesmo assim.** Toda tabela de captura grava
`registrado_por` com `auth.uid()` desde o primeiro registro. As políticas
estão isoladas na migration `0010` e nomeadas por tabela.

**Custo de mudar depois.** Criar `public.operadores (user_id, papel)` e
reescrever o `USING` das políticas. Um arquivo de migration, nenhuma
coluna alterada, nenhum dado histórico perdido — os registros antigos já
sabem quem os criou.

---

## 06 — Saldo de estoque no banco; consumo médio calculado

**Decisão.** `suprimentos.quantidade_atual` é mantida por trigger a
partir de `movimentos_suprimento`. Já `consumo_medio_dia` deixou de ser
coluna e virou cálculo em `vw_suprimentos_status`.

**Por quê a assimetria.** O saldo precisa ser transacional e o app móvel
sincroniza em lote, sem condições de calcular saldo confiável offline. Já
o consumo médio é estatística derivada: coluna materializada envelhece em
silêncio e é a primeira coisa a divergir do histórico.

**Saldo negativo é permitido.** Significa reposição não registrada. É
sinal a exibir no dashboard, não erro a bloquear — a captura acontece em
campo e não pode falhar por causa de um lançamento faltando.

**Sinal do movimento.** `quantidade` é assinada e há check por tipo:
consumo negativo, reposição positivo. A UI recebe número positivo do
operador e a camada de dados aplica o sinal.

---

## 07 — Views com `security_invoker`

Toda view no schema `public` é criada com `security_invoker = true`. Sem
isso, a view roda com privilégios do dono e contorna o RLS das tabelas de
base — é o vazamento clássico de RLS no Supabase. Vale para qualquer view
nova.

---

## 15 — Almoxarifado é uma leitura, não uma tabela

**Problema.** Suprimento, recurso e patrimônio ficam fisicamente na
mesma sala. O operador abre a porta e vê uma coisa só, mas o sistema
mostrava três telas.

**Decisão.** `vw_almoxarifado` une as três na leitura. As tabelas
continuam separadas, e cada natureza continua sendo editada na tela que
entende as regras dela.

**Por quê não fundir de verdade.** Saldo de café é mantido por trigger,
extensão tem retirada aberta com responsável, projetor tem número de
patrimônio e previsão de devolução. Uma tabela só deixaria dois terços
das colunas nulas em dois terços das linhas — que é exatamente o erro
que a decisão 04 corrigiu quando `inventario.local_atual` misturava uuid
com a string 'almoxarifado'.

**A relação é assimétrica, e isso é do domínio.** Todo suprimento e todo
recurso estão no almoxarifado; nem tudo no almoxarifado é suprimento. A
view reflete isso: suprimentos e recursos entram inteiros, patrimônio
entra pelo que estiver lá.

**Reativar em vez de recusar.** `nome` é único nas três tabelas e
"remover" desativa. Recriar um item removido batia numa restrição sobre
linha invisível, e a mensagem "já existe" soava como mentira. Agora o
cadastro reativa o original — o que também é o certo: duas linhas
"Apagador" dividiriam o saldo em dois.

---

## 14 — O modelo converte uma vez, na entrada

**Problema.** "Trocar pilha do relógio da sala C-212" contém local, item
e material — mas em linguagem. SQL não extrai isso, e o operador não vai
preencher três campos para anotar uma frase no corredor.

**Decisão.** O modelo interpreta a anotação **no momento em que ela é
gravada**, uma única vez, e o resultado vira tarefa com materiais. Dali
em diante é dado estruturado: o roteiro soma as pilhas, o plano do dia
agrega, o relatório conta. Nada volta a passar por modelo.

**Por quê a fronteira aqui.** É a divisão que já aparece nas decisões 09
e 13: modelo para linguagem, SQL para número. Interpretar frase é o
único ponto do sistema onde o modelo faz algo que o banco não faria — e
é onde ele erra pouco, porque o erro é visível na hora.

**A anotação é gravada antes da chamada ao modelo.** Se a interpretação
falhar, demorar ou vier ruim, o texto está salvo. Perder uma anotação
por causa de um enriquecimento opcional seria o pior desfecho possível,
já que a tabela existe justamente para não perder o que se anota.

**Ferramenta implícita é inferência desejada.** "Reapertar lâmpada do
teto" pede escada sem dizer escada. O prompt recebe a lista de
ferramentas e é instruído a incluí-las — é o tipo de dedução que
justifica o modelo estar ali.

**Local inventado é descartado.** O modelo às vezes propõe uma sala
plausível que não existe. A conversão só aceita código presente na
tabela; na dúvida, a tarefa fica sem local. Tarefa apontando para sala
inexistente seria pior do que tarefa sem local.

**A tela declara a procedência.** A anotação mostra o texto original e,
abaixo, marcado com "IA", o que foi deduzido. Confiança baixa vira aviso
explícito para conferir.

---

## 13 — Previsão aritmética antes de previsão de modelo

**Problema.** "A IA precisa prever coisas." Mas a maior parte do que se
quer prever aqui é conta: quando o café acaba é saldo dividido pelo
consumo médio; quando o projetor da K-302 quebra de novo é o intervalo
médio entre as ocorrências anteriores.

**Decisão.** `montar_previsoes()` calcula reincidência, esgotamento,
aceleração de consumo e salas acumulando. Nenhuma passa por modelo. O
modelo recebe essas previsões prontas e é instruído a **não repeti-las**,
produzindo só o que elas não capturam.

**Por quê.** Três razões, na ordem: não custa token, não alucina número,
e dá o mesmo resultado toda vez. Um número que vai virar argumento em
chamado ao SEAMB não pode variar conforme a temperatura do modelo.

**A tela separa as duas origens.** "O café acaba dia 14" e "parece haver
relação entre X e Y" têm graus de confiança muito diferentes, e a
separação é epistêmica, não organizacional — juntas numa lista só, a
segunda herdaria a autoridade da primeira. É a mesma regra da decisão 09.

**Análise sob demanda e agendada coexistem.** O cron garante leitura
recente ao chegar; o botão serve para depois de uma ronda pesada. As
duas chamam o mesmo prompt, que mora em `lib/ia/analise.ts` — duas
redações da mesma instrução divergem em um mês e ninguém percebe.

---

## 12 — Recurso é a terceira forma de "coisa"

**Problema.** Extensão elétrica não cabia em nada. `suprimentos` tem
quantidade mas é consumido e não volta. `inventario` volta, mas é peça
única com patrimônio. Extensão é quantidade **e** volta: você tem sete,
empresta três, quer saber quantas sobraram e com quem.

**Decisão.** Tabela `recursos` (quantidade total) e
`emprestimos_recurso` (uma linha por retirada aberta). Disponível é
total menos a soma das retiradas abertas, em `vw_recursos_status`.

**Por quê não etiquetar cada uma como patrimônio.** Resolveria no papel.
Na prática ninguém lê código de barras de extensão no corredor — contar
é o gesto natural para esse tipo de coisa, e o modelo tem que caber no
gesto.

**Devolução parcial abre linha nova.** "Levei 3, devolvi 1" fecha a
retirada original com quantidade 1 e cria outra com 2. Um decremento de
contador perderia justamente o que se quer saber depois: quem ainda está
com o quê.

**A guarda mora no banco.** Uma trigger recusa emprestar mais do que
existe. A aplicação não repete a conferência — duas verdades sobre
quantas extensões há seria pior do que nenhuma.

**Devolver nunca é bloqueado.** A trigger só roda em retirada aberta. Se
o número estiver errado, receber de volta é o que conserta.

---

## 11 — No app, espelho é descartável; fila não

**Problema.** O SQLite do aparelho guarda duas coisas muito diferentes:
cópia do que veio do servidor e registro que ainda não subiu. Tratar as
duas igual leva a perder dado ou a nunca conseguir atualizar nada.

**Decisão.** Tabelas de espelho (`locais`, `itens_checklist`,
`suprimentos`, `verificacoes_confirmadas`) são truncadas e reescritas
inteiras a cada download. A tabela `fila` só perde linha depois de o
servidor confirmar.

**Por quê.** O espelho não existe só no aparelho — perdê-lo custa um
download. A fila é o único lugar do mundo onde aquele toque existe.

**Chave da fila = índice único do servidor.** Para a ronda, a chave é
`verificacao:<local>:<item>:<data>`, espelhando o índice de
`verificacoes`. Consequência: corrigir o mesmo item substitui a linha em
vez de empilhar outra, e reenviar a fila duas vezes produz o mesmo
estado. A idempotência não é código do app, é o schema (decisão 02).

**Movimento de suprimento é a exceção.** É log append-only, sem chave
natural, então não há upsert que proteja. Na falha entre o insert e a
remoção da fila, um lançamento pode duplicar. Preferi duplicar a perder:
duplicata se conserta pela tela, registro perdido em campo não volta.

**A fila é visível.** Existe tela para ela. Confiança em app offline não
se pede, se demonstra — sem poder conferir que o registro está guardado,
o operador continua anotando no papel por via das dúvidas, e aí o app
não substituiu nada.

---

## 10 — Leitura o modelo faz; escrita o operador confirma

**Decisão.** Cada ferramenta em `lib/ia/ferramentas.ts` declara
`escreve: boolean`. As de leitura executam direto. As de escrita param o
fluxo: a rota devolve a proposta, a interface mostra o que vai ser
gravado, e só depois do clique a execução acontece.

**Por quê a assimetria.** Confirmar um SELECT não protege ninguém e
custa caro — ensina o operador a clicar em "sim" sem ler, o que anula a
confirmação justamente onde ela importa. Já um insert não tem desfazer
na interface.

**Onde a regra mora.** Em `app/api/assistente/route.ts`, num `if`, não
no prompt. Instrução de sistema é sugestão forte; um modelo levado a
ignorá-la ainda esbarra no código. O prompt inclusive manda o modelo
*não* perguntar "posso criar?" — quem pergunta é a tela.

**Teto de voltas.** Quatro idas e voltas por requisição. Sem isso, um
modelo em laço queima a cota gratuita do dia numa mensagem só.

---

## 09 — Alerta é SQL; padrão é modelo

**Problema.** A seção 7.1 da especificação pede "pontos de atenção
gerados pela IA". Mas a maior parte deles — "chamado aberto há 18 dias",
"café acaba em 15/01" — é subtração de datas, não inferência.

**Decisão.** `montar_contexto_para_insights()` calcula os pontos de
atenção em SQL e eles nunca passam por modelo. A chamada externa recebe
só os agregados e devolve apenas `padroes_identificados`. Na tela, os
dois aparecem em blocos separados, com procedência declarada.

**Por quê.** Três razões. Custo: o alerta diário roda sem consumir token.
Confiabilidade: um número que o operador vai usar para cobrar o SEAMB não
pode depender de um modelo ter lido a tabela direito. E honestidade de
interface: misturar fato apurado com interpretação num bloco só faz o
segundo herdar a autoridade do primeiro.

**Custo aceito.** O texto dos alertas é template de `format()`, mais duro
que prosa gerada. Vale a troca.

**Provedor é configuração.** `supabase/functions/insights/provedores.ts`
adapta Gemini e Claude atrás da mesma interface, escolhidos por variável
de ambiente. Sem chave, o job grava os pontos determinísticos e registra
o motivo em `insights_ia.erro` — nunca falha em silêncio.

---

## 08 — Enums nativos vs. tabelas de apoio

Enum nativo para conjunto fechado que faz parte da regra do domínio
(`status_verificacao`, `tipo_local`). Tabela para conjunto que o operador
amplia em tempo de execução (`itens_checklist`, `suprimentos`).

Para acrescentar valor a um enum depois: `ALTER TYPE ... ADD VALUE`, em
migration própria e isolada — o valor novo não pode ser usado na mesma
transação em que foi criado.
