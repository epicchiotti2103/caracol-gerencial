export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
}

// ----- Gerencial Transactions -----

export type TransactionKind = "despesa" | "receita";
export type Moeda = "BRL" | "USD";
export type CaracolEntity = "BR" | "LLC";

export interface GerencialTransaction {
  id: string;
  kind: TransactionKind;
  category: string;
  description: string;
  amount: number;
  moeda: Moeda;
  caracol_entity: CaracolEntity;
  reference_month: string; // ISO date YYYY-MM-DD
  due_date?: string | null;
  paid_at?: string | null;
  proof_path?: string | null;
  notes?: string | null;
  recurring: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
}

export interface GerencialTransactionCreate {
  kind: TransactionKind;
  category: string;
  description: string;
  amount: number;
  moeda: Moeda;
  caracol_entity: CaracolEntity;
  reference_month: string; // YYYY-MM (backend converte pra date)
  due_date?: string | null;
  notes?: string | null;
  recurring?: boolean;
}

export type GerencialTransactionUpdate = Partial<GerencialTransactionCreate>;

// ----- Dashboard agregado (Etapa 4.2) -----

export interface DashboardMoeda {
  a_receber: number;
  a_pagar: number;
  saldo_projetado: number;
  recebido_mes: number;
  pago_mes: number;
  saldo_realizado: number;
  breakdown_a_receber: {
    nf_receivables: number;
    fechamentos: number;
    transactions: number;
  };
  breakdown_a_pagar: {
    nf_invoices: number;
    transactions: number;
  };
}

export interface DashboardResponse {
  month: string; // YYYY-MM
  brl: DashboardMoeda;
  usd: DashboardMoeda;
}

export interface ForecastMonth {
  month: string; // YYYY-MM
  entrada_brl: number;
  saida_brl: number;
  entrada_usd: number;
  saida_usd: number;
}

export interface ForecastResponse {
  months: ForecastMonth[];
}

// Drill-down de competência (quais títulos compõem o mês)
export type DashboardItemTipo = "receber" | "pagar";
export type DashboardItemStatus = "realizado" | "pendente";

export interface DashboardItem {
  source: string; // nf_invoices | nf_receivables | fechamento_campanha | fechamento_publisher | gerencial_transactions
  id: string;
  descricao: string;
  tipo: DashboardItemTipo;
  status: DashboardItemStatus;
  moeda: Moeda;
  amount: number;
  due_date?: string | null; // YYYY-MM-DD
  // Itens vindos de fechamento de campanha travado ainda sem NF emitida
  // (a receber: source "fechamento_campanha"; a pagar a publisher: source "fechamento_publisher")
  sem_nf?: boolean;
  campanha_id?: string | null;
  campanha_name?: string | null;
  publisher?: string | null; // nome do publisher (lado a pagar)
  supplier_id?: string | null;
}

export interface DashboardItemsResponse {
  month: string; // YYYY-MM
  items: DashboardItem[];
}

// ----- Cashflow / Fluxo de caixa por vencimento (Etapa 4.3) -----

export type CashflowTipo = "pagar" | "receber";
export type CashflowSource = string; // nf_invoices | nf_receivables | campanhas_fechamento_mensal | gerencial_transactions

export interface CashflowItem {
  source: CashflowSource;
  id: string;
  descricao: string;
  tipo: CashflowTipo;
  moeda: Moeda;
  amount: number;
  due_date: string; // YYYY-MM-DD
  dias_atraso: number;
  previsto: boolean;
}

export interface CashflowOverdue {
  a_pagar_brl: number;
  a_pagar_usd: number;
  a_receber_brl: number;
  a_receber_usd: number;
  items: CashflowItem[];
}

export interface CashflowMonth {
  month: string; // YYYY-MM
  a_pagar_brl: number;
  a_pagar_usd: number;
  a_receber_brl: number;
  a_receber_usd: number;
  remessa_brl_out: number;
  remessa_usd_in: number;
  recebido_brl: number;
  recebido_usd: number;
  pago_brl: number;
  pago_usd: number;
}

export interface CashflowResponse {
  today: string; // YYYY-MM-DD
  anchor?: string; // YYYY-MM-DD — 1o dia do mês âncora da projeção (= start, ou mês atual)
  overdue: CashflowOverdue;
  months: CashflowMonth[];
  opening: { brl: number | null; usd: number | null };
}

// Drill-down do caixa realizado (compõe Recebido/Pago da projeção)
export interface CashflowComposeItem {
  source: string;
  descricao: string;
  tipo: "recebido" | "pago";
  moeda: Moeda;
  amount: number;
  date: string; // YYYY-MM-DD
}

export interface CashflowItemsResponse {
  month: string; // YYYY-MM
  items: CashflowComposeItem[];
}

// ----- Etapa 4.5: câmbio, saldo de abertura, remessa, conciliação -----

export interface FxRate {
  month: string; // YYYY-MM
  usd_brl: number | null;
  source_month: string | null; // YYYY-MM de onde veio (se herdada)
  inherited: boolean;
  updated_at?: string | null;
  by?: string | null; // nome de quem editou
}

export interface EditStamp {
  by: string | null;
  at: string | null;
}

export interface FxRatesResponse {
  rates: FxRate[];
}

export interface OpeningBalance {
  month: string; // YYYY-MM
  brl: number | null;
  usd: number | null;
}

export interface Remittance {
  id: string;
  data: string; // YYYY-MM-DD
  brl_out: number;
  usd_in: number;
  notes?: string | null;
  created_at?: string | null;
  by?: string | null; // nome de quem lançou
}

export interface RemittancesResponse {
  items: Remittance[];
}

export interface ReconciliationMoeda {
  abertura: number | null;
  recebido: number;
  pago: number;
  remessa_saida: number;
  remessa_entrada: number;
  movimento: number;
  esperado_fim: number | null;
  abertura_proximo: number | null;
  diferenca: number | null;
  abertura_meta?: EditStamp | null;
  abertura_proximo_meta?: EditStamp | null;
}

export interface ReconciliationResponse {
  month: string; // YYYY-MM
  next_month: string; // YYYY-MM
  brl: ReconciliationMoeda;
  usd: ReconciliationMoeda;
}
