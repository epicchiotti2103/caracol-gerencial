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
- **Fase 4.4** (atual): Fechamento ganhou toggle **Mês / Ano**. Mês mostra drill-down dos títulos (`/gerencial/dashboard/items`); Ano mostra resumo anual + gráfico do ano civil (`/gerencial/forecast?start=`). Corrige o bug em que o gráfico mostrava sempre os próximos 6 meses a partir de hoje, ignorando o mês selecionado.
