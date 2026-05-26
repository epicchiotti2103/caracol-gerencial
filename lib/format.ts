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

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Gera lista de meses pra dropdown (3 atras, atual, 12 a frente)
export function buildMonthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -3; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value: v, label: formatMonthLabel(v) });
  }
  return out;
}
