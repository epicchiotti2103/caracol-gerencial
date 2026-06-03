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
  source: string; // nf_invoices | nf_receivables | fechamento | gerencial_transactions
  id: string;
  descricao: string;
  tipo: DashboardItemTipo;
  status: DashboardItemStatus;
  moeda: Moeda;
  amount: number;
  due_date?: string | null; // YYYY-MM-DD
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
}

export interface CashflowResponse {
  today: string; // YYYY-MM-DD
  overdue: CashflowOverdue;
  months: CashflowMonth[];
}
