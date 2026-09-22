"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { DashboardResponse, FxRatesResponse, ResultadoAnualMoeda, ResultadoAnualResponse } from "@/types";
import { currentYear, formatCurrency, formatMonthLabel } from "@/lib/format";

/* ============================================================
   ABA 3 — RESULTADO ANUAL (competência, tudo em R$)
   ============================================================
   Mesmo eixo e mesma fonte do Fechamento > Mês. Fonte: 1 GET agregado
   /gerencial/resultado-anual?year=&from= (mesmos campos brl/usd do dashboard, por
   mês, + fx); se a rota falhar, fallback pra 1 GET /gerencial/dashboard?month= por
   mês + /gerencial/fx-rates em paralelo (jan..dez, a partir de RESULTADO_INICIO).
   Cache em memória por ano. Entradas = recebido + a receber, saídas = pago + a pagar,
   exatamente os números do card "Resultado do mês" — as regras anti-double-count
   (NF vinculada assume o fechamento, recusada/cancelada fora, split Talent/Wave)
   ficam todas no backend, nada é recalculado aqui.

   Moeda: o lado US$ vira R$ pela cotação CADASTRADA pro próprio mês
   (gerencial_fx_rates). Mês sem cotação própria usa USD_BRL_FALLBACK e é
   marcado com * na UI. Obs.: o card "Resultado consolidado" do Fechamento herda
   a última cotação conhecida; aqui, por decisão do usuário, cotação herdada
   NÃO vale — cai no fallback. */

export const USD_BRL_FALLBACK = 5.6;

// Primeiro mês com dado confiável. Meses anteriores não entram em nada (gráficos,
// cards, tabela, acumulado) e nem são buscados no backend.
export const RESULTADO_INICIO = "2026-05";
const FIRST_YEAR = Number(RESULTADO_INICIO.slice(0, 4));

function mesesDoAno(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).filter(
    (m) => m >= RESULTADO_INICIO
  );
}

interface MesResultado {
  month: string; // YYYY-MM
  entradaBrl: number;
  saidaBrl: number;
  entradaUsd: number;
  saidaUsd: number;
  rate: number;
  rateFallback: boolean;
  entrada: number; // R$ (BRL + USD × rate)
  saida: number;
  net: number;
  acumulado: number;
}

function yearOptions(): number[] {
  const out: number[] = [];
  for (let y = Math.max(currentYear(), FIRST_YEAR); y >= FIRST_YEAR; y--) out.push(y);
  return out;
}

// Dado bruto de um ano: por mês os 4 campos brl/usd + cotação PRÓPRIA do mês
// (null = sem cotação cadastrada ou herdada => fallback).
interface MesBruto {
  month: string;
  brl: ResultadoAnualMoeda;
  usd: ResultadoAnualMoeda;
}
interface AnoBruto {
  months: MesBruto[];
  rates: Record<string, number | null>;
}

// Cache em memória por ano (vive enquanto a aba do browser estiver aberta).
// Trocar de ano e voltar não refaz fetch; o botão Atualizar ignora o cache.
const cacheAno = new Map<number, AnoBruto>();

function ratesFromFx(fx: { month: string; usd_brl: number | null; inherited: boolean }[]) {
  // Só a cotação cadastrada no PRÓPRIO mês vale; herdada => fallback.
  const map: Record<string, number | null> = {};
  for (const r of fx) if (r.month >= RESULTADO_INICIO) map[r.month] = r.inherited ? null : r.usd_brl;
  return map;
}

// Caminho rápido: 1 chamada agregada. Lança erro se a rota não existir (404)
// ou vier num formato inesperado — aí o chamador cai no fallback.
async function loadAgregado(year: number, months: string[]): Promise<AnoBruto> {
  const from = months[0];
  const r = (await apiFetch(`/gerencial/resultado-anual?year=${year}&from=${from}`)) as ResultadoAnualResponse;
  if (!r || !Array.isArray(r.months) || !Array.isArray(r.fx)) throw new Error("resposta inesperada");
  const byMonth = new Map(r.months.map((m) => [m.month, m]));
  // Garante o mesmo conjunto/ordem de meses do caminho antigo.
  const out: MesBruto[] = months.map((m) => {
    const d = byMonth.get(m);
    if (!d || !d.brl || !d.usd) throw new Error(`mês ${m} ausente na resposta`);
    return { month: m, brl: d.brl, usd: d.usd };
  });
  return { months: out, rates: ratesFromFx(r.fx) };
}

// Fallback: caminho antigo (1 /dashboard por mês), com fx buscado EM PARALELO.
async function loadPorMes(year: number, months: string[]): Promise<AnoBruto> {
  const fxP = (apiFetch(`/gerencial/fx-rates?start=${year}-01&months_ahead=11`) as Promise<FxRatesResponse>)
    .then((fx) => ratesFromFx(fx.rates))
    .catch(() => ({}) as Record<string, number | null>);
  const [ds, rates] = await Promise.all([
    Promise.all(months.map((m) => apiFetch(`/gerencial/dashboard?month=${m}`) as Promise<DashboardResponse>)),
    fxP
  ]);
  return { months: ds.map((d) => ({ month: d.month, brl: d.brl, usd: d.usd })), rates };
}

async function loadAno(year: number): Promise<AnoBruto> {
  const months = mesesDoAno(year);
  if (months.length === 0) return { months: [], rates: {} };
  try {
    return await loadAgregado(year, months);
  } catch (err: any) {
    if (err?.message === "Sessao expirada") throw err;
    return loadPorMes(year, months);
  }
}

export function ResultadoAnualTab() {
  const years = yearOptions();
  const [year, setYear] = useState(years.includes(currentYear()) ? currentYear() : years[0]);
  const [data, setData] = useState<AnoBruto | null>(() => cacheAno.get(year) ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reqId = useRef(0);

  const load = useCallback(
    async (force = false) => {
      const id = ++reqId.current;
      const cached = force ? undefined : cacheAno.get(year);
      if (cached) {
        setData(cached);
        setError("");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      if (!force) setData(null);
      try {
        const d = await loadAno(year);
        cacheAno.set(year, d);
        if (id === reqId.current) setData(d);
      } catch (err: any) {
        if (id === reqId.current) setError(err?.message || "Falha ao carregar.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [year]
  );

  useEffect(() => {
    load();
  }, [load]);

  const dashboards = data?.months ?? null;
  const rates = data?.rates ?? {};

  const meses: MesResultado[] = useMemo(() => {
    if (!dashboards) return [];
    let acc = 0;
    return dashboards.filter((d) => d.month >= RESULTADO_INICIO).map((d) => {
      const entradaBrl = d.brl.recebido_mes + d.brl.a_receber;
      const saidaBrl = d.brl.pago_mes + d.brl.a_pagar;
      const entradaUsd = d.usd.recebido_mes + d.usd.a_receber;
      const saidaUsd = d.usd.pago_mes + d.usd.a_pagar;
      const own = rates[d.month];
      const rateFallback = own == null;
      const rate = own ?? USD_BRL_FALLBACK;
      const entrada = entradaBrl + entradaUsd * rate;
      const saida = saidaBrl + saidaUsd * rate;
      const net = entrada - saida;
      acc += net;
      return {
        month: d.month,
        entradaBrl,
        saidaBrl,
        entradaUsd,
        saidaUsd,
        rate,
        rateFallback,
        entrada,
        saida,
        net,
        acumulado: acc
      };
    });
  }, [dashboards, rates]);

  const totEntrada = meses.reduce((s, m) => s + m.entrada, 0);
  const totSaida = meses.reduce((s, m) => s + m.saida, 0);
  const totNet = totEntrada - totSaida;
  const mesesFallback = meses.filter((m) => m.rateFallback && (m.entradaUsd !== 0 || m.saidaUsd !== 0));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          Por <span className="text-foreground">competência</span>, o mesmo eixo do Fechamento: o resultado de cada mês
          é o mesmo do card &quot;Resultado do mês&quot;. Tudo em R$ — o lado US$ é convertido pela cotação cadastrada
          no mês (sem cotação: R$ {USD_BRL_FALLBACK.toFixed(2).replace(".", ",")}, marcado com *).
          <span className="mt-1 block text-xs">Dados a partir de {shortMonth(RESULTADO_INICIO).toLowerCase().replace("/", "/20")}.</span>
        </p>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
          >
            {years.map((y) => (
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
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {loading && !dashboards ? (
        <ResultadoSkeleton />
      ) : (
        meses.length > 0 && (
          <>
            <div className="mb-2 grid gap-4 md:grid-cols-3">
              <TotalCard label={`Entradas (${year})`} value={totEntrada} className="text-emerald-300" />
              <TotalCard label={`Saídas (${year})`} value={totSaida} className="text-danger" />
              <TotalCard
                label={totNet >= 0 ? `Lucro acumulado (${year})` : `Prejuízo acumulado (${year})`}
                value={totNet}
                className={totNet >= 0 ? "text-sky-300" : "text-danger"}
                highlight
              />
            </div>
            {mesesFallback.length > 0 && (
              <p className="mb-6 text-xs text-amber-300">
                * {mesesFallback.map((m) => shortMonth(m.month)).join(", ")}{" "}
                {mesesFallback.length === 1 ? "não tem cotação cadastrada" : "não têm cotação cadastrada"} — o lado US$
                usou R$ {USD_BRL_FALLBACK.toFixed(2).replace(".", ",")}. Cadastre em Fechamento › Mês.
              </p>
            )}
            {mesesFallback.length === 0 && <div className="mb-6" />}

            <ChartCard title="Entradas por mês" subtitle="Recebido + a receber (competência), em R$.">
              <BarChart meses={meses} value={(m) => m.entrada} color={() => "rgb(110, 231, 183)"} />
            </ChartCard>

            <ChartCard title="Saídas por mês" subtitle="Pago + a pagar (competência), em R$.">
              <BarChart meses={meses} value={(m) => m.saida} color={() => "rgb(248, 113, 113)"} />
            </ChartCard>

            <ChartCard
              title="Resultado (net) por mês"
              subtitle="Entradas − saídas. Verde = lucro, vermelho = prejuízo. Linha = lucro acumulado no ano."
            >
              <BarChart
                meses={meses}
                value={(m) => m.net}
                color={(v) => (v >= 0 ? "rgb(74, 222, 128)" : "rgb(248, 113, 113)")}
                acumulado
              />
            </ChartCard>

            <MesesTable meses={meses} />
          </>
        )
      )}
    </>
  );
}

function ResultadoSkeleton() {
  const bar = "animate-pulse rounded bg-border/60";
  return (
    <div aria-busy="true" aria-label="Carregando resultado anual">
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-5">
            <div className={`${bar} h-3 w-24`} />
            <div className={`${bar} mt-3 h-6 w-36`} />
          </div>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-6 rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <div className={`${bar} h-4 w-40`} />
            <div className={`${bar} mt-2 h-3 w-64`} />
          </div>
          <div className="flex h-[200px] items-end gap-4 p-5">
            {[55, 80, 40, 70, 30, 60, 45, 75].map((h, j) => (
              <div key={j} className={`${bar} flex-1`} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      ))}
      <div className="rounded-xl border border-border bg-surface p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`${bar} mb-3 h-4 w-full last:mb-0`} />
        ))}
      </div>
    </div>
  );
}

function TotalCard({
  label,
  value,
  className,
  highlight
}: {
  label: string;
  value: number;
  className: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-surface p-5 ${highlight ? "border-primary/30" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-2 font-mono text-xl font-semibold ${className}`}>{formatCurrency(value, "BRL")}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function BarChart({
  meses,
  value,
  color,
  acumulado
}: {
  meses: MesResultado[];
  value: (m: MesResultado) => number;
  color: (v: number) => string;
  acumulado?: boolean;
}) {
  const values = meses.map(value);
  const accs = acumulado ? meses.map((m) => m.acumulado) : [];
  const max = Math.max(...values, ...accs, 0);
  const min = Math.min(...values, ...accs, 0);
  const range = max - min || 1;

  const W = 720;
  const H = 240;
  const padL = 64;
  const padR = 20;
  const padT = 22;
  const padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / meses.length;
  const barW = slot * 0.6;
  const yOf = (v: number) => padT + innerH - ((v - min) / range) * innerH;
  const zeroY = yOf(0);
  const xCenter = (i: number) => padL + i * slot + slot / 2;

  const linePoints = acumulado ? meses.map((m, i) => `${xCenter(i)},${yOf(m.acumulado)}`).join(" ") : "";

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: "600px" }}>
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="3,3" />
        <text x={padL - 8} y={padT + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">
          {formatTickShort(max)}
        </text>
        <text x={padL - 8} y={zeroY + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">
          0
        </text>
        {min < 0 && (
          <text x={padL - 8} y={padT + innerH + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">
            {formatTickShort(min)}
          </text>
        )}

        {meses.map((m, i) => {
          const v = values[i];
          const pos = v >= 0;
          const top = pos ? yOf(v) : zeroY;
          const bottom = pos ? zeroY : yOf(v);
          const cx = xCenter(i);
          const tip =
            `${formatMonthLabel(m.month)}: ${formatCurrency(v, "BRL")}` +
            (acumulado ? `\nAcumulado: ${formatCurrency(m.acumulado, "BRL")}` : "") +
            `\nCotação: R$ ${m.rate.toFixed(4).replace(".", ",")}${m.rateFallback ? " (padrão — mês sem cotação)" : ""}`;
          return (
            <g key={m.month}>
              <rect x={cx - barW / 2} y={top} width={barW} height={Math.max(Math.abs(bottom - top), v !== 0 ? 1 : 0)} fill={color(v)} opacity="0.75">
                <title>{tip}</title>
              </rect>
              {v !== 0 && (
                <text
                  x={cx}
                  y={pos ? top - 6 : bottom + 13}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                  fillOpacity="0.7"
                >
                  {formatTickShort(v)}
                </text>
              )}
              <text x={cx} y={H - 14} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.5">
                {shortMonth(m.month)}
                {m.rateFallback && (m.entradaUsd !== 0 || m.saidaUsd !== 0) ? "*" : ""}
              </text>
            </g>
          );
        })}

        {acumulado && (
          <g>
            <polyline points={linePoints} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
            {meses.map((m, i) => (
              <circle key={m.month} cx={xCenter(i)} cy={yOf(m.acumulado)} r="3" fill="hsl(var(--primary))">
                <title>{`Acumulado até ${formatMonthLabel(m.month)}: ${formatCurrency(m.acumulado, "BRL")}`}</title>
              </circle>
            ))}
            <line x1={padL} x2={padL + 16} y1={H - 3} y2={H - 3} stroke="hsl(var(--primary))" strokeWidth="2" />
            <text x={padL + 20} y={H} fontSize="10" fill="currentColor" fillOpacity="0.6">
              Lucro acumulado
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function MesesTable({ meses }: { meses: MesResultado[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Detalhe por mês</h2>
        <p className="text-xs text-muted">Net por moeda (igual ao card &quot;Resultado do mês&quot;) e a conversão usada.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-4 py-2 text-left font-medium">Mês</th>
              <th className="px-4 py-2 text-right font-medium">Net R$</th>
              <th className="px-4 py-2 text-right font-medium">Net US$</th>
              <th className="px-4 py-2 text-right font-medium">Cotação</th>
              <th className="px-4 py-2 text-right font-medium">Entradas</th>
              <th className="px-4 py-2 text-right font-medium">Saídas</th>
              <th className="px-4 py-2 text-right font-medium">Net (R$)</th>
              <th className="px-4 py-2 text-right font-medium">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.month} className="border-b border-border/50 font-mono text-xs last:border-0">
                <td className="px-4 py-2 font-sans text-foreground">{formatMonthLabel(m.month)}</td>
                <td className="px-4 py-2 text-right text-muted">{formatCurrency(m.entradaBrl - m.saidaBrl, "BRL")}</td>
                <td className="px-4 py-2 text-right text-muted">{formatCurrency(m.entradaUsd - m.saidaUsd, "USD")}</td>
                <td
                  className={`px-4 py-2 text-right ${m.rateFallback ? "text-amber-300" : "text-muted"}`}
                  title={m.rateFallback ? "Mês sem cotação cadastrada — usado o valor padrão" : "Cotação cadastrada no mês"}
                >
                  {m.rate.toFixed(4).replace(".", ",")}
                  {m.rateFallback ? "*" : ""}
                </td>
                <td className="px-4 py-2 text-right text-emerald-300">{formatCurrency(m.entrada, "BRL")}</td>
                <td className="px-4 py-2 text-right text-danger">{formatCurrency(m.saida, "BRL")}</td>
                <td className={`px-4 py-2 text-right ${m.net >= 0 ? "text-sky-300" : "text-danger"}`}>
                  {formatCurrency(m.net, "BRL")}
                </td>
                <td className={`px-4 py-2 text-right ${m.acumulado >= 0 ? "text-foreground" : "text-danger"}`}>
                  {formatCurrency(m.acumulado, "BRL")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTickShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000000) return `${sign}R$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}R$${(abs / 1000).toFixed(0)}k`;
  return `${sign}R$${abs.toFixed(0)}`;
}

function shortMonth(yearMonth: string): string {
  const m = yearMonth.match(/^(\d{4})-(\d{2})/);
  if (!m) return yearMonth;
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[parseInt(m[2], 10) - 1]}/${m[1].slice(2)}`;
}
