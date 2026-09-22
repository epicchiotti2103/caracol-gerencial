# Caracol Gerencial

App de controle financeiro interno da Caracol. Etapa 4 do eixo financeiro (apos NF a Pagar, NF a Receber, e Fechamento de Campanha).

## O que faz

- **Cadastro de transacoes** que nao estao em outras fontes:
  - Despesas: salario, custo fixo, avulsos
  - Receitas: parceiro sem nota, avulsas
  - **Mês de referência (competência)**: no form, nasce no mês selecionado na lista (não no mês corrente) e acompanha o vencimento enquanto o user não escolher o mês na mão. Aviso âmbar quando ref ≠ mês do vencimento (ou do pagamento, se sem vencimento). Dropdown de meses vai de jan/2026 (ou 12 meses atrás) até +12. "Marcar pago" sugere o vencimento como data (senão hoje).
- **Lançamentos recorrentes (modelos)** — aba "Recorrentes" na tela de Transações. Cada modelo (`gerencial_recurring`: tipo, categoria, descrição, valor, moeda, conta, país, dia do mês, mês início/fim, ativo) gera um lançamento por mês; o backend materializa sozinho ao listar transações/dashboard (até mês corrente + 1) e há o botão "Gerar <mês>" (`POST /gerencial/recurring/materialize?month=`). Desativar = `DELETE` (não apaga lançamentos já gerados). Lançamento gerado traz `recurring_id` e ganha badge "recorrente" que leva ao modelo. Endpoints: `GET/POST /gerencial/recurring`, `PATCH/DELETE /gerencial/recurring/{id}`. Se o `GET` falhar (migration ainda não aplicada), a aba mostra "Recurso aguardando ativação" e o resto da tela segue normal.
- **Dashboard com três visões** agregando 4 fontes (`nf_invoices`, `nf_receivables`, `campanhas_fechamento_mensal`, `gerencial_transactions`), por moeda (BRL/USD):
  - **Fechamento (competência)** — "o mês fechou no azul?". Tudo que pertence ao período de referência, independente de quando o dinheiro entra/sai. Tem um toggle **Mês / Ano**:
    - **Mês**: cards por moeda (recebido/pago, a receber/a pagar com breakdown expansível, **Resultado do mês = entradas − saídas**) + seção **"Detalhamento do mês"** que lista os títulos individuais (qual NF/transação/fechamento compõe cada bucket). Consome `/gerencial/dashboard?month=` e `/gerencial/dashboard/items?month=`.
      - **Blocos Mobile / Talent / Jobs / Empresa** (quando o backend manda `grupos` no `/dashboard` e `grupo` em cada item): no lugar dos cards por moeda, 4 blocos em R$ (entradas, saídas, resultado; US$ convertido pela mesma cotação do card consolidado) com detalhe por moeda secundário. **Mobile** = tudo do Campanhas (custo reembolsado + LL Caracol entram, publishers saem), **Talent** = NFs com tag Talent, **Jobs** = NFs com tag Jobs (a receber e a pagar), **Empresa** = salário, avulsos e resto. O card consolidado vira "Resultado do mês (Mobile + Talent + Jobs + Empresa)" e deve bater com a soma dos 4 blocos. Os cards por moeda ficam num toggle "Ver por moeda". O detalhamento ganha filtro Todos/Mobile/Talent/Jobs/Empresa. **Fallback**: grupo ausente em `grupos` (ex: `jobs` antes do backend expor) conta como zero; sem `grupos`/`grupo` na resposta, a tela continua com os cards por moeda de antes. Tipos opcionais em `types/index.ts` (`Grupo`, `GruposResultado`; `/resultado-anual` já tipado com `grupos?`, gráfico ainda não usa).
      - **Contexto da NF no item** (campos opcionais `counterparty`, `tag_name`, `nf_number`, `nf_description`, `nf_id`, `nf_kind` em `/dashboard/items`): título do card vira "<fornecedor/cliente> · NF <número>", linha secundária ganha badge da tag, descrição da NF aparece truncada e há link "abrir no NF" (`nf.aeobr.com.br/invoice/<id>` pra NF a pagar; NF a receber não tem rota de detalhe no NF, então abre `/?view=receber`). Sem esses campos, card mostra `descricao` como antes.
      - **Alerta de double-count**: se `/dashboard` trouxer `alertas_double_count` não vazio, card âmbar lista os pares fornecedor/campanha/NF (NF com competência no mês sem vínculo com a campanha) com link "ver sugestões de vínculo" → `https://nf.aeobr.com.br/sugestoes-vinculo?month=YYYY-MM` (mês selecionado). Informativo, não muda totais.
    - **Ano**: resumo anual por moeda (entradas/saídas/resultado do ano civil) + gráfico SVG de resultado por mês (Jan–Dez do ano selecionado). Consome `/gerencial/forecast?start=YYYY-01&months_ahead=11`.
  - **Fluxo de caixa (vencimento)** — "quanto preciso pagar e quando vence?". Regime de caixa, pela data de vencimento. Tem um bucket **"Em atraso"** em destaque no topo (alerta vermelho) com a pagar/a receber vencidos por moeda, expansível pra listar os títulos (descrição, valor, vencimento, dias de atraso, selo "previsto"), e uma timeline de a pagar/a receber por vencimento nos próximos meses com net de caixa. Consome `/gerencial/cashflow?months_ahead=6`.

  - **Resultado anual (competência, em R$)** — "o ano está dando lucro?". Filtro de ano. Só considera meses a partir de `RESULTADO_INICIO = '2026-05'` (dados anteriores não são confiáveis): em 2026 o eixo vai de mai a dez, o acumulado começa do zero em maio e nenhum mês anterior é buscado; nota "Dados a partir de mai/2026" na aba. Cards de total do ano (entradas, saídas, lucro/prejuízo acumulado) + 3 gráficos SVG jan–dez: **Entradas**, **Saídas** e **Net** (barras verde/vermelho + linha de lucro acumulado), e tabela de detalhe por mês. Consome 1 chamada agregada `GET /gerencial/resultado-anual?year=&from=` (por mês os mesmos campos `brl`/`usd` do `/gerencial/dashboard?month=` + `fx` → o net de cada mês bate com o card "Resultado do mês"; anti-double-count fica no backend). Se a rota falhar/não existir, cai no caminho antigo: `/gerencial/dashboard?month=` por mês + `/gerencial/fx-rates`, tudo em paralelo. Cache em memória por ano (trocar de ano e voltar não refaz fetch; o botão Atualizar ignora o cache) e skeleton no carregamento. O lado US$ vira R$ pela cotação **cadastrada no próprio mês**; mês sem cotação própria usa `USD_BRL_FALLBACK = 5,60` (marcado com `*`) — diferente do card consolidado do Fechamento, que herda a última cotação. Entradas e saídas em série única por enquanto (split custo fixo/variável pendente de classificação nos dados). **Corte até o mês vigente**: meses futuros não aparecem (gráficos, cards, tabela, acumulado) nem são buscados. O mês corrente sai hachurado/tracejado (legenda "Mês em andamento"). **Previsão Campanhas** (opcional, backend slug `resultado-anual-previsao`): cada mês pode trazer `status` (`fechado`/`previsao`/`em_andamento`) e `previsao` (`{brl,usd:{a_receber,a_pagar}, campanhas[]}`); a previsão é somada ao real pela mesma cotação e desenhada como segmento tracejado empilhado (tooltip com as campanhas sem fechamento), o acumulado a inclui e fica tracejado a partir do 1º mês com previsão/em andamento, a tabela ganha coluna "Previsão (net)" + badge, e os cards mostram "inclui previsão de R$ X". Sem esses campos, "em andamento" é deduzido pelo mês corrente e nada de previsão aparece.

> **Competência ≠ caixa.** Fechamento responde se o mês deu lucro; Fluxo de caixa responde quando o dinheiro de fato entra/sai. A aba de fluxo é tolerante a falha — se o endpoint `/cashflow` não estiver no ar, mostra erro só naquela aba, sem quebrar o Fechamento.

## Stack

- Next.js 14 + TypeScript + Tailwind v3 (mesmo tema laranja da suite)
- Auth via SSO no dominio `.aeobr.com.br` (cookie compartilhado)
- Backend: rotas `/api/v1/gerencial/*` em `tracker-caracol/backend/app/routes/gerencial.py`
- Banco (Supabase `vdjecbkmukjurhyvprug`): `gerencial_transactions`, `gerencial_recurring`, `gerencial_opening_balances`, `gerencial_remittances`, `gerencial_fx_rates`, `gerencial_transfers`

## Dimensão CONTA

Cada moeda tem **contas** onde o dinheiro fica (o total por moeda continua somando, ganha split por conta):
- **BRL**: `conta_corrente` ("Conta Corrente", default), `investimento` ("Investimento")
- **USD**: `helmbank` ("HelmBank", default), `tronlink` ("Tronlink (USDT)")

Valores canônicos ficam em `lib/contas.ts` (espelham `GET /gerencial/contas`). Onde a conta aparece: seletor no form de transação (opções dependem da moeda), saldo de abertura por conta (um input por conta), origem/destino da remessa (`brl_conta`/`usd_conta`), transferências internas entre contas da mesma moeda, e o split nos cards de saldo do dashboard (`saldo_contas`).

## Permissao

So `hub_role='admin'` acessa. Backend valida via `require_hub_admin`.

## Deploy

- URL prod: `https://gerencial.aeobr.com.br`
- Vercel auto-deploy em push pra `main`
- Framework Preset: **Next.js** (NUNCA "Other" — gotcha conhecido na suite)

## Env vars

- `NEXT_PUBLIC_API_URL=https://trk.aeobr.com.br`
- `NEXT_PUBLIC_HUB_URL=https://app.aeobr.com.br`

## Estado

- **Fase 4.1**: scaffold + backend pronto + login SSO.
- **Fase 4.2**: tela de transacoes (CRUD) + dashboard agregado.
- **Fase 4.3**: dashboard dividido em duas abas — **Fechamento** (competência) e **Fluxo de caixa** (vencimento + bucket "Em atraso"). Depende do endpoint `/api/v1/gerencial/cashflow` no backend.
- **Fase 4.4**: Fechamento ganhou toggle **Mês / Ano**. Mês mostra drill-down dos títulos (`/gerencial/dashboard/items`); Ano mostra resumo anual + gráfico do ano civil (`/gerencial/forecast?start=`). Corrige o bug em que o gráfico mostrava sempre os próximos 6 meses a partir de hoje, ignorando o mês selecionado.
- **Fase 4.5** (atual): consolidação multi-moeda + conciliação de caixa. **Requer migration 043** (3 tabelas: `gerencial_fx_rates`, `gerencial_opening_balances`, `gerencial_remittances`).
  - **Cotação do dólar por mês** (Fechamento): informa US$ 1 = R$ X, fica salva; mês sem cotação herda a última conhecida. Card **"Resultado consolidado (R$)"** soma os dois lados (USD × cotação) no Mês e no Ano — responde como o mês/ano realmente fechou. Endpoints `/gerencial/fx-rates` (GET) e `/gerencial/fx-rate` (PUT).
  - **Saldo de abertura + conciliação** (Fluxo de caixa): informa o saldo no dia 01 por moeda; o sistema calcula o esperado fim do mês (abertura + recebido − pago ± remessa) e compara com o saldo informado no dia 01 do mês seguinte (✓ bate / diferença). Endpoints `/gerencial/opening-balance` (GET/PUT) e `/gerencial/reconciliation` (GET). A timeline de vencimentos virou **projeção de saldo**: parte do saldo de abertura e corre mês a mês.
  - **Remessa internacional R$ → US$** (Fluxo de caixa apenas): registra R$ que saiu + US$ que chegou + data; diminui o real e aumenta o dólar no caixa. Não entra no Fechamento. Endpoints `/gerencial/remittances` (GET/POST/DELETE).
  - **"Editado por X em DATA"**: cotação, saldos de abertura e remessas mostram a última alteração (resolve `updated_by`/`created_by` pro nome).
- **Fase 4.6** (atual): caixa por regime de **liquidação** (paid_at/received_at), não competência.
  - **Projeção de caixa** (Fluxo): colunas **Recebido** e **Pago** = caixa que de fato moveu no mês (NF paga pela `paid_at`, recebida pela `received_at`, avulsos pela `paid_at`, taxa de lote pela `data`); a remessa entra embutida (US$ que chegou em Recebido, R$ que saiu em Pago); hover em Pago/Recebido quebra entre pagamentos e remessa. `/gerencial/cashflow` devolve `opening`, `remessa_*`, `recebido_*` e `pago_*` por mês. Sem isso, pagar uma NF fazia o saldo projetado subir indevidamente.
  - **Drill-down clicável**: clicar em Recebido/Pago abre um modal com os títulos que compõem aquele valor (NF/avulso/taxa/remessa), por data de liquidação, filtrados por moeda + tipo, com total. Endpoint `/gerencial/cashflow/items?month=`.
  - **Conciliação** passou a usar a mesma base de **caixa** (paid_at/received_at) que a projeção, pra os números de Recebido/Pago baterem entre as duas seções.
  - **Taxa de transferência** dos lotes de pagamento de NF entra como saída de caixa (depende da migration 044 no `caracol-nf`/backend; queries resilientes se a tabela não existir).
  - **Fix**: lista de Transações estava sempre vazia (lia `{items,total}` como array); e agora dá pra **ajustar a data de pagamento** de um lançamento já pago (botão ✓ reabre o modal com a data registrada) — útil quando a competência é de um mês mas o pagamento foi em outro.
- **Fase 4.7**: a aba **Fluxo de caixa** ganhou um **seletor de mês único no topo** que comanda a aba inteira. Com o backend aceitando `start=YYYY-MM` no `GET /gerencial/cashflow` (response traz `anchor`), a **"Projeção de caixa por vencimento"** passa a ancorar no mês selecionado (buckets a partir dele), o card **"Em atraso"** conta vencidos antes de 01/âncora, e o **"Saldo inicial"** é o de 01/âncora. O mesmo seletor controla a seção **"Caixa realizado de \<mês\>"** (Recebido/Pago/Movimento do mês, com drill-down por data de liquidação — `/gerencial/cashflow/items?month=`) e **"Saldos & conciliação"** (que perdeu o seletor próprio e usa o do topo). Escolher, ex., MAIO → projeção começa em Mai/26, "Em atraso" = vencidos antes de 01/05, "Saldo inicial (01/Maio/2026)".
- **Fase 4.8** (atual): dimensão **CONTA** por moeda (ver seção "Dimensão CONTA"). **Requer migration 059** (`gerencial_transactions.conta`, `gerencial_opening_balances.conta` na PK, `gerencial_remittances.brl_conta`/`usd_conta`, nova tabela `gerencial_transfers`, + RLS nas tabelas do gerencial). Mudanças na UI:
  - **Saldo em caixa por conta** (Fluxo): dois cards (R$/US$) mostram o saldo de cada conta + total por moeda, do bloco `saldo_contas` de `/gerencial/cashflow` (abertura + movimentos conta-aware do mês; NF a pagar/receber não têm conta).
  - **Saldo de abertura por conta**: "Saldos & conciliação" passou a ter **um input por conta**. ⚠ `PUT /gerencial/opening-balance` mudou o contrato: body agora é `{ month, balances: [{ moeda, conta, amount }] }` (não mais `{ month, brl, usd }`). GET devolve `contas: { BRL: {conta:amount}, USD: {conta:amount} }` (chaves de moeda MAIÚSCULAS) além do total `brl`/`usd`.
  - **Form de transação**: seletor de **Conta** (opções dependem da moeda; troca de moeda reseta pro default). Coluna **Conta** na tabela de transações.
  - **Remessa**: seletores de **conta origem (R$)** e **conta destino (US$)** → `brl_conta`/`usd_conta`.
  - **Transferência interna** (Fluxo): move saldo entre contas da mesma moeda (ex HelmBank ↔ Tronlink). Net-zero no total da moeda. Endpoints `/gerencial/transfers` (GET com `?month=`, POST, DELETE); lista/apaga as do mês.
  - ⚠ Casing do backend é assimétrico: `opening-balance.contas` usa chaves de moeda **MAIÚSCULAS** (`BRL`/`USD`) com mapa plano `{conta: amount}`; `dashboard`/`cashflow.saldo_contas` usa **minúsculas** (`brl`/`usd`) com `{ total, contas: {conta: val} }`.
