// Strings bilingual usadas em multiplas paginas.
// publisher -> en, demais -> pt.

export type Lang = "pt" | "en";

export const i18n = {
  invoices: { pt: "Notas", en: "Invoices" },
  myInvoices: { pt: "Minhas notas", en: "My invoices" },
  allInvoices: { pt: "Todas as notas", en: "All invoices" },
  newInvoice: { pt: "Nova NF", en: "New invoice" },
  newInvoiceCta: { pt: "+ Nova NF", en: "+ New invoice" },
  status: { pt: "Status", en: "Status" },
  all: { pt: "Todos", en: "All" },
  search: { pt: "Buscar por numero...", en: "Search by invoice #..." },
  invoiceNumber: { pt: "Numero da NF", en: "Invoice number" },
  amount: { pt: "Valor", en: "Amount" },
  dueDate: { pt: "Vencimento", en: "Due date" },
  referenceMonth: { pt: "Mes de referencia", en: "Reference month" },
  campaign: { pt: "Campanha", en: "Campaign" },
  pdfFile: { pt: "Arquivo PDF", en: "PDF file" },
  pdf: { pt: "PDF", en: "PDF" },
  publisher: { pt: "Publisher", en: "Publisher" },
  actions: { pt: "Acoes", en: "Actions" },
  approve: { pt: "Aprovar", en: "Approve" },
  reject: { pt: "Recusar", en: "Reject" },
  markPaid: { pt: "Marcar como paga", en: "Mark as paid" },
  cancel: { pt: "Cancelar", en: "Cancel" },
  confirm: { pt: "Confirmar", en: "Confirm" },
  send: { pt: "Enviar", en: "Send" },
  back: { pt: "Voltar", en: "Back" },
  downloadPdf: { pt: "Baixar PDF", en: "Download PDF" },
  noPdf: { pt: "Sem PDF", en: "No PDF" },
  noInvoices: { pt: "Nenhuma NF.", en: "No invoices." },
  invoiceCreated: { pt: "NF enviada", en: "Invoice sent" },
  approvedBy: { pt: "Aprovada por", en: "Approved by" },
  paidBy: { pt: "Paga por", en: "Paid by" },
  rejectReason: { pt: "Motivo da recusa", en: "Rejection reason" },
  rejectReasonRequired: { pt: "Informe o motivo da recusa.", en: "Enter the rejection reason." },
  loading: { pt: "Carregando...", en: "Loading..." },
  saving: { pt: "Salvando...", en: "Saving..." },
  saved: { pt: "Salvo.", en: "Saved." },
  failed: { pt: "Falhou.", en: "Failed." },
  details: { pt: "Detalhes", en: "Details" },
  history: { pt: "Historico", en: "History" }
} as const;

export function tr(key: keyof typeof i18n, lang: Lang): string {
  return i18n[key][lang];
}

// Tipo permissivo aceita string vinda do backend (graceful degradation).
type CurrencyCode = "BRL" | "USD" | string | null | undefined;

function normalizeMoeda(m: CurrencyCode): "BRL" | "USD" {
  const v = (m || "BRL").toString().toUpperCase();
  return v === "USD" ? "USD" : "BRL";
}

// Aceita assinatura legada (v, lang) e nova (v, moeda, lang?).
// Default de moeda = BRL pra graceful degradation em NFs antigas.
export function fmtCurrency(
  v: number,
  moedaOrLang?: CurrencyCode | Lang,
  lang?: Lang
): string {
  // Heuristica: se segundo arg for 'pt'|'en', assina legada.
  let resolvedMoeda: "BRL" | "USD" = "BRL";
  let resolvedLang: Lang = "pt";
  if (moedaOrLang === "pt" || moedaOrLang === "en") {
    resolvedLang = moedaOrLang;
  } else {
    resolvedMoeda = normalizeMoeda(moedaOrLang as CurrencyCode);
    if (lang) resolvedLang = lang;
  }
  const locale = resolvedLang === "en" ? "en-US" : "pt-BR";
  return v.toLocaleString(locale, {
    style: "currency",
    currency: resolvedMoeda
  });
}

export function fmtDate(s: string | null | undefined, lang: Lang): string {
  if (!s) return "—";
  const d = s.length === 10 ? new Date(s + "T00:00:00") : new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang === "en" ? "en-US" : "pt-BR");
}

export function fmtDateTime(s: string | null | undefined, lang: Lang): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "en" ? "en-US" : "pt-BR");
}

export function fmtRefMonth(s: string | null | undefined, lang: Lang): string {
  if (!s) return "—";
  // Aceita YYYY-MM ou YYYY-MM-DD
  const ym = s.length >= 7 ? s.slice(0, 7) : s;
  const [y, m] = ym.split("-");
  if (!y || !m) return s;
  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", {
    month: "short",
    year: "numeric"
  });
}
