# Caracol Gerencial

App de controle financeiro interno da Caracol. Etapa 4 do eixo financeiro (apos NF a Pagar, NF a Receber, e Fechamento de Campanha).

## O que faz

- **Cadastro de transacoes** que nao estao em outras fontes:
  - Despesas: salario, custo fixo, avulsos
  - Receitas: parceiro sem nota, avulsas
- **Dashboard com duas visões** agregando 4 fontes (`nf_invoices`, `nf_receivables`, `campanhas_fechamento_mensal`, `gerencial_transactions`), por moeda (BRL/USD):
  - **Fechamento (competência)** — "o mês fechou no azul?". Tudo que pertence ao período de referência, independente de quando o dinheiro entra/sai. Tem um toggle **Mês / Ano**:
    - **Mês**: cards por moeda (recebido/pago, a receber/a pagar com breakdown expansível, **Resultado do mês = entradas − saídas**) + seção **"Detalhamento do mês"** que lista os títulos individuais (qual NF/transação/fechamento compõe cada bucket). Consome `/gerencial/dashboard?month=` e `/gerencial/dashboard/items?month=`.
    - **Ano**: resumo anual por moeda (entradas/saídas/resultado do ano civil) + gráfico SVG de resultado por mês (Jan–Dez do ano selecionado). Consome `/gerencial/forecast?start=YYYY-01&months_ahead=11`.
  - **Fluxo de caixa (vencimento)** — "quanto preciso pagar e quando vence?". Regime de caixa, pela data de vencimento. Tem um bucket **"Em atraso"** em destaque no topo (alerta vermelho) com a pagar/a receber vencidos por moeda, expansível pra listar os títulos (descrição, valor, vencimento, dias de atraso, selo "previsto"), e uma timeline de a pagar/a receber por vencimento nos próximos meses com net de caixa. Consome `/gerencial/cashflow?months_ahead=6`.

> **Competência ≠ caixa.** Fechamento responde se o mês deu lucro; Fluxo de caixa responde quando o dinheiro de fato entra/sai. A aba de fluxo é tolerante a falha — se o endpoint `/cashflow` não estiver no ar, mostra erro só naquela aba, sem quebrar o Fechamento.

## Stack

- Next.js 14 + TypeScript + Tailwind v3 (mesmo tema laranja da suite)
- Auth via SSO no dominio `.aeobr.com.br` (cookie compartilhado)
- Backend: rotas `/api/v1/gerencial/*` em `tracker-caracol/backend/app/routes/gerencial.py`
- Banco: `gerencial_transactions` no Supabase `vdjecbkmukjurhyvprug`

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
