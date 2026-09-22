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

// Dimensao CONTA: onde o dinheiro fica, por moeda (valores canonicos do backend)
export type Conta = string; // BRL: conta_corrente|investimento · USD: helmbank|tronlink

export interface ContaOption {
  value: string;
  label: string;
}

export interface ContasResponse {
  contas: Record<Moeda, ContaOption[]>;
  default: Record<Moeda, string>;
}

export interface GerencialTransaction {
  id: string;
  kind: TransactionKind;
  category: string;
  description: string;
  amount: number;
  moeda: Moeda;
  conta: Conta;
  caracol_entity: CaracolEntity;
  reference_month: string; // ISO date YYYY-MM-DD
  due_date?: string | null;
  paid_at?: string | null;
  proof_path?: string | null;
  notes?: string | null;
  recurring: boolean;
  recurring_id?: string | null; // modelo recorrente que gerou o lancamento
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
}

// Modelo de lancamento recorrente (gerencial_recurring). Backend materializa
// um lancamento por mes entre start_month e end_month (ou mes corrente + 1).
export interface GerencialRecurring {
  id: string;
  kind: TransactionKind;
  category: string;
  description: string;
  amount: number;
  moeda: Moeda;
  conta: Conta;
  caracol_entity: CaracolEntity;
  day_of_month: number;
  start_month: string; // YYYY-MM
  end_month: string | null; // YYYY-MM
  active: boolean;
}

export type GerencialRecurringCreate = Omit<GerencialRecurring, "id">;

export interface GerencialTransactionCreate {
  kind: TransactionKind;
  category: string;
  description: string;
  amount: number;
  moeda: Moeda;
  conta?: Conta | null; // null = conta default da moeda
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

// Saldo de caixa por conta (abertura + movimentos conta-aware do mes).
// total = soma das contas da moeda. Chaves internas de `contas` = valores de conta.
export interface SaldoContasMoeda {
  total: number;
  contas: Record<string, number>;
}

// Atencao ao casing do backend: dashboard/cashflow usam chaves minusculas (brl/usd)
export interface SaldoContas {
  brl: SaldoContasMoeda;
  usd: SaldoContasMoeda;
}

// Blocos do fechamento: mobile (tudo do Campanhas), talent (NFs com tag Talent),
// jobs (NFs com tag Jobs), empresa (salario, avulsos, resto). Opcional: backend
// pode ainda nao expor; chave ausente (ex: `jobs` antes do deploy) = zero.
export type Grupo = "mobile" | "talent" | "jobs" | "empresa";

export type GruposResultado = Partial<Record<Grupo, { brl: ResultadoAnualMoeda; usd: ResultadoAnualMoeda }>>;

// Par fornecedor/campanha em que a divida pode estar contada 2x (informativo)
export interface AlertaDoubleCount {
  supplier_id: string;
  supplier_name?: string | null;
  campanha_id: string;
  campanha_name?: string | null;
  mes: string;
  invoice_id: string;
  invoice_number?: string | null;
  valor_nf: number;
  valor_fechamento: number;
  moeda: Moeda;
}

export interface DashboardResponse {
  month: string; // YYYY-MM
  brl: DashboardMoeda;
  usd: DashboardMoeda;
  saldo_contas?: SaldoContas;
  grupos?: GruposResultado;
  alertas_double_count?: AlertaDoubleCount[];
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
  grupo?: Grupo;
  // Contexto da NF (opcional; backend em rollout). Ausente => card mostra so `descricao`.
  counterparty?: string | null; // fornecedor (a pagar) ou cliente (a receber)
  tag_name?: string | null;
  nf_number?: string | null;
  nf_description?: string | null;
  nf_id?: string | null;
  nf_kind?: "invoice" | "receivable" | null;
}

export interface DashboardItemsResponse {
  month: string; // YYYY-MM
  items: DashboardItem[];
  alertas_double_count?: AlertaDoubleCount[];
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
  saldo_contas?: SaldoContas; // saldo de caixa por conta (chaves brl/usd minúsculas)
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
  brl: number | null; // total (soma das contas) ou null
  usd: number | null;
  // Atencao ao casing: opening-balance usa chaves MAIUSCULAS (BRL/USD), e o
  // valor e um mapa PLANO {conta: amount} (so contas informadas aparecem).
  contas?: {
    BRL: Record<string, number>;
    USD: Record<string, number>;
  };
}

export interface Remittance {
  id: string;
  data: string; // YYYY-MM-DD
  brl_out: number;
  usd_in: number;
  brl_conta?: string | null; // conta BRL de origem
  usd_conta?: string | null; // conta USD de destino
  notes?: string | null;
  created_at?: string | null;
  by?: string | null; // nome de quem lançou
}

export interface RemittancesResponse {
  items: Remittance[];
}

// ----- Transferência interna (entre contas da MESMA moeda) -----

export interface Transfer {
  id: string;
  data: string; // YYYY-MM-DD
  moeda: Moeda;
  from_conta: string;
  to_conta: string;
  amount: number;
  notes?: string | null;
  created_at?: string | null;
  by?: string | null;
}

export interface TransfersResponse {
  items: Transfer[];
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

// GET /gerencial/resultado-anual?year=&from= — agregado do "Resultado anual".
// Os 4 campos por moeda sao identicos aos de /gerencial/dashboard?month= (brl/usd).
export interface ResultadoAnualMoeda {
  recebido_mes: number;
  a_receber: number;
  pago_mes: number;
  a_pagar: number;
}

// Status do mês no Resultado anual (backend: tracker slug resultado-anual-previsao).
// Opcional: enquanto o backend não mandar, o front deduz "em_andamento" pelo mês corrente.
export type ResultadoAnualStatus = "fechado" | "previsao" | "em_andamento";

// Previsão de Campanhas ainda sem fechamento, somada ao valor real do mês.
export interface ResultadoAnualPrevisao {
  brl: { a_receber: number; a_pagar: number };
  usd: { a_receber: number; a_pagar: number };
  campanhas: { campaign_id: string; campaign_name: string }[];
}

export interface ResultadoAnualMes {
  month: string;
  brl: ResultadoAnualMoeda;
  usd: ResultadoAnualMoeda;
  grupos?: GruposResultado;
  status?: ResultadoAnualStatus;
  previsao?: ResultadoAnualPrevisao | null;
}

export interface ResultadoAnualResponse {
  year: number;
  from: string; // YYYY-MM
  months: ResultadoAnualMes[];
  fx: { month: string; usd_brl: number | null; inherited: boolean }[];
}
