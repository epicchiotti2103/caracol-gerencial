// Helpers de formatacao monetaria PT-BR

export function formatCurrency(value: number | string | null | undefined, moeda: string = "BRL"): string {
  if (value == null) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return "—";
  const prefix = moeda === "USD" ? "US$ " : "R$ ";
  return prefix + num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function moedaShort(moeda: string | null | undefined): string {
  return moeda === "USD" ? "US$" : "R$";
}

// Aceita "1.234,56" PT-BR ou "1234.56" — retorna number ou NaN
export function parseNumberPtBr(s: string): number {
  if (!s) return NaN;
  const cleaned = s.replace(/\./g, "").replace(",", ".").trim();
  return parseFloat(cleaned);
}

// Mascara em tempo real durante input — permite digitos, virgula, ponto
export function sanitizeNumberInput(s: string): string {
  return s.replace(/[^\d.,]/g, "");
}

// On blur, formata pra YYYY,XX
export function blurFormatNumberPtBr(s: string, decimals: number = 2): string {
  const num = parseNumberPtBr(s);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Lista de meses em PT-BR pra dropdown
export const MONTHS_PT_BR = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function formatMonthLabel(yearMonth: string): string {
  // aceita YYYY-MM ou YYYY-MM-DD
  const m = yearMonth.match(/^(\d{4})-(\d{2})/);
  if (!m) return yearMonth;
  const year = m[1];
  const month = parseInt(m[2], 10);
  return `${MONTHS_PT_BR[month - 1]}/${year}`;
}

// ISO timestamp -> "DD/MM/AAAA HH:mm" pt-BR (pra "editado por X em ...")
export function formatDateTimeShort(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Gera lista de meses pra dropdown: desde jan/2026 (ou 12 meses atras, o que
// for mais antigo) ate 12 a frente. `ensure` injeta meses fora da faixa (ex:
// reference_month antigo de uma transacao em edicao) pra o select nao perder o valor.
export function buildMonthOptions(ensure: (string | null | undefined)[] = []): { value: string; label: string }[] {
  const now = new Date();
  const start = new Date(Math.min(
    new Date(2026, 0, 1).getTime(),
    new Date(now.getFullYear(), now.getMonth() - 12, 1).getTime()
  ));
  const end = new Date(now.getFullYear(), now.getMonth() + 12, 1);
  const values = new Set<string>();
  for (let d = start; d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    values.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  for (const e of ensure) {
    const m = (e || "").match(/^\d{4}-\d{2}/);
    if (m) values.add(m[0]);
  }
  return Array.from(values)
    .sort()
    .map((v) => ({ value: v, label: formatMonthLabel(v) }));
}

// Data de hoje em YYYY-MM-DD no fuso local (toISOString usa UTC e vira o dia a noite)
export function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function currentYear(): number {
  return new Date().getFullYear();
}

// Lista de anos pra dropdown (5 atras ate 1 a frente), mais recente primeiro
export function buildYearOptions(): number[] {
  const now = new Date().getFullYear();
  const out: number[] = [];
  for (let y = now + 1; y >= now - 5; y--) {
    out.push(y);
  }
  return out;
}
