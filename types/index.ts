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
