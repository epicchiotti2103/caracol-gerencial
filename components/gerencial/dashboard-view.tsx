"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  Trash2,
  X,
  ExternalLink
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
  CashflowComposeItem,
  CashflowItemsResponse,
  FxRate,
  FxRatesResponse,
  OpeningBalance,
  Remittance,
  RemittancesResponse,
  ReconciliationResponse,
  EditStamp,
  SaldoContas,
  Transfer,
  TransfersResponse,
  Grupo,
  GruposResultado,
  AlertaDoubleCount,
  ResultadoAnualMoeda
} from "@/types";
import {
  formatCurrency,
  buildMonthOptions,
  buildYearOptions,
  currentYearMonth,
  currentYear,
  parseNumberPtBr,
  formatMonthLabel,
  formatDateTimeShort
} from "@/lib/format";
import { contasOf, contaLabel, CONTA_DEFAULT } from "@/lib/contas";
import { ResultadoAnualTab } from "@/components/gerencial/resultado-anual-view";

type Tab = "fechamento" | "fluxo" | "anual";

export function DashboardView() {
  const [tab, setTab] = useState<Tab>("fechamento");
  // Cache do Fechamento vale enquanto o dashboard está montado (trocar de aba/mês/ano
  // reaproveita). Voltar de /transacoes remonta o dashboard e zera, pra não mostrar
  // número velho depois de editar uma transação.
  useState(() => {
    cacheFechamentoMes.clear();
    cacheFechamentoAno.clear();
    invalidateFluxo();
    return null;
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">Caracol Gerencial</h4>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard financeiro</h1>
        <p className="mt-1 text-sm text-muted">
          <span className="text-foreground">Fechamento</span> (regime de competência — o mês fechou no azul?),{" "}
          <span className="text-foreground">Fluxo de caixa</span> (regime de caixa — quanto preciso pagar e quando
          vence) e <span className="text-foreground">Resultado anual</span> (competência, mês a mês do ano, em R$).
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1 border-b border-border">
        {(
          [
            { v: "fechamento", l: "Fechamento" },
            { v: "fluxo", l: "Fluxo de caixa" },
            { v: "anual", l: "Resultado anual" }
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

      {tab === "fechamento" ? <FechamentoTab /> : tab === "fluxo" ? <FluxoTab /> : <ResultadoAnualTab />}
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

// Cache em memória por mês. Trocar de mês e voltar não refaz fetch; o botão
// Atualizar (e salvar cotação) ignora o cache. Zerado quando o DashboardView remonta.
interface FechamentoMesCache {
  dashboard?: DashboardResponse;
  items?: DashboardItem[] | null;
  fxRate?: FxRate | null;
}
const cacheFechamentoMes = new Map<string, FechamentoMesCache>();

function mergeCacheMes(month: string, patch: FechamentoMesCache) {
  cacheFechamentoMes.set(month, { ...(cacheFechamentoMes.get(month) ?? {}), ...patch });
}

function FechamentoMes() {
  const monthOpts = buildMonthOptions();
  const [month, setMonth] = useState(currentYearMonth());
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(
    () => cacheFechamentoMes.get(currentYearMonth())?.dashboard ?? null
  );
  const [items, setItems] = useState<DashboardItem[] | null>(
    () => cacheFechamentoMes.get(currentYearMonth())?.items ?? null
  );
  const [fxRate, setFxRate] = useState<FxRate | null>(
    () => cacheFechamentoMes.get(currentYearMonth())?.fxRate ?? null
  );
  const [dashLoading, setDashLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [error, setError] = useState("");
  const [itemsError, setItemsError] = useState("");
  const reqId = useRef(0);
  const monthRef = useRef(month);
  monthRef.current = month;

  const [detalheMoeda, setDetalheMoeda] = useState<Moeda>("BRL");
  const [detalheGrupo, setDetalheGrupo] = useState<Grupo | "todos">("todos");
  const [showPorMoeda, setShowPorMoeda] = useState(false);

  const [expandedBrlReceber, setExpandedBrlReceber] = useState(false);
  const [expandedBrlPagar, setExpandedBrlPagar] = useState(false);
  const [expandedUsdReceber, setExpandedUsdReceber] = useState(false);
  const [expandedUsdPagar, setExpandedUsdPagar] = useState(false);

  // As 3 chamadas saem juntas e cada uma pinta o seu bloco assim que chega:
  // os cards não esperam /items, e a cotação não espera nenhuma das duas.
  const load = useCallback(
    (force = false) => {
      const id = ++reqId.current;
      const cached = force ? undefined : cacheFechamentoMes.get(month);
      setError("");
      setItemsError("");

      if (cached?.dashboard && cached.items !== undefined && cached.fxRate !== undefined) {
        setDashboard(cached.dashboard);
        setItems(cached.items);
        setFxRate(cached.fxRate);
        setDashLoading(false);
        setItemsLoading(false);
        return;
      }

      // Troca de mês sem cache: limpa o mês anterior pra não misturar números.
      if (!cached?.dashboard) {
        setDashboard(null);
        setItems(null);
      }
      setDashLoading(true);
      setItemsLoading(true);

      (apiFetch(`/gerencial/dashboard?month=${month}`) as Promise<DashboardResponse>)
        .then((d) => {
          mergeCacheMes(month, { dashboard: d });
          if (id !== reqId.current) return;
          setDashboard(d);
        })
        .catch((err: any) => {
          if (id !== reqId.current) return;
          setError(err?.message || "Falha ao carregar.");
        })
        .finally(() => {
          if (id === reqId.current) setDashLoading(false);
        });

      (apiFetch(`/gerencial/dashboard/items?month=${month}`) as Promise<DashboardItemsResponse>)
        .then((it) => {
          mergeCacheMes(month, { items: it.items });
          if (id !== reqId.current) return;
          setItems(it.items);
        })
        .catch((err: any) => {
          if (id !== reqId.current) return;
          setItemsError(err?.message || "Falha ao carregar os títulos do mês.");
        })
        .finally(() => {
          if (id === reqId.current) setItemsLoading(false);
        });

      // Tolerante: se a tabela de cotação ainda não existe, segue sem consolidar
      (apiFetch(`/gerencial/fx-rates?start=${month}&months_ahead=0`) as Promise<FxRatesResponse>)
        .then((fx) => fx.rates[0] ?? null)
        .catch(() => null)
        .then((rate) => {
          mergeCacheMes(month, { fxRate: rate });
          if (id !== reqId.current) return;
          setFxRate(rate);
        });
    },
    [month]
  );

  // Salvar cotação só muda a cotação: refaz só o fx.
  const reloadFx = useCallback(() => {
    const m = month;
    (apiFetch(`/gerencial/fx-rates?start=${m}&months_ahead=0`) as Promise<FxRatesResponse>)
      .then((fx) => fx.rates[0] ?? null)
      .catch(() => null)
      .then((rate) => {
        mergeCacheMes(m, { fxRate: rate });
        if (monthRef.current === m) setFxRate(rate);
      });
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
          onClick={() => load(true)}
          disabled={dashLoading || itemsLoading}
          className="rounded-lg border border-border bg-surface p-2 text-muted hover:bg-surface/80 disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${dashLoading || itemsLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {dashLoading && !dashboard ? (
        <FechamentoMesSkeleton />
      ) : (
        <>
          {dashboard?.grupos && (
            <GruposBlocos grupos={dashboard.grupos} rate={fxRate?.usd_brl ?? null} />
          )}

          {dashboard?.grupos && (
            <button
              onClick={() => setShowPorMoeda(!showPorMoeda)}
              className="mb-4 flex items-center gap-1 text-xs text-muted hover:text-foreground"
            >
              {showPorMoeda ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Ver por moeda (Caracol BR / Caracol LLC)
            </button>
          )}

          {dashboard && (!dashboard.grupos || showPorMoeda) && (
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
                onRateSaved={reloadFx}
                grupos={dashboard.grupos}
              />
            </div>
          )}

          {dashboard?.alertas_double_count && dashboard.alertas_double_count.length > 0 && (
            <DoubleCountAlerts alertas={dashboard.alertas_double_count} month={month} />
          )}

          {itemsError && !items && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
              <p className="text-sm text-danger">{itemsError}</p>
            </div>
          )}

          {itemsLoading && !items && <ItemsSkeleton />}

          {items && (
            <MonthItemsBreakdown
              items={items}
              moeda={detalheMoeda}
              onMoedaChange={setDetalheMoeda}
              grupo={detalheGrupo}
              onGrupoChange={setDetalheGrupo}
            />
          )}
        </>
      )}
    </>
  );
}

/* ---- Skeletons (no lugar do spinner de tela inteira) ---- */

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-border/60 ${className}`} />;
}

function SkeletonCard({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-5 ${className}`}>
      <SkeletonBlock className="mb-4 h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} className={`mb-2 h-3 ${i % 2 ? "w-2/3" : "w-full"}`} />
      ))}
      <SkeletonBlock className="mt-4 h-6 w-1/2" />
    </div>
  );
}

function FechamentoMesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando fechamento">
      <div className="mb-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </div>
      <SkeletonCard lines={1} className="mb-8" />
      <ItemsSkeleton />
    </div>
  );
}

function ItemsSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5" aria-busy="true">
      <SkeletonBlock className="mb-4 h-4 w-1/4" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mb-3 flex items-center justify-between gap-4">
          <SkeletonBlock className="h-3 w-1/2" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function FechamentoAnoSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando resumo anual">
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
      <SkeletonCard lines={1} className="mb-8" />
      <div className="rounded-xl border border-border bg-surface p-5">
        <SkeletonBlock className="mb-4 h-4 w-1/4" />
        <SkeletonBlock className="h-48 w-full" />
      </div>
    </div>
  );
}

/* ---- Fechamento: visão ANO (resumo anual + gráfico 12 meses) ---- */

// Cache em memória por ano (mesma regra do mês).
const cacheFechamentoAno = new Map<number, { forecast: ForecastResponse; rates: Record<string, number | null> }>();

function FechamentoAno() {
  const yearOpts = buildYearOptions();
  const [year, setYear] = useState(currentYear());
  const [forecast, setForecast] = useState<ForecastResponse | null>(
    () => cacheFechamentoAno.get(currentYear())?.forecast ?? null
  );
  const [rates, setRates] = useState<Record<string, number | null>>(
    () => cacheFechamentoAno.get(currentYear())?.rates ?? {}
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reqId = useRef(0);

  const [forecastMetric, setForecastMetric] = useState<ForecastMetric>("net");
  const [forecastMoeda, setForecastMoeda] = useState<ChartBase>("BRL");

  const load = useCallback(
    async (force = false) => {
      const id = ++reqId.current;
      const cached = force ? undefined : cacheFechamentoAno.get(year);
      setError("");
      if (cached) {
        setForecast(cached.forecast);
        setRates(cached.rates);
        setLoading(false);
        return;
      }
      setLoading(true);
      if (!force) setForecast(null);
      try {
        // forecast e cotações em paralelo; cotação é tolerante (sem tabela => {}).
        const fxP = (apiFetch(`/gerencial/fx-rates?start=${year}-01&months_ahead=11`) as Promise<FxRatesResponse>)
          .then((fx) => {
            const map: Record<string, number | null> = {};
            for (const r of fx.rates) map[r.month] = r.usd_brl;
            return map;
          })
          .catch(() => ({}) as Record<string, number | null>);
        const [f, map] = await Promise.all([
          apiFetch(`/gerencial/forecast?start=${year}-01&months_ahead=11`) as Promise<ForecastResponse>,
          fxP
        ]);
        cacheFechamentoAno.set(year, { forecast: f, rates: map });
        if (id !== reqId.current) return;
        setForecast(f);
        setRates(map);
      } catch (err: any) {
        if (id !== reqId.current) return;
        setError(err?.message || "Falha ao carregar.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [year]
  );

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
          onClick={() => load(true)}
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
        <FechamentoAnoSkeleton />
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
  onRateSaved,
  grupos
}: {
  month: string;
  brlNet: number;
  usdNet: number;
  fxRate: FxRate | null;
  onRateSaved: () => void;
  grupos?: GruposResultado;
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
          <h3 className="text-sm font-semibold text-foreground">
            {grupos ? `Resultado do mês (${GRUPOS.map((g) => g.label).join(" + ")})` : "Resultado consolidado (R$)"}
          </h3>
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
      {fxRate?.by && fxRate.updated_at && (
        <p className="mt-2 text-xs text-muted">
          Cotação editada por {fxRate.by} em {formatDateTimeShort(fxRate.updated_at)}
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
            {grupos && rate != null ? (
              <p className="mt-1 text-xs text-muted">
                {GRUPOS.map((g, i) => (
                  <span key={g.key}>
                    {i > 0 && " + "}
                    {g.label} {formatCurrency(grupoNetBrl(grupoOf(grupos, g.key), rate), "BRL")}
                  </span>
                ))}
              </p>
            ) : null}
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

/* ---- Blocos Mobile / Talent / Jobs / Empresa (quando o backend manda `grupos`) ---- */

const GRUPOS: Array<{ key: Grupo; label: string; desc: string }> = [
  {
    key: "mobile",
    label: "Mobile",
    desc: "Campanhas: entra custo reembolsado + LL Caracol, sai pagamento de publisher"
  },
  { key: "talent", label: "Talent", desc: "NFs com tag Talent: margem, repasse e imposto" },
  { key: "jobs", label: "Jobs", desc: "NFs com tag Jobs (a receber e a pagar)" },
  { key: "empresa", label: "Empresa", desc: "Salário, custos fixos, avulsos e o resto" }
];

type GrupoMoedas = { brl: ResultadoAnualMoeda; usd: ResultadoAnualMoeda };

function entradasOf(m: ResultadoAnualMoeda): number {
  return m.recebido_mes + m.a_receber;
}

function saidasOf(m: ResultadoAnualMoeda): number {
  return m.pago_mes + m.a_pagar;
}

// Net do bloco em R$: lado USD convertido pela mesma cotacao do card consolidado
const ZERO_MOEDA: ResultadoAnualMoeda = { recebido_mes: 0, a_receber: 0, pago_mes: 0, a_pagar: 0 };

// Tolerante a payload parcial do backend (grupo ou moeda ausente = zero)
function grupoOf(grupos: GruposResultado, key: Grupo): GrupoMoedas {
  const g = grupos[key];
  return { brl: { ...ZERO_MOEDA, ...(g?.brl ?? {}) }, usd: { ...ZERO_MOEDA, ...(g?.usd ?? {}) } };
}

function grupoNetBrl(g: GrupoMoedas, rate: number): number {
  return entradasOf(g.brl) - saidasOf(g.brl) + (entradasOf(g.usd) - saidasOf(g.usd)) * rate;
}

function GruposBlocos({ grupos, rate }: { grupos: GruposResultado; rate: number | null }) {
  const total =
    rate != null ? GRUPOS.reduce((s, g) => s + grupoNetBrl(grupoOf(grupos, g.key), rate), 0) : null;
  return (
    <div className="mb-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {GRUPOS.map((g) => (
          <GrupoBloco key={g.key} label={g.label} desc={g.desc} data={grupoOf(grupos, g.key)} rate={rate} />
        ))}
      </div>
      {rate == null && (
        <p className="text-xs text-amber-300">
          Sem cotação do mês: os blocos mostram só o detalhe por moeda. Informe a cotação abaixo pra consolidar em R$.
        </p>
      )}
      {total != null && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-5 py-3">
          <span className="text-sm text-muted">Soma dos {GRUPOS.length} blocos (R$)</span>
          <span className={`font-mono text-base font-semibold ${total >= 0 ? "text-sky-300" : "text-danger"}`}>
            {formatCurrency(total, "BRL")}
          </span>
        </div>
      )}
    </div>
  );
}

function GrupoBloco({
  label,
  desc,
  data,
  rate
}: {
  label: string;
  desc: string;
  data: GrupoMoedas;
  rate: number | null;
}) {
  const entradas = rate != null ? entradasOf(data.brl) + entradasOf(data.usd) * rate : null;
  const saidas = rate != null ? saidasOf(data.brl) + saidasOf(data.usd) * rate : null;
  const net = entradas != null && saidas != null ? entradas - saidas : null;
  const temUsd = entradasOf(data.usd) !== 0 || saidasOf(data.usd) !== 0;
  const temBrl = entradasOf(data.brl) !== 0 || saidasOf(data.brl) !== 0;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <p className="text-xs text-muted">{desc}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Entradas</span>
          <span className="font-mono text-emerald-300">
            {entradas != null ? formatCurrency(entradas, "BRL") : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Saídas</span>
          <span className="font-mono text-danger">{saidas != null ? formatCurrency(saidas, "BRL") : "—"}</span>
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Resultado</span>
          {net != null ? (
            <span className={`font-mono text-base font-semibold ${net >= 0 ? "text-sky-300" : "text-danger"}`}>
              {formatCurrency(net, "BRL")}
            </span>
          ) : (
            <span className="text-xs text-muted">sem cotação</span>
          )}
        </div>
      </div>

      {/* Detalhe por moeda (secundario) */}
      <div className="mt-3 space-y-1 border-t border-border pt-3 text-[11px] text-muted">
        {!temBrl && !temUsd && <p>Nada neste bloco no mês.</p>}
        {temBrl && <MoedaLinha moeda="BRL" m={data.brl} />}
        {temUsd && <MoedaLinha moeda="USD" m={data.usd} />}
      </div>
    </div>
  );
}

function MoedaLinha({ moeda, m }: { moeda: Moeda; m: ResultadoAnualMoeda }) {
  return (
    <p
      className="flex flex-wrap justify-between gap-x-2"
      title={`Recebido ${formatCurrency(m.recebido_mes, moeda)} · a receber ${formatCurrency(
        m.a_receber,
        moeda
      )} · pago ${formatCurrency(m.pago_mes, moeda)} · a pagar ${formatCurrency(m.a_pagar, moeda)}`}
    >
      <span>{moeda === "BRL" ? "R$" : "US$"}</span>
      <span className="font-mono">
        +{formatCurrency(entradasOf(m), moeda)} / −{formatCurrency(saidasOf(m), moeda)}
      </span>
    </p>
  );
}

/* Alerta informativo: NF com competencia no mes sem vinculo com a campanha
   (fechamento travado continua contando o publisher como a pagar + a NF entra de novo) */
function DoubleCountAlerts({ alertas, month }: { alertas: AlertaDoubleCount[]; month: string }) {
  return (
    <div className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
          <div>
            <h3 className="text-sm font-semibold text-amber-300">
              Possível dívida contada 2x ({alertas.length})
            </h3>
            <p className="text-xs text-muted">
              NF a pagar com competência no mês, mas sem vínculo com a campanha: o fechamento e a NF entram os dois
              no a pagar. Informativo, não muda os totais. Vincule a NF à campanha no app NF.
            </p>
          </div>
        </div>
        <a
          href={`https://nf.aeobr.com.br/sugestoes-vinculo?month=${month}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-400/10"
        >
          ver sugestões de vínculo
        </a>
      </div>
      <ul className="space-y-1.5">
        {alertas.map((a) => (
          <li
            key={`${a.invoice_id}-${a.campanha_id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            <span className="text-foreground">
              {a.supplier_name || "Fornecedor"} · {a.campanha_name || "Campanha"}
              <span className="text-muted"> · NF {a.invoice_number || "s/ nº"}</span>
            </span>
            <span className="font-mono text-muted">
              NF {formatCurrency(a.valor_nf, a.moeda)} · fechamento {formatCurrency(a.valor_fechamento, a.moeda)}
            </span>
          </li>
        ))}
      </ul>
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
    case "fechamento_campanha":
      return "Fechamento";
    case "fechamento_publisher":
      return "Pagamento publisher";
    case "fechamento_custo":
      return "Custo (fechamento)";
    case "fechamento_margem":
      return "Margem (fechamento)";
    // NF a receber com tag Talent: decomposta em custo/margem/imposto (+ offsets a pagar
    // que reconciliam o net com o summary). Mesmo padrao do split Wave acima.
    case "nf_receivable_custo":
      return "Custo (NF a receber)";
    case "nf_receivable_margem":
      return "Margem (NF a receber)";
    case "nf_receivable_imposto":
      return "Imposto (NF a receber)";
    case "nf_receivable_custo_offset":
      return "Repasse (reconciliação)";
    case "nf_receivable_imposto_offset":
      return "Imposto (reconciliação)";
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
  onMoedaChange,
  grupo,
  onGrupoChange
}: {
  items: DashboardItem[];
  moeda: Moeda;
  onMoedaChange: (m: Moeda) => void;
  grupo: Grupo | "todos";
  onGrupoChange: (g: Grupo | "todos") => void;
}) {
  // Filtro por bloco so aparece quando o backend ja manda `grupo` nos itens
  const temGrupo = items.some((it) => it.grupo);
  const grupoAtivo = temGrupo ? grupo : "todos";
  const ofMoeda = items.filter(
    (it) => it.moeda === moeda && (grupoAtivo === "todos" || it.grupo === grupoAtivo)
  );
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
        <div className="flex flex-wrap items-center gap-3">
          {temGrupo && (
            <div className="flex items-center gap-1">
              {([{ key: "todos", label: "Todos" }, ...GRUPOS] as Array<{ key: Grupo | "todos"; label: string }>).map(
                (g) => (
                  <button
                    key={g.key}
                    onClick={() => onGrupoChange(g.key)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      grupoAtivo === g.key ? "bg-primary text-black" : "bg-background text-muted hover:text-foreground"
                    }`}
                  >
                    {g.label}
                  </button>
                )
              )}
            </div>
          )}
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
      </div>
      {ofMoeda.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">
          Nenhum título em {moeda === "BRL" ? "R$" : "US$"}
          {grupoAtivo !== "todos" && ` no bloco ${GRUPOS.find((g) => g.key === grupoAtivo)?.label}`} neste mês.
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

const NF_APP_URL = "https://nf.aeobr.com.br";

// Titulo do card: "<contraparte> · NF <numero>" quando o backend manda o contexto;
// senao cai na `descricao` de sempre.
function itemTitle(it: DashboardItem): string {
  const parts: string[] = [];
  if (it.counterparty) parts.push(it.counterparty);
  if (it.nf_number) parts.push(`NF ${it.nf_number}`);
  return parts.length > 0 ? parts.join(" · ") : it.descricao;
}

// NF a pagar tem detalhe em /invoice/[id]; NF a receber nao tem rota de detalhe
// no app NF (edicao e modal na lista), entao cai na aba "receber".
function nfHref(it: DashboardItem): string | null {
  if (!it.nf_id) return null;
  const kind =
    it.nf_kind ?? (it.source === "nf_invoices" ? "invoice" : it.source === "nf_receivables" ? "receivable" : null);
  if (kind === "invoice") return `${NF_APP_URL}/invoice/${encodeURIComponent(it.nf_id)}`;
  if (kind === "receivable") return `${NF_APP_URL}/?view=receber`;
  return null;
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
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm text-foreground" title={itemTitle(it)}>
                      {itemTitle(it)}
                    </p>
                    {it.sem_nf === true && (
                      <span
                        title={
                          it.tipo === "pagar"
                            ? "Suba uma NF a pagar e vincule esta campanha pra registrar o pagamento"
                            : "Suba uma NF a receber e vincule esta campanha pra faturar"
                        }
                        className="flex flex-shrink-0 items-center gap-1 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        sem NF vinculada
                      </span>
                    )}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted">
                    {it.grupo && <span>{GRUPOS.find((g) => g.key === it.grupo)?.label ?? it.grupo} · </span>}
                    {it.tag_name && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {it.tag_name}
                      </span>
                    )}
                    {it.tag_name && <span> · </span>}
                    <span>{sourceLabel(it.source)}</span>
                    {it.due_date && <span> · vence {it.due_date}</span>}
                    {nfHref(it) && (
                      <a
                        href={nfHref(it)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
                      >
                        abrir no NF
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </p>
                  {it.nf_description && (
                    <p className="mt-0.5 truncate text-[11px] text-muted/80" title={it.nf_description}>
                      {it.nf_description}
                    </p>
                  )}
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

// Cache em memória da aba Fluxo, por URL da rota (mês/intervalo já vão na query).
// Guarda a promise (dedupe: o modal de drill e o Caixa realizado do mesmo mês
// compartilham 1 request) e o valor resolvido (render síncrono ao voltar pra um
// mês já visto). Atualizar e qualquer escrita (saldo, remessa, transferência)
// zeram tudo; zerado também quando o DashboardView remonta.
const fluxoPromises = new Map<string, Promise<unknown>>();
const fluxoValues = new Map<string, unknown>();

function invalidateFluxo() {
  fluxoPromises.clear();
  fluxoValues.clear();
}

function fluxoPeek<T>(path: string): T | undefined {
  return fluxoValues.get(path) as T | undefined;
}

function fluxoGet<T>(path: string, force = false): Promise<T> {
  if (!force) {
    const hit = fluxoPromises.get(path);
    if (hit) return hit as Promise<T>;
  }
  const p: Promise<unknown> = apiFetch(path).then(
    (v) => {
      if (fluxoPromises.get(path) === p) fluxoValues.set(path, v);
      return v;
    },
    (err) => {
      if (fluxoPromises.get(path) === p) fluxoPromises.delete(path);
      throw err;
    }
  );
  fluxoPromises.set(path, p);
  return p as Promise<T>;
}

const cashflowPath = (month: string) => `/gerencial/cashflow?months_ahead=6&start=${month}`;
const cashflowItemsPath = (month: string) => `/gerencial/cashflow/items?month=${month}`;
const reconciliationPath = (month: string) => `/gerencial/reconciliation?month=${month}`;
const openingBalancePath = (month: string) => `/gerencial/opening-balance?month=${month}`;
const REMITTANCES_PATH = `/gerencial/remittances`;
const transfersPath = (month: string) => `/gerencial/transfers?month=${month}`;

function FluxoTab() {
  const monthOpts = buildMonthOptions();
  const [month, setMonth] = useState(currentYearMonth());
  const [data, setData] = useState<CashflowResponse | null>(
    () => fluxoPeek<CashflowResponse>(cashflowPath(currentYearMonth())) ?? null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drill, setDrill] = useState<{ month: string; tipo: "recebido" | "pago" } | null>(null);
  const [moeda, setMoeda] = useState<Moeda>("BRL");
  const [overdueOpen, setOverdueOpen] = useState(false);
  // Muda a cada Atualizar: as seções refazem o fetch (o cache já foi zerado).
  const [refreshKey, setRefreshKey] = useState(0);
  const reqId = useRef(0);

  const load = useCallback(
    async (force = false) => {
      const id = ++reqId.current;
      const path = cashflowPath(month);
      const cached = force ? undefined : fluxoPeek<CashflowResponse>(path);
      setError("");
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
      setLoading(true);
      // Troca de mês sem cache: limpa o mês anterior pra não misturar números.
      if (!force) setData(null);
      try {
        const r = await fluxoGet<CashflowResponse>(path, force);
        if (id === reqId.current) setData(r);
      } catch (err: any) {
        if (id === reqId.current) setError(err?.message || "Falha ao carregar fluxo de caixa.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [month]
  );

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Escrita numa seção (saldo/remessa/transferência): recarrega a projeção.
  const reloadCashflow = useCallback(() => load(true), [load]);

  const refreshAll = () => {
    invalidateFluxo();
    setRefreshKey((k) => k + 1);
  };

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
    const recebidoReal = moeda === "BRL" ? m.recebido_brl ?? 0 : m.recebido_usd ?? 0;
    const pagoReal = moeda === "BRL" ? m.pago_brl ?? 0 : m.pago_usd ?? 0;
    const remessaIn = moeda === "USD" ? m.remessa_usd_in ?? 0 : 0; // US$ que chegou
    const remessaOut = moeda === "BRL" ? m.remessa_brl_out ?? 0 : 0; // R$ que saiu
    // Recebido (entrou) e Pago (saiu), já com a remessa embutida
    const recebido = recebidoReal + remessaIn;
    const pago = pagoReal + remessaOut;
    // movimento = a receber − a pagar + recebido − pago
    const movimento = receber - pagar + recebido - pago;
    running = running != null ? running + movimento : null;
    // O backend traz os vencidos (antes de 01/âncora) para o primeiro bucket.
    const isAnchor = i === 0;
    return {
      month: m,
      receber,
      pagar,
      recebido,
      recebidoReal,
      remessaIn,
      pago,
      pagoReal,
      remessaOut,
      saldoProjetado: running,
      overduePagar: isAnchor ? overduePagar : 0
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
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            title="Mês da aba (projeção, em atraso, caixa realizado e conciliação)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
          >
            {monthOpts.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
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
            onClick={refreshAll}
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
        <FluxoSkeleton />
      ) : data ? (
        <>
          {/* Saldo em caixa por conta (onde o dinheiro fica) */}
          <SaldoContasCards saldo={data.saldo_contas} />

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
                  <p className="text-xs text-muted">
                    Títulos com vencimento anterior a 01/{formatMonthLabel(data.anchor ?? month)}.
                  </p>
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
                  <h2 className="text-sm font-semibold text-foreground">
                    Projeção de caixa por vencimento{" "}
                    <span className="text-muted">(a partir de {formatMonthLabel(data.anchor ?? month)})</span>
                  </h2>
                  <p className="text-xs text-muted">
                    Saldo inicial + a receber − a pagar ± remessa, por data de vencimento. Ancora no mês selecionado
                    no topo da aba.
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
              <div className={`${CASHFLOW_GRID} border-b border-border py-2 text-xs text-muted`}>
                <span>Mês</span>
                <span className="text-right">A receber</span>
                <span className="text-right">A pagar</span>
                <span className="text-right">Recebido</span>
                <span className="text-right">Pago</span>
                <span className="text-right">Saldo proj.</span>
              </div>
              <div className="divide-y divide-border">
                {timelineRows.map((r) => (
                  <CashflowMonthRow
                    key={r.month.month}
                    month={r.month}
                    moeda={moeda}
                    receber={r.receber}
                    pagar={r.pagar}
                    recebido={r.recebido}
                    recebidoReal={r.recebidoReal}
                    remessaIn={r.remessaIn}
                    pago={r.pago}
                    pagoReal={r.pagoReal}
                    remessaOut={r.remessaOut}
                    saldoProjetado={r.saldoProjetado}
                    overduePagar={r.overduePagar}
                    onDrill={(m, tipo) => setDrill({ month: m, tipo })}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}

      <div className="mt-6 space-y-6">
        <MonthCashRealized month={month} moeda={moeda} refreshKey={refreshKey} />
        <ReconciliationSection month={month} refreshKey={refreshKey} onChanged={reloadCashflow} />
        <RemittancesSection refreshKey={refreshKey} onChanged={reloadCashflow} />
        <TransfersSection month={month} refreshKey={refreshKey} onChanged={reloadCashflow} />
      </div>

      {drill && (
        <CashflowItemsModal
          month={drill.month}
          tipo={drill.tipo}
          moeda={moeda}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}

function FluxoSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando fluxo de caixa">
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
      <SkeletonCard lines={1} className="mb-6" />
      <ItemsSkeleton />
    </div>
  );
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="p-5" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="mb-3 flex items-center justify-between gap-4">
          <SkeletonBlock className="h-3 w-1/2" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/* Saldo em caixa por conta (onde o dinheiro fica) — split por conta + total */
function SaldoContasCards({ saldo }: { saldo?: SaldoContas }) {
  if (!saldo) return null; // backend antigo sem saldo_contas — não quebra
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2">
      <SaldoContaCard title="Caracol BR (R$)" moeda="BRL" data={saldo.brl} />
      <SaldoContaCard title="Caracol LLC (US$)" moeda="USD" data={saldo.usd} />
    </div>
  );
}

function SaldoContaCard({
  title,
  moeda,
  data
}: {
  title: string;
  moeda: Moeda;
  data: SaldoContas["brl"];
}) {
  const contas = contasOf(moeda);
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Wallet className="h-4 w-4 text-muted" />
      </div>
      <div className="space-y-2 text-sm">
        {contas.map((c) => (
          <div key={c.value} className="flex items-center justify-between">
            <span className="text-muted">{c.label}</span>
            <span className="font-mono text-foreground">
              {formatCurrency(data?.contas?.[c.value] ?? 0, moeda)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-base font-semibold text-foreground">Total em caixa</span>
          <span className="font-mono text-lg font-semibold text-sky-300">
            {formatCurrency(data?.total ?? 0, moeda)}
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Abertura + movimentos do mês por conta. NF a pagar/receber não têm conta, então ficam de fora.
      </p>
    </div>
  );
}

function CashflowItemsModal({
  month,
  tipo,
  moeda,
  onClose
}: {
  month: string;
  tipo: "recebido" | "pago";
  moeda: Moeda;
  onClose: () => void;
}) {
  const [items, setItems] = useState<CashflowComposeItem[] | null>(
    () => fluxoPeek<CashflowItemsResponse>(cashflowItemsPath(month))?.items ?? null
  );
  const [loading, setLoading] = useState(items == null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setError("");
      try {
        // Mesmo cache do Caixa realizado: drill no mês do topo = 0 requests.
        const r = await fluxoGet<CashflowItemsResponse>(cashflowItemsPath(month));
        if (alive) setItems(r.items);
      } catch (err: any) {
        if (alive) setError(err?.message || "Falha ao carregar.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [month]);

  const filtered = (items ?? []).filter((it) => it.moeda === moeda && it.tipo === tipo);
  const total = filtered.reduce((s, it) => s + it.amount, 0);
  const titulo = tipo === "recebido" ? "Recebido" : "Pago";
  const accent = tipo === "recebido" ? "text-emerald-300" : "text-danger";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {titulo} em {formatMonthLabel(month)} ({moeda === "BRL" ? "R$" : "US$"})
            </h2>
            <p className="text-xs text-muted">Títulos liquidados no mês (regime de caixa).</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-background hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : error ? (
            <p className="py-6 text-center text-sm text-danger">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Nenhum título.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((it, i) => (
                <li
                  key={`${it.source}-${i}`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{it.descricao}</p>
                    <p className="text-xs text-muted">
                      {sourceLabel(it.source)} · {it.date}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 font-mono text-sm ${accent}`}>{formatCurrency(it.amount, moeda)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-sm font-medium text-foreground">Total</span>
          <span className={`font-mono text-sm font-semibold ${accent}`}>{formatCurrency(total, moeda)}</span>
        </div>
      </div>
    </div>
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

// Grade fixa da projeção de caixa: mês + 5 colunas numéricas alinhadas
const CASHFLOW_GRID = "grid grid-cols-[3.5rem_repeat(5,minmax(0,1fr))] items-start gap-x-4 px-5";

function CashflowCell({
  value,
  moeda,
  tone,
  title,
  onClick
}: {
  value: number;
  moeda: Moeda;
  tone: string;
  title?: string;
  onClick?: () => void;
}) {
  if (value === 0) return <span className="text-right font-mono text-sm text-muted">—</span>;
  if (!title && !onClick) {
    return <span className={`text-right font-mono text-sm ${tone}`}>{formatCurrency(value, moeda)}</span>;
  }
  const inner = (
    <span
      onClick={onClick}
      className={`font-mono text-sm underline decoration-dotted decoration-muted/50 underline-offset-4 ${tone} ${
        onClick ? "cursor-pointer hover:opacity-80" : "cursor-help"
      }`}
    >
      {formatCurrency(value, moeda)}
    </span>
  );
  if (!title) return <span className="flex justify-end">{inner}</span>;
  return (
    <span className="group relative flex justify-end">
      {inner}
      <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 hidden whitespace-nowrap rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground shadow-lg group-hover:block">
        {title}
      </span>
    </span>
  );
}

// Tooltip "Pagamentos X + Remessa Y" (só os componentes não-zero)
function breakdownTitle(label: string, base: number, remessa: number, moeda: Moeda): string | undefined {
  if (remessa === 0) return undefined; // sem remessa, não precisa quebrar
  const parts: string[] = [];
  if (base !== 0) parts.push(`${label} ${formatCurrency(base, moeda)}`);
  parts.push(`Remessa ${formatCurrency(remessa, moeda)}`);
  return parts.join("  +  ");
}

function CashflowMonthRow({
  month,
  moeda,
  receber,
  pagar,
  recebido,
  recebidoReal,
  remessaIn,
  pago,
  pagoReal,
  remessaOut,
  saldoProjetado,
  overduePagar = 0,
  onDrill
}: {
  month: CashflowMonth;
  moeda: Moeda;
  receber: number;
  pagar: number;
  recebido: number; // entrou no caixa (recebimentos + remessa US$)
  recebidoReal: number;
  remessaIn: number;
  pago: number; // saiu do caixa (pagamentos + remessa R$)
  pagoReal: number;
  remessaOut: number;
  saldoProjetado: number | null;
  overduePagar?: number;
  onDrill?: (month: string, tipo: "recebido" | "pago") => void;
}) {
  const showOverdueHint = overduePagar > 0;
  return (
    <div className={`${CASHFLOW_GRID} py-3`}>
      <span className="text-sm font-medium text-foreground">{shortMonth(month.month)}</span>
      <CashflowCell value={receber} moeda={moeda} tone="text-emerald-300" />
      <div className="flex flex-col items-end">
        <CashflowCell value={pagar} moeda={moeda} tone="text-danger" />
        {showOverdueHint && (
          <span className="text-[10px] text-muted">inclui {formatCurrency(overduePagar, moeda)} em atraso</span>
        )}
      </div>
      <CashflowCell
        value={recebido}
        moeda={moeda}
        tone="text-emerald-300"
        title={breakdownTitle("Recebimentos", recebidoReal, remessaIn, moeda)}
        onClick={onDrill ? () => onDrill(month.month, "recebido") : undefined}
      />
      <CashflowCell
        value={pago}
        moeda={moeda}
        tone="text-danger"
        title={breakdownTitle("Pagamentos", pagoReal, remessaOut, moeda)}
        onClick={onDrill ? () => onDrill(month.month, "pago") : undefined}
      />
      {saldoProjetado != null ? (
        <span
          className={`text-right font-mono text-sm font-semibold ${
            saldoProjetado >= 0 ? "text-sky-300" : "text-danger"
          }`}
        >
          {formatCurrency(saldoProjetado, moeda)}
        </span>
      ) : (
        <span className="text-right font-mono text-sm text-muted">—</span>
      )}
    </div>
  );
}

/* ---- Caixa realizado do mês selecionado (respeita o seletor de mês) ---- */

function MonthCashRealized({ month, moeda, refreshKey }: { month: string; moeda: Moeda; refreshKey: number }) {
  const [items, setItems] = useState<CashflowComposeItem[] | null>(
    () => fluxoPeek<CashflowItemsResponse>(cashflowItemsPath(month))?.items ?? null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const path = cashflowItemsPath(month);
    const cached = fluxoPeek<CashflowItemsResponse>(path);
    setError("");
    if (cached) {
      setItems(cached.items);
      setLoading(false);
      return;
    }
    setLoading(true);
    setItems(null);
    (async () => {
      try {
        const r = await fluxoGet<CashflowItemsResponse>(path);
        if (alive) setItems(r.items);
      } catch (err: any) {
        if (alive) setError(err?.message || "Falha ao carregar o caixa do mês.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [month, refreshKey]);

  const ofMoeda = (items ?? []).filter((it) => it.moeda === moeda);
  const recebidos = ofMoeda.filter((it) => it.tipo === "recebido");
  const pagos = ofMoeda.filter((it) => it.tipo === "pago");
  const totalRec = recebidos.reduce((s, it) => s + it.amount, 0);
  const totalPago = pagos.reduce((s, it) => s + it.amount, 0);
  const net = totalRec - totalPago;
  const hasItems = ofMoeda.length > 0;

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!hasItems}
        className="flex w-full items-center justify-between gap-3 border-b border-border px-5 py-4 text-left disabled:cursor-default"
      >
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Caixa realizado de {formatMonthLabel(month)} ({moeda === "BRL" ? "R$" : "US$"})
          </h2>
          <p className="text-xs text-muted">
            O que de fato entrou e saiu no mês, por data de liquidação. Respeita o mês selecionado no topo da aba.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-muted">Recebido</p>
            <p className="font-mono text-sm font-semibold text-emerald-300">{formatCurrency(totalRec, moeda)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Pago</p>
            <p className="font-mono text-sm font-semibold text-danger">{formatCurrency(totalPago, moeda)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Movimento</p>
            <p className={`font-mono text-sm font-semibold ${net >= 0 ? "text-sky-300" : "text-danger"}`}>
              {formatCurrency(net, moeda)}
            </p>
          </div>
          {hasItems &&
            (open ? (
              <ChevronDown className="h-4 w-4 text-muted" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted" />
            ))}
        </div>
      </button>

      {error && <p className="px-5 py-3 text-sm text-danger">{error}</p>}

      {loading && !items ? (
        <SectionSkeleton rows={2} />
      ) : !error && !hasItems ? (
        <p className="px-5 py-8 text-center text-sm text-muted">
          Nenhum movimento de caixa em {moeda === "BRL" ? "R$" : "US$"} neste mês.
        </p>
      ) : open ? (
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <MonthCashColumn title="Recebido (entrou)" accent="text-emerald-300" items={recebidos} moeda={moeda} />
          <MonthCashColumn title="Pago (saiu)" accent="text-danger" items={pagos} moeda={moeda} />
        </div>
      ) : null}
    </div>
  );
}

function MonthCashColumn({
  title,
  accent,
  items,
  moeda
}: {
  title: string;
  accent: string;
  items: CashflowComposeItem[];
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
          {items.map((it, i) => (
            <li
              key={`${it.source}-${i}`}
              className="flex items-start justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{it.descricao}</p>
                <p className="text-xs text-muted">
                  {sourceLabel(it.source)} · {it.date}
                </p>
              </div>
              <span className={`flex-shrink-0 font-mono text-sm ${accent}`}>{formatCurrency(it.amount, moeda)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---- Saldos & Conciliação de caixa ---- */

function ReconciliationSection({
  month,
  refreshKey,
  onChanged
}: {
  month: string;
  refreshKey: number;
  onChanged?: () => void;
}) {
  const nextMonth = nextMonthOf(month);
  const [recon, setRecon] = useState<ReconciliationResponse | null>(
    () => fluxoPeek<ReconciliationResponse>(reconciliationPath(month)) ?? null
  );
  // Saldos de abertura por conta (mês corrente + próximo) — para os inputs por conta.
  // São 2 chamadas distintas (mês e mês+1), não duplicadas; o cache por mês faz a do
  // mês+1 ser reaproveitada ao avançar o seletor.
  const [openCur, setOpenCur] = useState<OpeningBalance | null>(
    () => fluxoPeek<OpeningBalance>(openingBalancePath(month)) ?? null
  );
  const [openNext, setOpenNext] = useState<OpeningBalance | null>(
    () => fluxoPeek<OpeningBalance>(openingBalancePath(nextMonth)) ?? null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reqId = useRef(0);

  const load = useCallback(
    async (force = false) => {
      const id = ++reqId.current;
      const paths = [reconciliationPath(month), openingBalancePath(month), openingBalancePath(nextMonth)];
      setError("");
      const cached = force ? [] : paths.map((p) => fluxoPeek<unknown>(p));
      if (!force && cached.every((c) => c !== undefined)) {
        setRecon(cached[0] as ReconciliationResponse);
        setOpenCur(cached[1] as OpeningBalance);
        setOpenNext(cached[2] as OpeningBalance);
        setLoading(false);
        return;
      }
      setLoading(true);
      if (!force) setRecon(null);
      try {
        const [r, oc, on] = await Promise.all([
          fluxoGet<ReconciliationResponse>(paths[0], force),
          fluxoGet<OpeningBalance>(paths[1], force),
          fluxoGet<OpeningBalance>(paths[2], force)
        ]);
        if (id !== reqId.current) return;
        setRecon(r);
        setOpenCur(oc);
        setOpenNext(on);
      } catch (err: any) {
        if (id === reqId.current) setError(err?.message || "Falha ao carregar conciliação.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [month, nextMonth]
  );

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Ao salvar um saldo: zera o cache (saldo muda projeção/conciliação de outros
  // meses), recarrega a conciliação E avisa o pai (projeção de caixa)
  const handleSaved = useCallback(() => {
    invalidateFluxo();
    load(true);
    onChanged?.();
  }, [load, onChanged]);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Saldos & conciliação — {formatMonthLabel(month)}
          </h2>
          <p className="text-xs text-muted">
            Informe o saldo no dia 01. Esperado fim do mês = abertura + recebido − pago ± remessa. No dia 01 do mês
            seguinte, veja se bate. Usa o mês selecionado no topo da aba.
          </p>
        </div>
      </div>

      {error && <p className="px-5 py-3 text-sm text-danger">{error}</p>}

      {loading && !recon ? (
        <SectionSkeleton rows={5} />
      ) : recon ? (
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <MoedaReconColumn
            moeda="BRL"
            month={month}
            nextMonth={recon.next_month}
            data={recon.brl}
            curContas={openCur?.contas?.BRL}
            nextContas={openNext?.contas?.BRL}
            onSaved={handleSaved}
          />
          <MoedaReconColumn
            moeda="USD"
            month={month}
            nextMonth={recon.next_month}
            data={recon.usd}
            curContas={openCur?.contas?.USD}
            nextContas={openNext?.contas?.USD}
            onSaved={handleSaved}
          />
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
  curContas,
  nextContas,
  onSaved
}: {
  moeda: Moeda;
  month: string;
  nextMonth: string;
  data: ReconciliationResponse["brl"];
  curContas?: Record<string, number>;
  nextContas?: Record<string, number>;
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
        <div>
          <span className="text-muted">Saldo em 01/{formatMonthLabel(month)} (por conta)</span>
          <OpeningBalanceContaEditor
            month={month}
            moeda={moeda}
            contaValues={curContas}
            meta={data.abertura_meta}
            onSaved={onSaved}
          />
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
        <div className="pt-1">
          <span className="text-muted">Saldo em 01/{formatMonthLabel(nextMonth)} (por conta)</span>
          <OpeningBalanceContaEditor
            month={nextMonth}
            moeda={moeda}
            contaValues={nextContas}
            meta={data.abertura_proximo_meta}
            onSaved={onSaved}
          />
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

// Próximo mês (YYYY-MM) de um mês YYYY-MM
function nextMonthOf(month: string): string {
  const m = month.match(/^(\d{4})-(\d{2})/);
  if (!m) return month;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

// Editor do saldo de abertura POR CONTA (um input por conta da moeda). Salva
// tudo num único PUT { month, balances: [{ moeda, conta, amount }] }.
function OpeningBalanceContaEditor({
  month,
  moeda,
  contaValues,
  meta,
  onSaved
}: {
  month: string;
  moeda: Moeda;
  contaValues?: Record<string, number>; // conta -> amount (só as informadas vêm do backend)
  meta?: EditStamp | null;
  onSaved: () => void;
}) {
  const contas = contasOf(moeda);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Seed dos inputs a partir dos valores do backend. Sempre itera a lista
  // canônica de contas (contaValues traz só as informadas).
  useEffect(() => {
    const seeded: Record<string, string> = {};
    for (const c of contas) {
      const v = contaValues?.[c.value];
      seeded[c.value] = v != null ? String(v).replace(".", ",") : "";
    }
    setInputs(seeded);
  }, [contaValues, moeda, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = contas.reduce((s, c) => {
    const n = parseNumberPtBr(inputs[c.value] ?? "");
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  const save = async () => {
    const balances: Array<{ moeda: Moeda; conta: string; amount: number }> = [];
    for (const c of contas) {
      const raw = (inputs[c.value] ?? "").trim();
      if (raw === "") continue;
      const n = parseNumberPtBr(raw);
      if (!Number.isFinite(n)) {
        setErr(`Valor inválido em ${c.label}.`);
        return;
      }
      balances.push({ moeda, conta: c.value, amount: n });
    }
    if (balances.length === 0) {
      setErr("Informe ao menos uma conta.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await apiFetch(`/gerencial/opening-balance`, {
        method: "PUT",
        body: JSON.stringify({ month, balances })
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 rounded-lg border border-border bg-background p-2.5">
      <div className="space-y-1.5">
        {contas.map((c) => (
          <div key={c.value} className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">{c.label}</span>
            <div className="flex items-center rounded-md border border-border bg-surface pl-2 focus-within:border-primary/50">
              <span className="text-xs text-muted">{moeda === "BRL" ? "R$" : "US$"}</span>
              <input
                value={inputs[c.value] ?? ""}
                onChange={(e) => setInputs((p) => ({ ...p, [c.value]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="0,00"
                inputMode="decimal"
                disabled={saving}
                className="w-24 bg-transparent px-2 py-1 text-right font-mono text-sm text-foreground outline-none disabled:opacity-50"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <span className="text-xs text-muted">Total {formatCurrency(total, moeda)}</span>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1 rounded-md border border-primary/50 px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
      {meta?.by && meta.at && (
        <p className="mt-1 text-[10px] text-muted">
          editado por {meta.by} em {formatDateTimeShort(meta.at)}
        </p>
      )}
    </div>
  );
}

/* ---- Remessas internacionais (R$ → US$) ---- */

function RemittancesSection({ refreshKey, onChanged }: { refreshKey: number; onChanged?: () => void }) {
  const [items, setItems] = useState<Remittance[] | null>(
    () => fluxoPeek<RemittancesResponse>(REMITTANCES_PATH)?.items ?? null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [data, setData] = useState("");
  const [brlOut, setBrlOut] = useState("");
  const [usdIn, setUsdIn] = useState("");
  const [brlConta, setBrlConta] = useState<string>(CONTA_DEFAULT.BRL);
  const [usdConta, setUsdConta] = useState<string>(CONTA_DEFAULT.USD);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = useCallback(async (force = false) => {
    setError("");
    const cached = force ? undefined : fluxoPeek<RemittancesResponse>(REMITTANCES_PATH);
    if (cached) {
      setItems(cached.items);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fluxoGet<RemittancesResponse>(REMITTANCES_PATH, force);
      setItems(r.items);
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar remessas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

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
        body: JSON.stringify({
          data,
          brl_out: brl,
          usd_in: usd,
          brl_conta: brlConta,
          usd_conta: usdConta,
          notes: notes || null
        })
      });
      setData("");
      setBrlOut("");
      setUsdIn("");
      setNotes("");
      invalidateFluxo();
      load(true);
      onChanged?.();
    } catch (err: any) {
      setFormErr(err?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/gerencial/remittances/${id}`, { method: "DELETE" });
    invalidateFluxo();
    load(true);
    onChanged?.();
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
          Conta origem (R$)
          <select
            value={brlConta}
            onChange={(e) => setBrlConta(e.target.value)}
            className="mt-1 block rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          >
            {contasOf("BRL").map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
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
        <label className="text-xs text-muted">
          Conta destino (US$)
          <select
            value={usdConta}
            onChange={(e) => setUsdConta(e.target.value)}
            className="mt-1 block rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          >
            {contasOf("USD").map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
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
        <SectionSkeleton rows={2} />
      ) : items && items.length > 0 ? (
        <ul className="divide-y divide-border">
          {items.map((it) => {
            const implied = it.usd_in > 0 ? it.brl_out / it.usd_in : 0;
            return (
              <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {it.data} ·{" "}
                    <span className="font-mono text-danger">−{formatCurrency(it.brl_out, "BRL")}</span>
                    <span className="text-muted"> ({contaLabel("BRL", it.brl_conta)})</span> →{" "}
                    <span className="font-mono text-emerald-300">+{formatCurrency(it.usd_in, "USD")}</span>
                    <span className="text-muted"> ({contaLabel("USD", it.usd_conta)})</span>
                  </p>
                  <p className="text-xs text-muted">
                    Cotação efetiva R$ {implied.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    {it.notes ? ` · ${it.notes}` : ""}
                    {it.by ? ` · por ${it.by}` : ""}
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

/* ---- Transferências internas (entre contas da MESMA moeda) ---- */

function TransfersSection({
  month,
  refreshKey,
  onChanged
}: {
  month: string;
  refreshKey: number;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<Transfer[] | null>(
    () => fluxoPeek<TransfersResponse>(transfersPath(month))?.items ?? null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [data, setData] = useState("");
  const [moeda, setMoeda] = useState<Moeda>("BRL");
  const [fromConta, setFromConta] = useState<string>(contasOf("BRL")[0].value);
  const [toConta, setToConta] = useState<string>(contasOf("BRL")[1]?.value ?? contasOf("BRL")[0].value);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const reqId = useRef(0);

  const load = useCallback(
    async (force = false) => {
      const id = ++reqId.current;
      const path = transfersPath(month);
      setError("");
      const cached = force ? undefined : fluxoPeek<TransfersResponse>(path);
      if (cached) {
        setItems(cached.items);
        setLoading(false);
        return;
      }
      setLoading(true);
      if (!force) setItems(null);
      try {
        const r = await fluxoGet<TransfersResponse>(path, force);
        if (id === reqId.current) setItems(r.items);
      } catch (err: any) {
        if (id === reqId.current) setError(err?.message || "Falha ao carregar transferências.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [month]
  );

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Ao trocar a moeda, reseta from/to pras contas dela (de → primeira, para → segunda)
  const changeMoeda = (m: Moeda) => {
    setMoeda(m);
    const cs = contasOf(m);
    setFromConta(cs[0].value);
    setToConta(cs[1]?.value ?? cs[0].value);
  };

  const add = async () => {
    const amt = parseNumberPtBr(amount);
    if (!data) return setFormErr("Informe a data.");
    if (fromConta === toConta) return setFormErr("Escolha contas de origem e destino diferentes.");
    if (!Number.isFinite(amt) || amt <= 0) return setFormErr("Valor inválido.");
    setSaving(true);
    setFormErr("");
    try {
      await apiFetch(`/gerencial/transfers`, {
        method: "POST",
        body: JSON.stringify({
          data,
          moeda,
          from_conta: fromConta,
          to_conta: toConta,
          amount: amt,
          notes: notes || null
        })
      });
      setData("");
      setAmount("");
      setNotes("");
      invalidateFluxo();
      load(true);
      onChanged?.();
    } catch (err: any) {
      setFormErr(err?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/gerencial/transfers/${id}`, { method: "DELETE" });
    invalidateFluxo();
    load(true);
    onChanged?.();
  };

  const contaOpts = contasOf(moeda);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ArrowLeftRight className="h-4 w-4 text-muted" /> Transferências internas
        </h2>
        <p className="text-xs text-muted">
          Move saldo entre contas da mesma moeda (ex: HelmBank ↔ Tronlink). Não muda o total da moeda — só onde o
          dinheiro fica.
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
          Moeda
          <select
            value={moeda}
            onChange={(e) => changeMoeda(e.target.value as Moeda)}
            className="mt-1 block rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          >
            <option value="BRL">R$</option>
            <option value="USD">US$</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          De
          <select
            value={fromConta}
            onChange={(e) => setFromConta(e.target.value)}
            className="mt-1 block rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          >
            {contaOpts.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Para
          <select
            value={toConta}
            onChange={(e) => setToConta(e.target.value)}
            className="mt-1 block rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          >
            {contaOpts.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Valor
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1.000,00"
            inputMode="decimal"
            className="mt-1 block w-32 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex-1 text-xs text-muted">
          Obs (opcional)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="motivo…"
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
        <SectionSkeleton rows={2} />
      ) : items && items.length > 0 ? (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  {it.data} · <span className="font-mono">{formatCurrency(it.amount, it.moeda)}</span>{" "}
                  <span className="text-muted">
                    {contaLabel(it.moeda, it.from_conta)} → {contaLabel(it.moeda, it.to_conta)}
                  </span>
                </p>
                {(it.notes || it.by) && (
                  <p className="text-xs text-muted">
                    {it.notes ? it.notes : ""}
                    {it.notes && it.by ? " · " : ""}
                    {it.by ? `por ${it.by}` : ""}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(it.id)}
                className="rounded-lg border border-border p-1.5 text-muted hover:border-danger/40 hover:text-danger"
                title="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted">Nenhuma transferência neste mês.</p>
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
