# Caracol Gerencial

App de controle financeiro interno da Caracol. Etapa 4 do eixo financeiro (apos NF a Pagar, NF a Receber, e Fechamento de Campanha).

## O que faz

- **Cadastro de transacoes** que nao estao em outras fontes:
  - Despesas: salario, custo fixo, avulsos
  - Receitas: parceiro sem nota, avulsas
- **Dashboard mensal** (Fase 4.2) agregando 4 fontes:
  - NF a Pagar (`nf_invoices`)
  - NF a Receber (`nf_receivables`)
  - Fechamento de campanha (`campanhas_fechamento_mensal`)
  - Transacoes proprias (`gerencial_transactions`)
- Por moeda (BRL/USD) e entidade (Caracol BR / LLC)
- **Previsto vs realizado** + provisionamento

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

- **Fase 4.1** (atual): scaffold + backend pronto + login SSO. Pagina inicial e placeholder.
- **Fase 4.2**: tela de transacoes (CRUD) + dashboard agregado.
