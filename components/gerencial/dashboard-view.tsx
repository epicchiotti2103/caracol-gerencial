"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  Loader2
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { DashboardResponse, ForecastResponse, ForecastMonth, Moeda } from "@/types";
import { formatCurrency, buildMonthOptions, currentYearMonth, formatMonthLabel } from "@/lib/format";

type ForecastMetric = "entrada" | "saida" | "net";

export function DashboardView() {
  const monthOpts = buildMonthOptions();
  const [month, setMonth] = useState(currentYearMonth());
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtros do grafico
  const [forecastMetric, setForecastMetric] = useState<ForecastMetric>("net");
  const [forecastMoeda, setForecastMoeda] = useState<Moeda>("BRL");

  // Breakdowns expansiveis
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
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">Caracol Gerencial</h4>
          <h1 className="text-2xl font-semibold text-foreground">Fluxo de caixa</h1>
          <p className="mt-1 text-sm text-muted">
            Quanto vou receber e pagar por moeda. Pra decidir remessa e provisionar caixa.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          {/* Cards principais */}
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

          {/* Forecast */}
          {forecast && forecast.months.length > 0 && (
            <div className="rounded-xl border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Projeção próximos meses</h2>
                  <p className="text-xs text-muted">Entradas e saídas previstas por mês de referência.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { v: "entrada", l: "Entrada" },
                        { v: "saida", l: "Saída" },
                        { v: "net", l: "Net" }
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
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Wallet className="h-4 w-4 text-muted" />
      </div>

      <div className="space-y-3">
        {/* Saldo atual (banco — placeholder, viraremos real depois) */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Saldo atual</span>
          <span className="font-mono text-muted" title="A integrar extrato bancário">—</span>
        </div>

        {/* A Receber */}
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

        {/* A Pagar */}
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

        <div className="border-t border-border pt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              Recebido (mês)
            </span>
            <span className="font-mono">{formatCurrency(data.recebido_mes, moeda)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-danger" />
              Pago (mês)
            </span>
            <span className="font-mono">{formatCurrency(data.pago_mes, moeda)}</span>
          </div>
        </div>

        {(() => {
          const saldoAtual = 0; // TODO integrar extrato bancário
          const saldoEst = saldoAtual + data.recebido_mes + data.a_receber - data.pago_mes - data.a_pagar;
          return (
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">Saldo Est. fim do mês</span>
                <span
                  className={`font-mono font-semibold ${
                    saldoEst >= 0 ? "text-emerald-300" : "text-danger"
                  }`}
                  title="Saldo atual + recebido + a receber − pago − a pagar"
                >
                  {formatCurrency(saldoEst, moeda)}
                </span>
              </div>
            </div>
          );
        })()}
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
        {/* Linha zero */}
        <line
          x1={padL}
          x2={W - padR}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeDasharray="3,3"
        />

        {/* Eixo Y labels */}
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

        {/* Barras */}
        {months.map((m, i) => {
          const v = getValue(m);
          const xCenter = padL + i * slot + slot / 2;
          const barX = xCenter - barW / 2;
          const isPositive = v >= 0;
          const top = isPositive ? padT + innerH - ((v - min) / range) * innerH : zeroY;
          const bottom = isPositive ? zeroY : padT + innerH - ((v - min) / range) * innerH;
          const h = Math.abs(bottom - top);
          const color = metric === "net"
            ? isPositive ? "rgb(110, 231, 183)" : "rgb(248, 113, 113)"
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
              <text
                x={xCenter}
                y={H - 10}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                fillOpacity="0.5"
              >
                {shortMonth(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

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
