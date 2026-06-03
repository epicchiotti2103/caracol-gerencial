"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  Wallet,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowLeftRight,
  Check,
  Plus,
  Trash2
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type {
  DashboardResponse,
  ForecastResponse,
  ForecastMonth,
  DashboardItem,
  DashboardItemsResponse,
  Moeda,
  CashflowResponse,
  CashflowItem,
  CashflowMonth,
  FxRate,
  FxRatesResponse,
  OpeningBalance,
  Remittance,
  RemittancesResponse,
  ReconciliationResponse
} from "@/types";
import {
  formatCurrency,
  buildMonthOptions,
  buildYearOptions,
  currentYearMonth,
  currentYear,
  parseNumberPtBr,
  formatMonthLabel
} from "@/lib/format";

type Tab = "fechamento" | "fluxo";

export function DashboardView() {
  const [tab, setTab] = useState<Tab>("fechamento");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">Caracol Gerencial</h4>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard financeiro</h1>
        <p className="mt-1 text-sm text-muted">
          Duas visões: <span className="text-foreground">Fechamento</span> (regime de competência — o mês fechou no
          azul?) e <span className="text-foreground">Fluxo de caixa</span> (regime de caixa — quanto preciso pagar e
          quando vence).
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1 border-b border-border">
        {(
          [
            { v: "fechamento", l: "Fechamento" },
            { v: "fluxo", l: "Fluxo de caixa" }
          ] as Array<{ v: Tab; l: string }>
        ).map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.v
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "fechamento" ? <FechamentoTab /> : <FluxoTab />}
    </div>
  );
}

/* ============================================================
   ABA 1 — FECHAMENTO (regime de competência)
   ============================================================ */

type ForecastMetric = "entrada" | "saida" | "net";
type ChartBase = Moeda | "CONS";
type ViewMode = "mes" | "ano";

function FechamentoTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("mes");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          Por <span className="text-foreground">competência</span>: tudo que pertence ao período de referência,
          independente de quando o dinheiro entra/sai. Resultado = entradas − saídas.
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          {(
            [
              { v: "mes", l: "Mês" },
              { v: "ano", l: "Ano" }
            ] as Array<{ v: ViewMode; l: string }>
          ).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setViewMode(opt.v)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === opt.v ? "bg-primary text-black" : "text-muted hover:text-foreground"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "mes" ? <FechamentoMes /> : <FechamentoAno />}
    </>
  );
}

/* ---- Fechamento: visão MÊS (cards + drill-down de títulos) ---- */

function FechamentoMes() {
  const monthOpts = buildMonthOptions();
  const [month, setMonth] = useState(currentYearMonth());
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [items, setItems] = useState<DashboardItem[] | null>(null);
  const [fxRate, setFxRate] = useState<FxRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [detalheMoeda, setDetalheMoeda] = useState<Moeda>("BRL");

  const [expandedBrlReceber, setExpandedBrlReceber] = useState(false);
  const [expandedBrlPagar, setExpandedBrlPagar] = useState(false);
  const [expandedUsdReceber, setExpandedUsdReceber] = useState(false);
  const [expandedUsdPagar, setExpandedUsdPagar] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [d, it] = await Promise.all([
        apiFetch(`/gerencial/dashboard?month=${month}`),
        apiFetch(`/gerencial/dashboard/items?month=${month}`)
      ]);
      setDashboard(d as DashboardResponse);
      setItems((it as DashboardItemsResponse).items);
      // Tolerante: se a tabela de cotação ainda não existe, segue sem consolidar
      try {
        const fx = await apiFetch(`/gerencial/fx-rates?start=${month}&months_ahead=0`);
        setFxRate((fx as FxRatesResponse).rates[0] ?? null);
      } catch {
        setFxRate(null);
      }
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="mb-6 flex items-center justify-end gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
        >
          {monthOpts.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-border bg-surface p-2 text-muted hover:bg-surface/80 disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {loading && !dashboard ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {dashboard && (
            <div className="mb-8 grid gap-4 md:grid-cols-2">
              <MoedaCard
                title="Caracol BR (R$)"
                moeda="BRL"
                data={dashboard.brl}
                expandedReceber={expandedBrlReceber}
                expandedPagar={expandedBrlPagar}
                onToggleReceber={() => setExpandedBrlReceber(!expandedBrlReceber)}
                onTogglePagar={() => setExpandedBrlPagar(!expandedBrlPagar)}
              />
              <MoedaCard
                title="Caracol LLC (US$)"
                moeda="USD"
                data={dashboard.usd}
                expandedReceber={expandedUsdReceber}
                expandedPagar={expandedUsdPagar}
                onToggleReceber={() => setExpandedUsdReceber(!expandedUsdReceber)}
                onTogglePagar={() => setExpandedUsdPagar(!expandedUsdPagar)}
              />
            </div>
          )}

          {dashboard && (
            <div className="mb-8">
              <ConsolidatedMonthCard
                month={month}
                brlNet={netOf(dashboard.brl)}
                usdNet={netOf(dashboard.usd)}
                fxRate={fxRate}
                onRateSaved={load}
              />
            </div>
          )}

          {items && (
            <MonthItemsBreakdown items={items} moeda={detalheMoeda} onMoedaChange={setDetalheMoeda} />
          )}
        </>
      )}
    </>
  );
}

/* ---- Fechamento: visão ANO (resumo anual + gráfico 12 meses) ---- */

function FechamentoAno() {
  const yearOpts = buildYearOptions();
  const [year, setYear] = useState(currentYear());
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [rates, setRates] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [forecastMetric, setForecastMetric] = useState<ForecastMetric>("net");
  const [forecastMoeda, setForecastMoeda] = useState<ChartBase>("BRL");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const f = await apiFetch(`/gerencial/forecast?start=${year}-01&months_ahead=11`);
      setForecast(f as ForecastResponse);
      // Tolerante: sem tabela de cotação, mostra só BRL/USD separados
      try {
        const fx = await apiFetch(`/gerencial/fx-rates?start=${year}-01&months_ahead=11`);
        const map: Record<string, number | null> = {};
        for (const r of (fx as FxRatesResponse).rates) map[r.month] = r.usd_brl;
        setRates(map);
      } catch {
        setRates({});
      }
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="mb-6 flex items-center justify-end gap-2">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
        >
          {yearOpts.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-border bg-surface p-2 text-muted hover:bg-surface/80 disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {loading && !forecast ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        forecast && (
          <>
            <div className="mb-4 grid gap-4 md:grid-cols-2">
              <AnnualSummaryCard title="Caracol BR (R$)" moeda="BRL" months={forecast.months} year={year} />
              <AnnualSummaryCard title="Caracol LLC (US$)" moeda="USD" months={forecast.months} year={year} />
            </div>
            <div className="mb-8">
              <AnnualConsolidatedCard months={forecast.months} rates={rates} year={year} />
            </div>

            {forecast.months.length > 0 && (
              <div className="rounded-xl border border-border bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Resultado por mês ({year})</h2>
                    <p className="text-xs text-muted">
                      Net = entradas − saídas, por mês de referência. Azul = positivo, vermelho = negativo.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { v: "entrada", l: "Entrada" },
                          { v: "saida", l: "Saída" },
                          { v: "net", l: "Resultado" }
                        ] as Array<{ v: ForecastMetric; l: string }>
                      ).map((opt) => (
                        <button
                          key={opt.v}
                          onClick={() => setForecastMetric(opt.v)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            forecastMetric === opt.v
                              ? "bg-primary text-black"
                              : "bg-background text-muted hover:text-foreground"
                          }`}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { v: "BRL", l: "R$" },
                          { v: "USD", l: "US$" },
                          { v: "CONS", l: "R$ cons." }
                        ] as Array<{ v: ChartBase; l: string }>
                      ).map((opt) => (
                        <button
                          key={opt.v}
                          onClick={() => setForecastMoeda(opt.v)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            forecastMoeda === opt.v
                              ? "bg-primary text-black"
                              : "bg-background text-muted hover:text-foreground"
                          }`}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <ForecastChart
                    months={forecast.months}
                    metric={forecastMetric}
                    moeda={forecastMoeda}
                    rates={rates}
                  />
                </div>
              </div>
            )}
          </>
        )
      )}
    </>
  );
}

function AnnualSummaryCard({
  title,
  moeda,
  months,
  year
}: {
  title: string;
  moeda: Moeda;
  months: ForecastMonth[];
  year: number;
}) {
  const entrada = months.reduce((s, m) => s + (moeda === "BRL" ? m.entrada_brl : m.entrada_usd), 0);
  const saida = months.reduce((s, m) => s + (moeda === "BRL" ? m.saida_brl : m.saida_usd), 0);
  const net = entrada - saida;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Wallet className="h-4 w-4 text-muted" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Entradas ({year})</span>
          <span className="font-mono text-emerald-300">{formatCurrency(entrada, moeda)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Saídas ({year})</span>
          <span className="font-mono text-danger">{formatCurrency(saida, moeda)}</span>
        </div>
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">Resultado do ano</span>
            <span
              className={`font-mono text-lg font-semibold ${net >= 0 ? "text-sky-300" : "text-danger"}`}
              title="Entradas − saídas no ano (competência)"
            >
              {formatCurrency(net, moeda)}
            </span>
          </div>
          <p className="mt-1 text-right text-xs text-muted">
            {net >= 0 ? "Ano fecha positivo" : "Ano fecha negativo"}
          </p>
        </div>
      </div>
    </div>
  );
}

function AnnualConsolidatedCard({
  months,
  rates,
  year
}: {
  months: ForecastMonth[];
  rates: Record<string, number | null>;
  year: number;
}) {
  let entrada = 0;
  let saida = 0;
  let semCotacao = 0;
  for (const m of months) {
    entrada += m.entrada_brl;
    saida += m.saida_brl;
    const rate = rates[m.month];
    if (rate != null) {
      entrada += m.entrada_usd * rate;
      saida += m.saida_usd * rate;
    } else if (m.entrada_usd !== 0 || m.saida_usd !== 0) {
      semCotacao++;
    }
  }
  const net = entrada - saida;
  return (
    <div className="rounded-xl border border-primary/30 bg-surface p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Resultado consolidado do ano (R$)</h3>
        <p className="text-xs text-muted">
          Cada mês usa sua cotação salva (ou a última conhecida). Edite a cotação na visão Mês.
        </p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Entradas ({year})</span>
          <span className="font-mono text-emerald-300">{formatCurrency(entrada, "BRL")}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Saídas ({year})</span>
          <span className="font-mono text-danger">{formatCurrency(saida, "BRL")}</span>
        </div>
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">Resultado consolidado</span>
            <span className={`font-mono text-xl font-semibold ${net >= 0 ? "text-sky-300" : "text-danger"}`}>
              {formatCurrency(net, "BRL")}
            </span>
          </div>
          {semCotacao > 0 && (
            <p className="mt-1 text-right text-xs text-amber-300">
              {semCotacao} {semCotacao === 1 ? "mês sem cotação" : "meses sem cotação"} — o lado US$ deles ficou de fora.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MoedaCard({
  title,
  moeda,
  data,
  expandedReceber,
  expandedPagar,
  onToggleReceber,
  onTogglePagar
}: {
  title: string;
  moeda: Moeda;
  data: DashboardResponse["brl"];
  expandedReceber: boolean;
  expandedPagar: boolean;
  onToggleReceber: () => void;
  onTogglePagar: () => void;
}) {
  const net = data.recebido_mes + data.a_receber - data.pago_mes - data.a_pagar;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Wallet className="h-4 w-4 text-muted" />
      </div>

      <div className="space-y-3">
        {/* Realizado (já passou) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Recebido (mês)</span>
            <span className="font-mono text-emerald-300">{formatCurrency(data.recebido_mes, moeda)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Pago (mês)</span>
            <span className="font-mono text-danger">{formatCurrency(data.pago_mes, moeda)}</span>
          </div>
        </div>

        {/* Pendente (ainda vai acontecer) */}
        <div className="border-t border-border pt-3 space-y-3">
          <button onClick={onToggleReceber} className="w-full text-left">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">A receber</span>
              <span className="font-mono text-emerald-300">{formatCurrency(data.a_receber, moeda)}</span>
            </div>
          </button>
          {expandedReceber && (
            <div className="ml-3 space-y-1 border-l border-border pl-3 text-xs">
              <BreakdownRow label="NF a receber" value={data.breakdown_a_receber.nf_receivables} moeda={moeda} />
              <BreakdownRow label="Fechamentos abertos" value={data.breakdown_a_receber.fechamentos} moeda={moeda} />
              <BreakdownRow label="Transações" value={data.breakdown_a_receber.transactions} moeda={moeda} />
            </div>
          )}

          <button onClick={onTogglePagar} className="w-full text-left">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">A pagar</span>
              <span className="font-mono text-danger">{formatCurrency(data.a_pagar, moeda)}</span>
            </div>
          </button>
          {expandedPagar && (
            <div className="ml-3 space-y-1 border-l border-border pl-3 text-xs">
              <BreakdownRow label="NF a pagar" value={data.breakdown_a_pagar.nf_invoices} moeda={moeda} />
              <BreakdownRow label="Transações" value={data.breakdown_a_pagar.transactions} moeda={moeda} />
            </div>
          )}
        </div>

        {/* Resultado do mês (competência) */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">Resultado do mês</span>
            <span
              className={`font-mono text-lg font-semibold ${net >= 0 ? "text-sky-300" : "text-danger"}`}
              title="Recebido + a receber − pago − a pagar (competência)"
            >
              {formatCurrency(net, moeda)}
            </span>
          </div>
          <p className="mt-1 text-right text-xs text-muted">
            {net >= 0 ? "Mês fecha positivo" : "Mês fecha negativo"}
          </p>
        </div>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, moeda }: { label: string; value: number; moeda: Moeda }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-muted">{formatCurrency(value, moeda)}</span>
    </div>
  );
}

// Resultado do mês (competência) de uma moeda: recebido + a receber − pago − a pagar
function netOf(d: DashboardResponse["brl"]): number {
  return d.recebido_mes + d.a_receber - d.pago_mes - d.a_pagar;
}

/* Card de resultado consolidado em R$ — converte o lado USD pela cotação do mês */
function ConsolidatedMonthCard({
  month,
  brlNet,
  usdNet,
  fxRate,
  onRateSaved
}: {
  month: string;
  brlNet: number;
  usdNet: number;
  fxRate: FxRate | null;
  onRateSaved: () => void;
}) {
  const [rateInput, setRateInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    setRateInput(fxRate?.usd_brl != null ? String(fxRate.usd_brl).replace(".", ",") : "");
  }, [fxRate, month]);

  const rate = fxRate?.usd_brl ?? null;
  const consolidado = rate != null ? brlNet + usdNet * rate : null;

  const save = async () => {
    const parsed = parseNumberPtBr(rateInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSaveErr("Cotação inválida.");
      return;
    }
    setSaving(true);
    setSaveErr("");
    try {
      await apiFetch(`/gerencial/fx-rate`, {
        method: "PUT",
        body: JSON.stringify({ month, usd_brl: parsed })
      });
      onRateSaved();
    } catch (err: any) {
      setSaveErr(err?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Resultado consolidado (R$)</h3>
          <p className="text-xs text-muted">
            Soma os dois lados convertendo o US$ pela cotação do mês. Responde como o mês realmente fechou.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            US$ 1 =
            <div className="flex items-center rounded-lg border border-border bg-background pl-2 focus-within:border-primary/50">
              <span className="text-xs text-muted">R$</span>
              <input
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="5,00"
                inputMode="decimal"
                className="w-20 bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"
              />
            </div>
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-black hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {saveErr && <p className="mt-2 text-xs text-danger">{saveErr}</p>}
      {fxRate?.inherited && fxRate.source_month && (
        <p className="mt-2 text-xs text-amber-300">
          Cotação herdada de {formatMonthLabel(fxRate.source_month)} — informe a cotação deste mês pra fixar.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-border pt-4">
        <span className="text-base font-semibold text-foreground">Resultado do mês (consolidado)</span>
        {consolidado != null ? (
          <div className="text-right">
            <span
              className={`font-mono text-2xl font-semibold ${consolidado >= 0 ? "text-sky-300" : "text-danger"}`}
            >
              {formatCurrency(consolidado, "BRL")}
            </span>
            <p className="mt-1 text-xs text-muted">
              {formatCurrency(brlNet, "BRL")} + {formatCurrency(usdNet, "USD")} ×{" "}
              {rate?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </p>
          </div>
        ) : (
          <span className="text-sm text-muted">Informe a cotação pra consolidar.</span>
        )}
      </div>
    </div>
  );
}

function sourceLabel(source: string): string {
  switch (source) {
    case "nf_invoices":
      return "NF a pagar";
    case "nf_receivables":
      return "NF a receber";
    case "fechamento":
      return "Fechamento";
    case "gerencial_transactions":
      return "Avulso";
    default:
      return source;
  }
}

/* Drill-down: quais títulos compõem o mês de competência */
function MonthItemsBreakdown({
  items,
  moeda,
  onMoedaChange
}: {
  items: DashboardItem[];
  moeda: Moeda;
  onMoedaChange: (m: Moeda) => void;
}) {
  const ofMoeda = items.filter((it) => it.moeda === moeda);
  const groups: Array<{ key: string; title: string; accent: string; list: DashboardItem[] }> = [
    {
      key: "recebido",
      title: "Recebido (realizado)",
      accent: "text-emerald-300",
      list: ofMoeda.filter((it) => it.tipo === "receber" && it.status === "realizado")
    },
    {
      key: "a_receber",
      title: "A receber (pendente)",
      accent: "text-emerald-300",
      list: ofMoeda.filter((it) => it.tipo === "receber" && it.status === "pendente")
    },
    {
      key: "pago",
      title: "Pago (realizado)",
      accent: "text-danger",
      list: ofMoeda.filter((it) => it.tipo === "pagar" && it.status === "realizado")
    },
    {
      key: "a_pagar",
      title: "A pagar (pendente)",
      accent: "text-danger",
      list: ofMoeda.filter((it) => it.tipo === "pagar" && it.status === "pendente")
    }
  ];

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Detalhamento do mês</h2>
          <p className="text-xs text-muted">Quais títulos compõem cada valor do mês de referência.</p>
        </div>
        <div className="flex items-center gap-1">
          {(["BRL", "USD"] as Moeda[]).map((m) => (
            <button
              key={m}
              onClick={() => onMoedaChange(m)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                moeda === m ? "bg-primary text-black" : "bg-background text-muted hover:text-foreground"
              }`}
            >
              {m === "BRL" ? "R$" : "US$"}
            </button>
          ))}
        </div>
      </div>
      {ofMoeda.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">
          Nenhum título em {moeda === "BRL" ? "R$" : "US$"} neste mês.
        </p>
      ) : (
        <div className="grid gap-x-6 gap-y-6 p-5 md:grid-cols-2">
          {groups.map((g) => (
            <ItemGroup key={g.key} title={g.title} accent={g.accent} items={g.list} moeda={moeda} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemGroup({
  title,
  accent,
  items,
  moeda
}: {
  title: string;
  accent: string;
  items: DashboardItem[];
  moeda: Moeda;
}) {
  const total = items.reduce((s, it) => s + it.amount, 0);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>{title}</h3>
        <span className={`font-mono text-xs ${accent}`}>{formatCurrency(total, moeda)}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted">Nenhum título.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={`${it.source}-${it.id}`} className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{it.descricao}</p>
                  <p className="text-xs text-muted">
                    {sourceLabel(it.source)}
                    {it.due_date && <span> · vence {it.due_date}</span>}
                  </p>
                </div>
                <span className={`flex-shrink-0 font-mono text-sm ${accent}`}>
                  {formatCurrency(it.amount, moeda)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ForecastChart({
  months,
  metric,
  moeda,
  rates
}: {
  months: ForecastMonth[];
  metric: ForecastMetric;
  moeda: ChartBase;
  rates?: Record<string, number | null>;
}) {
  // Moeda do eixo Y: CONS consolida em R$, então usa R$
  const tickMoeda: Moeda = moeda === "USD" ? "USD" : "BRL";

  const getValue = (m: ForecastMonth): number => {
    let ent: number;
    let sai: number;
    if (moeda === "CONS") {
      const rate = rates?.[m.month] ?? 0;
      ent = m.entrada_brl + m.entrada_usd * rate;
      sai = m.saida_brl + m.saida_usd * rate;
    } else if (moeda === "BRL") {
      ent = m.entrada_brl;
      sai = m.saida_brl;
    } else {
      ent = m.entrada_usd;
      sai = m.saida_usd;
    }
    if (metric === "entrada") return ent;
    if (metric === "saida") return sai;
    return ent - sai;
  };

  const values = months.map(getValue);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const W = 720;
  const H = 220;
  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = (innerW / months.length) * 0.6;
  const slot = innerW / months.length;

  const zeroY = padT + innerH - ((0 - min) / range) * innerH;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: "600px" }}>
        <line
          x1={padL}
          x2={W - padR}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeDasharray="3,3"
        />
        <text x={padL - 8} y={padT + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">
          {formatTickShort(max, tickMoeda)}
        </text>
        <text x={padL - 8} y={zeroY + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">
          0
        </text>
        {min < 0 && (
          <text x={padL - 8} y={padT + innerH + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">
            {formatTickShort(min, tickMoeda)}
          </text>
        )}

        {months.map((m, i) => {
          const v = getValue(m);
          const xCenter = padL + i * slot + slot / 2;
          const barX = xCenter - barW / 2;
          const isPositive = v >= 0;
          const top = isPositive ? padT + innerH - ((v - min) / range) * innerH : zeroY;
          const bottom = isPositive ? zeroY : padT + innerH - ((v - min) / range) * innerH;
          const h = Math.abs(bottom - top);
          // net: azul positivo / vermelho negativo
          const color =
            metric === "net"
              ? isPositive
                ? "rgb(125, 211, 252)"
                : "rgb(248, 113, 113)"
              : metric === "entrada"
              ? "rgb(110, 231, 183)"
              : "rgb(248, 113, 113)";

          return (
            <g key={m.month}>
              <rect x={barX} y={top} width={barW} height={h} fill={color} opacity="0.7" />
              <text
                x={xCenter}
                y={isPositive ? top - 6 : bottom + 14}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                fillOpacity="0.7"
              >
                {formatTickShort(v, tickMoeda)}
              </text>
              <text x={xCenter} y={H - 10} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.5">
                {shortMonth(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ============================================================
   ABA 2 — FLUXO DE CAIXA (regime de caixa, por vencimento)
   ============================================================ */

function FluxoTab() {
  const [data, setData] = useState<CashflowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moeda, setMoeda] = useState<Moeda>("BRL");
  const [overdueOpen, setOverdueOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch(`/gerencial/cashflow?months_ahead=6`);
      setData(r as CashflowResponse);
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar fluxo de caixa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ov = data?.overdue;
  const overduePagar = moeda === "BRL" ? ov?.a_pagar_brl ?? 0 : ov?.a_pagar_usd ?? 0;
  const overdueReceber = moeda === "BRL" ? ov?.a_receber_brl ?? 0 : ov?.a_receber_usd ?? 0;
  const overdueItems = (ov?.items ?? []).filter((it) => it.moeda === moeda);
  const itensPagar = overdueItems.filter((it) => it.tipo === "pagar");
  const itensReceber = overdueItems.filter((it) => it.tipo === "receber");
  const hasOverdue = overduePagar !== 0 || overdueReceber !== 0;

  // Projeção de saldo: começa no saldo de abertura e corre mês a mês,
  // aplicando a receber (+), a pagar (−) e remessa (USD +, BRL −).
  const opening = moeda === "BRL" ? data?.opening?.brl ?? null : data?.opening?.usd ?? null;
  let running = opening;
  const timelineRows = (data?.months ?? []).map((m, i) => {
    const receber = moeda === "BRL" ? m.a_receber_brl : m.a_receber_usd;
    const pagar = moeda === "BRL" ? m.a_pagar_brl : m.a_pagar_usd;
    const remessa = moeda === "USD" ? m.remessa_usd_in : -(m.remessa_brl_out ?? 0);
    const movimento = receber - pagar + remessa;
    running = running != null ? running + movimento : null;
    const isCurrent = i === 0 || (data?.today != null && m.month === data.today.slice(0, 7));
    return {
      month: m,
      receber,
      pagar,
      remessa,
      saldoProjetado: running,
      overduePagar: isCurrent ? overduePagar : 0
    };
  });

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-3">
        <p className="text-sm text-muted">
          Por <span className="text-foreground">vencimento</span> (caixa real): quando o dinheiro de fato entra/sai.
          Diferente do Fechamento, que é por competência.
        </p>
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="flex items-center gap-1">
            {(["BRL", "USD"] as Moeda[]).map((m) => (
              <button
                key={m}
                onClick={() => setMoeda(m)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  moeda === m ? "bg-primary text-black" : "bg-background text-muted hover:text-foreground"
                }`}
              >
                {m === "BRL" ? "R$" : "US$"}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-border bg-surface p-2 text-muted hover:bg-surface/80 disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
          <div className="text-sm text-danger">
            <p>{error}</p>
            <p className="mt-1 text-xs text-danger/70">
              O endpoint de fluxo de caixa pode ainda não estar disponível no backend.
            </p>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
          {/* Card "Em atraso" em destaque */}
          <div
            className={`mb-6 rounded-xl border ${
              hasOverdue ? "border-danger/40 bg-danger/10" : "border-border bg-surface"
            }`}
          >
            <button
              onClick={() => setOverdueOpen((o) => !o)}
              disabled={overdueItems.length === 0}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left disabled:cursor-default"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${hasOverdue ? "text-danger" : "text-muted"}`} />
                <div>
                  <h2 className={`text-sm font-semibold ${hasOverdue ? "text-danger" : "text-foreground"}`}>
                    Em atraso (vencido)
                  </h2>
                  <p className="text-xs text-muted">Títulos com vencimento anterior a hoje ({data.today}).</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-muted">A pagar</p>
                  <p className="font-mono text-sm font-semibold text-danger">{formatCurrency(overduePagar, moeda)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">A receber</p>
                  <p className="font-mono text-sm font-semibold text-emerald-300">
                    {formatCurrency(overdueReceber, moeda)}
                  </p>
                </div>
                {overdueItems.length > 0 &&
                  (overdueOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted" />
                  ))}
              </div>
            </button>

            {overdueOpen && overdueItems.length > 0 && (
              <div className="grid gap-4 border-t border-danger/20 px-5 py-4 md:grid-cols-2">
                <OverdueColumn title="A pagar" items={itensPagar} tipo="pagar" moeda={moeda} />
                <OverdueColumn title="A receber" items={itensReceber} tipo="receber" moeda={moeda} />
              </div>
            )}
          </div>

          {/* Projeção de caixa por vencimento */}
          {data.months.length > 0 && (
            <div className="rounded-xl border border-border bg-surface">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Projeção de caixa por vencimento</h2>
                  <p className="text-xs text-muted">
                    Saldo inicial + a receber − a pagar ± remessa, por data de vencimento.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">
                    Saldo inicial (01/{data.months[0] ? formatMonthLabel(data.months[0].month) : ""})
                  </p>
                  {opening != null ? (
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {formatCurrency(opening, moeda)}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-300">informe em Saldos &amp; conciliação ↓</p>
                  )}
                </div>
              </div>
              <div className="divide-y divide-border">
                {timelineRows.map((r) => (
                  <CashflowMonthRow
                    key={r.month.month}
                    month={r.month}
                    moeda={moeda}
                    receber={r.receber}
                    pagar={r.pagar}
                    remessa={r.remessa}
                    saldoProjetado={r.saldoProjetado}
                    overduePagar={r.overduePagar}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}

      <div className="mt-6 space-y-6">
        <ReconciliationSection />
        <RemittancesSection />
      </div>
    </>
  );
}

function OverdueColumn({
  title,
  items,
  tipo,
  moeda
}: {
  title: string;
  items: CashflowItem[];
  tipo: "pagar" | "receber";
  moeda: Moeda;
}) {
  const accent = tipo === "pagar" ? "text-danger" : "text-emerald-300";
  return (
    <div>
      <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${accent}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted">Nada vencido.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={`${it.source}-${it.id}`} className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{it.descricao}</p>
                  <p className="text-xs text-muted">
                    Venceu {it.due_date} · {it.dias_atraso} dia{it.dias_atraso === 1 ? "" : "s"} de atraso
                    {it.previsto && (
                      <span className="ml-1.5 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                        previsto
                      </span>
                    )}
                  </p>
                </div>
                <span className={`flex-shrink-0 font-mono text-sm ${accent}`}>
                  {formatCurrency(it.amount, moeda)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CashflowMonthRow({
  month,
  moeda,
  receber,
  pagar,
  remessa,
  saldoProjetado,
  overduePagar = 0
}: {
  month: CashflowMonth;
  moeda: Moeda;
  receber: number;
  pagar: number;
  remessa: number; // efeito da remessa na moeda (USD +, BRL −)
  saldoProjetado: number | null;
  overduePagar?: number;
}) {
  const showOverdueHint = overduePagar > 0;
  const temRemessa = remessa !== 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <span className="w-24 text-sm font-medium text-foreground">{shortMonth(month.month)}</span>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-x-8 gap-y-1">
        <div className="text-right">
          <span className="text-xs text-muted">A receber </span>
          <span className="font-mono text-sm text-emerald-300">{formatCurrency(receber, moeda)}</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted">A pagar </span>
          <span className="font-mono text-sm text-danger">{formatCurrency(pagar, moeda)}</span>
          {showOverdueHint && (
            <p className="text-xs text-muted">(inclui {formatCurrency(overduePagar, moeda)} em atraso)</p>
          )}
        </div>
        {temRemessa && (
          <div className="text-right">
            <span className="text-xs text-muted">Remessa </span>
            <span className={`font-mono text-sm ${remessa >= 0 ? "text-emerald-300" : "text-danger"}`}>
              {remessa >= 0 ? "+" : ""}
              {formatCurrency(remessa, moeda)}
            </span>
          </div>
        )}
        <div className="w-36 text-right">
          <span className="text-xs text-muted">Saldo proj. </span>
          {saldoProjetado != null ? (
            <span
              className={`font-mono text-sm font-semibold ${saldoProjetado >= 0 ? "text-sky-300" : "text-danger"}`}
            >
              {formatCurrency(saldoProjetado, moeda)}
            </span>
          ) : (
            <span className="font-mono text-sm text-muted">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Saldos & Conciliação de caixa ---- */

function ReconciliationSection() {
  const monthOpts = buildMonthOptions();
  const [month, setMonth] = useState(currentYearMonth());
  const [recon, setRecon] = useState<ReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch(`/gerencial/reconciliation?month=${month}`);
      setRecon(r as ReconciliationResponse);
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar conciliação.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Saldos & conciliação</h2>
          <p className="text-xs text-muted">
            Informe o saldo no dia 01. Esperado fim do mês = abertura + recebido − pago ± remessa. No dia 01 do mês
            seguinte, veja se bate.
          </p>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
        >
          {monthOpts.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="px-5 py-3 text-sm text-danger">{error}</p>}

      {loading && !recon ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : recon ? (
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <MoedaReconColumn moeda="BRL" month={month} nextMonth={recon.next_month} data={recon.brl} onSaved={load} />
          <MoedaReconColumn moeda="USD" month={month} nextMonth={recon.next_month} data={recon.usd} onSaved={load} />
        </div>
      ) : null}
    </div>
  );
}

function MoedaReconColumn({
  moeda,
  month,
  nextMonth,
  data,
  onSaved
}: {
  moeda: Moeda;
  month: string;
  nextMonth: string;
  data: ReconciliationResponse["brl"];
  onSaved: () => void;
}) {
  const isBrl = moeda === "BRL";
  const remessa = isBrl ? -data.remessa_saida : data.remessa_entrada;
  const temRemessa = remessa !== 0;
  const bate = data.diferenca != null && Math.abs(data.diferenca) < 0.01;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        {isBrl ? "Caracol BR (R$)" : "Caracol LLC (US$)"}
      </h3>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">Saldo em 01/{formatMonthLabel(month)}</span>
          <EditableBalance month={month} moeda={moeda} value={data.abertura} onSaved={onSaved} />
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-muted">+ Recebido no mês</span>
          <span className="font-mono text-emerald-300">{formatCurrency(data.recebido, moeda)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">− Pago no mês</span>
          <span className="font-mono text-danger">{formatCurrency(data.pago, moeda)}</span>
        </div>
        {temRemessa && (
          <div className="flex items-center justify-between">
            <span className="text-muted">{isBrl ? "− Remessa enviada" : "+ Remessa recebida"}</span>
            <span className={`font-mono ${isBrl ? "text-danger" : "text-emerald-300"}`}>
              {formatCurrency(remessa, moeda)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="font-medium text-foreground">= Esperado fim do mês</span>
          <span className="font-mono font-semibold text-foreground">
            {data.esperado_fim != null ? formatCurrency(data.esperado_fim, moeda) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-muted">Saldo em 01/{formatMonthLabel(nextMonth)}</span>
          <EditableBalance month={nextMonth} moeda={moeda} value={data.abertura_proximo} onSaved={onSaved} />
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-muted">Diferença</span>
          {data.diferenca == null ? (
            <span className="text-xs text-muted">informe os dois saldos</span>
          ) : bate ? (
            <span className="inline-flex items-center gap-1 font-mono text-sm text-emerald-300">
              <Check className="h-3.5 w-3.5" /> bate
            </span>
          ) : (
            <span className="font-mono text-sm font-semibold text-amber-300">
              {formatCurrency(data.diferenca, moeda)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EditableBalance({
  month,
  moeda,
  value,
  onSaved
}: {
  month: string;
  moeda: Moeda;
  value: number | null;
  onSaved: () => void;
}) {
  const [v, setV] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setV(value != null ? String(value).replace(".", ",") : "");
  }, [value, month]);

  const save = async () => {
    const parsed = parseNumberPtBr(v);
    if (!Number.isFinite(parsed)) return;
    if (value != null && parsed === value) return; // sem mudança
    setSaving(true);
    try {
      await apiFetch(`/gerencial/opening-balance`, {
        method: "PUT",
        body: JSON.stringify(moeda === "BRL" ? { month, brl: parsed } : { month, usd: parsed })
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center rounded-lg border border-border bg-background pl-2 focus-within:border-primary/50">
      <span className="text-xs text-muted">{moeda === "BRL" ? "R$" : "US$"}</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="0,00"
        inputMode="decimal"
        disabled={saving}
        className="w-28 bg-transparent px-2 py-1.5 text-right font-mono text-sm text-foreground outline-none disabled:opacity-50"
      />
    </div>
  );
}

/* ---- Remessas internacionais (R$ → US$) ---- */

function RemittancesSection() {
  const [items, setItems] = useState<Remittance[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [data, setData] = useState("");
  const [brlOut, setBrlOut] = useState("");
  const [usdIn, setUsdIn] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch(`/gerencial/remittances`);
      setItems((r as RemittancesResponse).items);
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar remessas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const brl = parseNumberPtBr(brlOut);
    const usd = parseNumberPtBr(usdIn);
    if (!data) return setFormErr("Informe a data.");
    if (!Number.isFinite(brl) || brl <= 0) return setFormErr("R$ enviado inválido.");
    if (!Number.isFinite(usd) || usd <= 0) return setFormErr("US$ recebido inválido.");
    setSaving(true);
    setFormErr("");
    try {
      await apiFetch(`/gerencial/remittances`, {
        method: "POST",
        body: JSON.stringify({ data, brl_out: brl, usd_in: usd, notes: notes || null })
      });
      setData("");
      setBrlOut("");
      setUsdIn("");
      setNotes("");
      load();
    } catch (err: any) {
      setFormErr(err?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/gerencial/remittances/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ArrowLeftRight className="h-4 w-4 text-muted" /> Remessas (R$ → US$)
        </h2>
        <p className="text-xs text-muted">
          Dinheiro enviado pra fora: diminui o real e aumenta o dólar no caixa. Só fluxo de caixa — não entra no
          Fechamento.
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4">
        <label className="text-xs text-muted">
          Data
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="mt-1 block rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          />
        </label>
        <label className="text-xs text-muted">
          R$ enviado
          <input
            value={brlOut}
            onChange={(e) => setBrlOut(e.target.value)}
            placeholder="10.000,00"
            inputMode="decimal"
            className="mt-1 block w-32 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          />
        </label>
        <label className="text-xs text-muted">
          US$ recebido
          <input
            value={usdIn}
            onChange={(e) => setUsdIn(e.target.value)}
            placeholder="1.800,00"
            inputMode="decimal"
            className="mt-1 block w-32 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex-1 text-xs text-muted">
          Obs (opcional)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="banco, finalidade…"
            className="mt-1 block w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          />
        </label>
        <button
          onClick={add}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-black hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> {saving ? "Salvando…" : "Adicionar"}
        </button>
      </div>
      {formErr && <p className="px-5 pt-2 text-xs text-danger">{formErr}</p>}

      {/* Lista */}
      {error && <p className="px-5 py-3 text-sm text-danger">{error}</p>}
      {loading && !items ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : items && items.length > 0 ? (
        <ul className="divide-y divide-border">
          {items.map((it) => {
            const implied = it.usd_in > 0 ? it.brl_out / it.usd_in : 0;
            return (
              <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {it.data} · <span className="font-mono text-danger">−{formatCurrency(it.brl_out, "BRL")}</span>{" "}
                    → <span className="font-mono text-emerald-300">+{formatCurrency(it.usd_in, "USD")}</span>
                  </p>
                  <p className="text-xs text-muted">
                    Cotação efetiva R$ {implied.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    {it.notes ? ` · ${it.notes}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => remove(it.id)}
                  className="rounded-lg border border-border p-1.5 text-muted hover:border-danger/40 hover:text-danger"
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted">Nenhuma remessa registrada.</p>
      )}
    </div>
  );
}

/* ============================================================
   Helpers compartilhados
   ============================================================ */

function formatTickShort(value: number, moeda: Moeda): string {
  const prefix = moeda === "USD" ? "$" : "R$";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000000) return `${sign}${prefix}${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}${prefix}${(abs / 1000).toFixed(0)}k`;
  return `${sign}${prefix}${abs.toFixed(0)}`;
}

function shortMonth(yearMonth: string): string {
  const m = yearMonth.match(/^(\d{4})-(\d{2})/);
  if (!m) return yearMonth;
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mi = parseInt(m[2], 10) - 1;
  return `${monthNames[mi]}/${m[1].slice(2)}`;
}
