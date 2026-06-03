"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  Wallet,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type {
  DashboardResponse,
  ForecastResponse,
  ForecastMonth,
  Moeda,
  CashflowResponse,
  CashflowItem,
  CashflowMonth
} from "@/types";
import { formatCurrency, buildMonthOptions, currentYearMonth } from "@/lib/format";

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

function FechamentoTab() {
  const monthOpts = buildMonthOptions();
  const [month, setMonth] = useState(currentYearMonth());
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [forecastMetric, setForecastMetric] = useState<ForecastMetric>("net");
  const [forecastMoeda, setForecastMoeda] = useState<Moeda>("BRL");

  const [expandedBrlReceber, setExpandedBrlReceber] = useState(false);
  const [expandedBrlPagar, setExpandedBrlPagar] = useState(false);
  const [expandedUsdReceber, setExpandedUsdReceber] = useState(false);
  const [expandedUsdPagar, setExpandedUsdPagar] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [d, f] = await Promise.all([
        apiFetch(`/gerencial/dashboard?month=${month}`),
        apiFetch(`/gerencial/forecast?months_ahead=6`)
      ]);
      setDashboard(d as DashboardResponse);
      setForecast(f as ForecastResponse);
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
      <div className="mb-6 flex items-end justify-between gap-3">
        <p className="text-sm text-muted">
          Por <span className="text-foreground">competência</span>: tudo que pertence ao mês de referência,
          independente de quando o dinheiro entra/sai. Resultado = entradas − saídas.
        </p>
        <div className="flex flex-shrink-0 items-center gap-2">
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

          {forecast && forecast.months.length > 0 && (
            <div className="rounded-xl border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Resultado por mês (competência)</h2>
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
                    {(["BRL", "USD"] as Moeda[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setForecastMoeda(m)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          forecastMoeda === m
                            ? "bg-primary text-black"
                            : "bg-background text-muted hover:text-foreground"
                        }`}
                      >
                        {m === "BRL" ? "R$" : "US$"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-5">
                <ForecastChart months={forecast.months} metric={forecastMetric} moeda={forecastMoeda} />
              </div>
            </div>
          )}
        </>
      )}
    </>
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

function ForecastChart({
  months,
  metric,
  moeda
}: {
  months: ForecastMonth[];
  metric: ForecastMetric;
  moeda: Moeda;
}) {
  const getValue = (m: ForecastMonth): number => {
    const ent = moeda === "BRL" ? m.entrada_brl : m.entrada_usd;
    const sai = moeda === "BRL" ? m.saida_brl : m.saida_usd;
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
          {formatTickShort(max, moeda)}
        </text>
        <text x={padL - 8} y={zeroY + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">
          0
        </text>
        {min < 0 && (
          <text x={padL - 8} y={padT + innerH + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">
            {formatTickShort(min, moeda)}
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
                {formatTickShort(v, moeda)}
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

          {/* Timeline por vencimento */}
          {data.months.length > 0 && (
            <div className="rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-foreground">A pagar / a receber por vencimento</h2>
                <p className="text-xs text-muted">
                  Próximos meses pela data de vencimento. Net de caixa = a receber − a pagar.
                </p>
              </div>
              <div className="divide-y divide-border">
                {data.months.map((m, i) => {
                  const isCurrent = i === 0 || (data.today != null && m.month === data.today.slice(0, 7));
                  return (
                    <CashflowMonthRow
                      key={m.month}
                      month={m}
                      moeda={moeda}
                      overduePagar={isCurrent ? overduePagar : 0}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}
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
  overduePagar = 0
}: {
  month: CashflowMonth;
  moeda: Moeda;
  overduePagar?: number;
}) {
  const pagar = moeda === "BRL" ? month.a_pagar_brl : month.a_pagar_usd;
  const receber = moeda === "BRL" ? month.a_receber_brl : month.a_receber_usd;
  const net = receber - pagar;
  const showOverdueHint = overduePagar > 0;
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
        <div className="w-32 text-right">
          <span className="text-xs text-muted">Net </span>
          <span className={`font-mono text-sm font-semibold ${net >= 0 ? "text-sky-300" : "text-danger"}`}>
            {formatCurrency(net, moeda)}
          </span>
        </div>
      </div>
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
