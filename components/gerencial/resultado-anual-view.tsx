"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { apiFetchStrict, readableError } from "@/lib/api-error";
import type {
  DashboardResponse,
  FxRatesResponse,
  ResultadoAnualMoeda,
  ResultadoAnualPrevisao,
  ResultadoAnualResponse,
  ResultadoAnualStatus
} from "@/types";
import { currentYear, currentYearMonth, formatCurrency, formatMonthLabel } from "@/lib/format";

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

   Moeda (task cambio-herdado, decisão do usuário): o lado US$ vira R$ pela
   cotação cadastrada no próprio mês; sem ela, pela ÚLTIMA cotação cadastrada
   antes do mês (herdada); USD_BRL_FALLBACK (5,60) só se não houver nenhuma.
   É a mesma regra do card "Resultado consolidado" do Fechamento > Mês, então os
   dois mostram a mesma taxa. O backend manda por mês `usd_brl_efetivo` +
   `usd_brl_origem` ("mes"|"herdada"|"fallback"); quando vêm, o front só exibe.
   Sem `usd_brl_origem` (backend antigo, que tratava herdada como fallback) ou no
   caminho por mês, o front decide com o fx (inherited/source_month) — defesa.
   Mês que não usou cotação própria é marcado com * na UI.

   Corte temporal: só entram meses até o mês VIGENTE (futuros não aparecem em
   nada nem são buscados). O mês corrente é desenhado hachurado ("mês em
   andamento"). Quando o backend manda `previsao` num mês (Campanhas sem
   fechamento), ela é somada ao real (mesma cotação) e aparece como segmento
   tracejado empilhado; o acumulado inclui a previsão e vira tracejado a partir
   do 1º mês com previsão/em andamento. `status`/`previsao` são opcionais: sem
   eles, "em andamento" é deduzido pelo mês corrente. */

export const USD_BRL_FALLBACK = 5.6;

// Primeiro mês com dado confiável. Meses anteriores não entram em nada (gráficos,
// cards, tabela, acumulado) e nem são buscados no backend.
export const RESULTADO_INICIO = "2026-05";
const FIRST_YEAR = Number(RESULTADO_INICIO.slice(0, 4));

function mesesDoAno(year: number): string[] {
  const vigente = currentYearMonth();
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).filter(
    (m) => m >= RESULTADO_INICIO && m <= vigente
  );
}

interface MesResultado {
  month: string; // YYYY-MM
  entradaBrl: number;
  saidaBrl: number;
  entradaUsd: number;
  saidaUsd: number;
  rate: number;
  rateOrigem: RateOrigem;
  rateSourceMonth: string | null; // YYYY-MM de onde veio a cotação herdada (se souber)
  entrada: number; // R$ (BRL + USD × rate), JÁ inclui previsão
  saida: number;
  net: number;
  acumulado: number;
  // Parte prevista (R$, já convertida) — 0 quando o backend não manda previsão.
  prevEntrada: number;
  prevSaida: number;
  campanhasPrev: string[];
  emAndamento: boolean; // mês corrente (status "em_andamento" ou deduzido)
}

// Parte "real" (sem previsão) de cada série — base do segmento sólido.
const realEntrada = (m: MesResultado) => m.entrada - m.prevEntrada;
const realSaida = (m: MesResultado) => m.saida - m.prevSaida;
const realNet = (m: MesResultado) => realEntrada(m) - realSaida(m);
const temPrevisao = (m: MesResultado) => m.prevEntrada !== 0 || m.prevSaida !== 0;

function yearOptions(): number[] {
  const out: number[] = [];
  for (let y = Math.max(currentYear(), FIRST_YEAR); y >= FIRST_YEAR; y--) out.push(y);
  return out;
}

type RateOrigem = "mes" | "herdada" | "fallback";
const marcaTaxa = (m: MesResultado) => m.rateOrigem !== "mes";

// Cotação do mês vinda do fx: própria ou herdada (null = nenhuma cadastrada).
interface RateInfo {
  rate: number | null;
  inherited: boolean;
  source_month: string | null;
}

// Dado bruto de um ano: por mês os 4 campos brl/usd + câmbio do backend (se vier).
interface MesBruto {
  month: string;
  brl: ResultadoAnualMoeda;
  usd: ResultadoAnualMoeda;
  status?: ResultadoAnualStatus;
  previsao?: ResultadoAnualPrevisao | null;
  usd_brl_efetivo?: number | null;
  usd_brl_fallback?: boolean | null;
  usd_brl_origem?: RateOrigem | null;
}
interface AnoBruto {
  months: MesBruto[];
  rates: Record<string, RateInfo>;
  // "por_mes" = rota agregada falhou e caiu no caminho antigo (avisado na UI).
  origem: "agregado" | "por_mes";
  motivoFallback?: string;
}

// Cache em memória por ano (vive enquanto a aba do browser estiver aberta).
// Trocar de ano e voltar não refaz fetch; o botão Atualizar ignora o cache.
const cacheAno = new Map<number, AnoBruto>();

function ratesFromFx(
  fx: { month: string; usd_brl: number | null; inherited: boolean; source_month?: string | null }[]
) {
  // Própria ou herdada (última cadastrada antes do mês) — as duas valem.
  const map: Record<string, RateInfo> = {};
  for (const r of fx)
    if (r.month >= RESULTADO_INICIO)
      map[r.month] = { rate: r.usd_brl, inherited: !!r.inherited, source_month: r.source_month ?? null };
  return map;
}

function validRate(v: unknown): v is number {
  return typeof v === "number" && isFinite(v) && v > 0;
}

function isOrigem(v: unknown): v is RateOrigem {
  return v === "mes" || v === "herdada" || v === "fallback";
}

// Câmbio de um mês: backend decide quando manda `usd_brl_origem`; senão o front
// aplica a mesma regra (própria > herdada > 5,60) com o fx.
function resolveRate(d: MesBruto, fx: RateInfo | undefined): { rate: number; origem: RateOrigem; source: string | null } {
  const fxRate = validRate(fx?.rate) ? fx!.rate! : null;
  const fxOrigem: RateOrigem = fx?.inherited ? "herdada" : "mes";
  const source = fx?.inherited ? fx.source_month : null;
  const efetivo = d.usd_brl_efetivo;
  if (validRate(efetivo)) {
    if (isOrigem(d.usd_brl_origem)) {
      return { rate: efetivo, origem: d.usd_brl_origem, source: d.usd_brl_origem === "herdada" ? source : null };
    }
    // Backend antigo: fallback=true também cobria mês com cotação herdada.
    if (d.usd_brl_fallback === true) {
      return fxRate != null
        ? { rate: fxRate, origem: fxOrigem, source }
        : { rate: efetivo, origem: "fallback", source: null };
    }
    return { rate: efetivo, origem: "mes", source: null };
  }
  if (fxRate != null) return { rate: fxRate, origem: fxOrigem, source };
  return { rate: USD_BRL_FALLBACK, origem: "fallback", source: null };
}

// Caminho rápido: 1 chamada agregada. Lança erro se a rota não existir (404)
// ou vier num formato inesperado — aí o chamador cai no fallback.
async function loadAgregado(year: number, months: string[]): Promise<AnoBruto> {
  const from = months[0];
  const r = (await apiFetchStrict(`/gerencial/resultado-anual?year=${year}&from=${from}`)) as ResultadoAnualResponse;
  if (!r || !Array.isArray(r.months) || !Array.isArray(r.fx)) throw new Error("resposta inesperada");
  const byMonth = new Map(r.months.map((m) => [m.month, m]));
  // Garante o mesmo conjunto/ordem de meses do caminho antigo.
  const out: MesBruto[] = months.map((m) => {
    const d = byMonth.get(m);
    if (!d || !d.brl || !d.usd) throw new Error(`mês ${m} ausente na resposta`);
    return {
      month: m,
      brl: d.brl,
      usd: d.usd,
      status: d.status,
      previsao: d.previsao ?? null,
      usd_brl_efetivo: d.usd_brl_efetivo ?? null,
      usd_brl_fallback: d.usd_brl_fallback ?? null,
      usd_brl_origem: isOrigem(d.usd_brl_origem) ? d.usd_brl_origem : null
    };
  });
  return { months: out, rates: ratesFromFx(r.fx), origem: "agregado" };
}

// Fallback: caminho antigo (1 /dashboard por mês), com fx buscado EM PARALELO.
async function loadPorMes(year: number, months: string[]): Promise<AnoBruto> {
  const fxP = (apiFetchStrict(`/gerencial/fx-rates?start=${year}-01&months_ahead=11`) as Promise<FxRatesResponse>)
    .then((fx) => ratesFromFx(fx.rates))
    .catch(() => ({}) as Record<string, RateInfo>);
  const [ds, rates] = await Promise.all([
    Promise.all(months.map((m) => apiFetchStrict(`/gerencial/dashboard?month=${m}`) as Promise<DashboardResponse>)),
    fxP
  ]);
  return { months: ds.map((d) => ({ month: d.month, brl: d.brl, usd: d.usd })), rates, origem: "por_mes" };
}

async function loadAno(year: number): Promise<AnoBruto> {
  const months = mesesDoAno(year);
  if (months.length === 0) return { months: [], rates: {}, origem: "agregado" };
  try {
    return await loadAgregado(year, months);
  } catch (err: any) {
    if (err?.message === "Sessao expirada") throw err;
    const porMes = await loadPorMes(year, months);
    return { ...porMes, motivoFallback: readableError(err, "rota agregada indisponível") };
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
        if (id === reqId.current) setError(readableError(err, "Falha ao carregar."));
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
    const vigente = currentYearMonth();
    return dashboards.filter((d) => d.month >= RESULTADO_INICIO && d.month <= vigente).map((d) => {
      const { rate, origem, source } = resolveRate(d, rates[d.month]);
      const p = d.previsao;
      const prevEntrada = p ? (p.brl?.a_receber ?? 0) + (p.usd?.a_receber ?? 0) * rate : 0;
      const prevSaida = p ? (p.brl?.a_pagar ?? 0) + (p.usd?.a_pagar ?? 0) * rate : 0;
      // Colunas por moeda da tabela já incluem a previsão (mesma base do total).
      const entradaBrl = d.brl.recebido_mes + d.brl.a_receber + (p?.brl?.a_receber ?? 0);
      const saidaBrl = d.brl.pago_mes + d.brl.a_pagar + (p?.brl?.a_pagar ?? 0);
      const entradaUsd = d.usd.recebido_mes + d.usd.a_receber + (p?.usd?.a_receber ?? 0);
      const saidaUsd = d.usd.pago_mes + d.usd.a_pagar + (p?.usd?.a_pagar ?? 0);
      const entrada = entradaBrl + entradaUsd * rate;
      const saida = saidaBrl + saidaUsd * rate;
      const net = entrada - saida;
      acc += net;
      const emAndamento = d.status ? d.status === "em_andamento" : d.month === vigente;
      return {
        prevEntrada,
        prevSaida,
        campanhasPrev: (p?.campanhas ?? []).map((c) => c.campaign_name || c.campaign_id),
        emAndamento,
        month: d.month,
        entradaBrl,
        saidaBrl,
        entradaUsd,
        saidaUsd,
        rate,
        rateOrigem: origem,
        rateSourceMonth: source,
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
  const totPrevEntrada = meses.reduce((s, m) => s + m.prevEntrada, 0);
  const totPrevSaida = meses.reduce((s, m) => s + m.prevSaida, 0);
  const totPrevNet = totPrevEntrada - totPrevSaida;
  const algumaPrevisao = meses.some(temPrevisao);
  // Meses com lado US$ que não usaram cotação própria (herdada ou padrão).
  const mesesMarcados = meses.filter((m) => marcaTaxa(m) && (m.entradaUsd !== 0 || m.saidaUsd !== 0));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          Por <span className="text-foreground">competência</span>, o mesmo eixo do Fechamento: o resultado de cada mês
          é o mesmo do card &quot;Resultado do mês&quot;. Tudo em R$ — o lado US$ é convertido pela cotação cadastrada
          no mês; sem ela, pela última cotação cadastrada antes (herdada, marcada com *), a mesma do card do
          Fechamento.
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

      {data?.origem === "por_mes" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
          <p className="text-sm text-amber-300">
            A rota agregada do Resultado anual falhou{data.motivoFallback ? ` (${data.motivoFallback})` : ""} — os
            números vieram do caminho antigo (1 consulta por mês). A previsão do Campanhas e o status dos meses não
            aparecem nesse modo, e o câmbio é decidido aqui no navegador. Clique em Atualizar pra tentar de novo.
          </p>
        </div>
      )}

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
              <TotalCard
                label={`Entradas (${year})`}
                value={totEntrada}
                previsao={algumaPrevisao ? totPrevEntrada : undefined}
                className="text-emerald-300"
              />
              <TotalCard
                label={`Saídas (${year})`}
                value={totSaida}
                previsao={algumaPrevisao ? totPrevSaida : undefined}
                className="text-danger"
              />
              <TotalCard
                label={totNet >= 0 ? `Lucro acumulado (${year})` : `Prejuízo acumulado (${year})`}
                value={totNet}
                previsao={algumaPrevisao ? totPrevNet : undefined}
                className={totNet >= 0 ? "text-sky-300" : "text-danger"}
                highlight
              />
            </div>
            {mesesMarcados.length > 0 && (
              <p className="mb-6 text-xs text-amber-300">
                * Sem cotação própria no mês — o lado US$ usou:{" "}
                {mesesMarcados.map((m) => `${shortMonth(m.month)} ${descTaxa(m)}`).join("; ")}. Cadastre em Fechamento ›
                Mês pra fixar.
              </p>
            )}
            {mesesMarcados.length === 0 && <div className="mb-6" />}

            <ChartCard title="Entradas por mês" subtitle="Recebido + a receber (competência), em R$.">
              <BarChart
                meses={meses}
                value={(m) => m.entrada}
                real={realEntrada}
                color={() => "rgb(110, 231, 183)"}
              />
            </ChartCard>

            <ChartCard title="Saídas por mês" subtitle="Pago + a pagar (competência), em R$.">
              <BarChart meses={meses} value={(m) => m.saida} real={realSaida} color={() => "rgb(248, 113, 113)"} />
            </ChartCard>

            <ChartCard
              title="Resultado (net) por mês"
              subtitle="Entradas − saídas. Verde = lucro, vermelho = prejuízo. Linha = lucro acumulado no ano."
            >
              <BarChart
                meses={meses}
                value={(m) => m.net}
                real={realNet}
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
  previsao,
  className,
  highlight
}: {
  label: string;
  value: number;
  previsao?: number; // parte prevista contida em `value` (só quando há previsão)
  className: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-surface p-5 ${highlight ? "border-primary/30" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-2 font-mono text-xl font-semibold ${className}`}>{formatCurrency(value, "BRL")}</p>
      {previsao !== undefined && previsao !== 0 && (
        <p className="mt-1 text-xs text-amber-300" title="Campanhas ainda sem fechamento, somadas pela previsão">
          inclui previsão de {formatCurrency(previsao, "BRL")}
        </p>
      )}
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
  real,
  color,
  acumulado
}: {
  meses: MesResultado[];
  value: (m: MesResultado) => number; // total (real + previsão)
  real: (m: MesResultado) => number; // só a parte real
  color: (v: number) => string;
  acumulado?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const values = meses.map(value);
  const reals = meses.map(real);
  const accs = acumulado ? meses.map((m) => m.acumulado) : [];
  const max = Math.max(...values, ...reals, ...accs, 0);
  const min = Math.min(...values, ...reals, ...accs, 0);
  const range = max - min || 1;

  const W = 720;
  const H = 240;
  const padL = 64;
  const padR = 20;
  const padT = 22;
  const padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / Math.max(meses.length, 1);
  const barW = Math.min(slot * 0.6, 80);
  const yOf = (v: number) => padT + innerH - ((v - min) / range) * innerH;
  const zeroY = yOf(0);
  const xCenter = (i: number) => padL + i * slot + slot / 2;

  // Acumulado: sólido até o mês anterior ao 1º mês com previsão/em andamento,
  // tracejado dali em diante.
  const idxIncerto = meses.findIndex((m) => temPrevisao(m) || m.emAndamento);
  const splitAt = idxIncerto <= 0 ? idxIncerto : idxIncerto - 1;
  const pts = acumulado ? meses.map((m, i) => `${xCenter(i)},${yOf(m.acumulado)}`) : [];
  const solidPts = idxIncerto === -1 ? pts : pts.slice(0, splitAt + 1);
  const dashedPts = idxIncerto === -1 ? [] : pts.slice(Math.max(splitAt, 0));

  const algumaPrev = meses.some(temPrevisao);
  const algumAndamento = meses.some((m) => m.emAndamento);

  const seg = (a: number, b: number) => {
    const top = yOf(Math.max(a, b));
    const bottom = yOf(Math.min(a, b));
    return { top, h: Math.max(bottom - top, a !== b ? 1 : 0) };
  };

  // Legenda: acumulado + mês em andamento + previsão, lado a lado.
  const legend: { key: string; label: string; node: (x: number) => React.ReactNode }[] = [];
  if (acumulado)
    legend.push({
      key: "acc",
      label: "Lucro acumulado",
      node: (x) => <line x1={x} x2={x + 16} y1={H - 3} y2={H - 3} stroke="hsl(var(--primary))" strokeWidth="2" />
    });
  if (algumAndamento)
    legend.push({
      key: "and",
      label: "Mês em andamento",
      node: (x) => (
        <rect x={x} y={H - 9} width={16} height={9} fill={`url(#hatch-${uid})`} stroke="currentColor" strokeOpacity="0.6" strokeDasharray="2,2" />
      )
    });
  if (algumaPrev)
    legend.push({
      key: "prev",
      label: "Previsão Campanhas (sem fechamento)",
      node: (x) => (
        <rect x={x} y={H - 9} width={16} height={9} fill="currentColor" fillOpacity="0.08" stroke="rgb(252, 211, 77)" strokeDasharray="3,2" />
      )
    });
  let lx = padL;
  const legendItems = legend.map((l) => {
    const x = lx;
    lx += 16 + 8 + l.label.length * 5.6 + 18;
    return { ...l, x };
  });

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: "600px" }}>
        <defs>
          <pattern id={`hatch-${uid}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" />
          </pattern>
        </defs>
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
          const r = reals[i];
          const hasPrev = v !== r;
          const pos = v >= 0;
          const cx = xCenter(i);
          const x = cx - barW / 2;
          const realSeg = seg(0, r);
          const prevSeg = seg(r, v);
          const cor = color(v);
          const tip =
            `${formatMonthLabel(m.month)}${m.emAndamento ? " (mês em andamento)" : ""}: ${formatCurrency(v, "BRL")}` +
            (hasPrev ? `\nReal: ${formatCurrency(r, "BRL")} · previsão: ${formatCurrency(v - r, "BRL")}` : "") +
            (acumulado ? `\nAcumulado: ${formatCurrency(m.acumulado, "BRL")}` : "") +
            `\nCotação: R$ ${marcaTaxa(m) ? descTaxa(m) : fmtTaxa(m.rate)}`;
          const tipPrev =
            `Previsão Campanhas — sem fechamento: ${m.campanhasPrev.join(", ") || "—"}` +
            `\n${formatMonthLabel(m.month)}: ${formatCurrency(v - r, "BRL")}`;
          const topY = Math.min(realSeg.top, hasPrev ? prevSeg.top : realSeg.top);
          const bottomY = Math.max(realSeg.top + realSeg.h, hasPrev ? prevSeg.top + prevSeg.h : 0);
          return (
            <g key={m.month}>
              {realSeg.h > 0 && (
                <rect
                  x={x}
                  y={realSeg.top}
                  width={barW}
                  height={realSeg.h}
                  fill={cor}
                  opacity={m.emAndamento ? 0.35 : 0.75}
                  stroke={m.emAndamento ? cor : undefined}
                  strokeDasharray={m.emAndamento ? "4,3" : undefined}
                >
                  <title>{tip}</title>
                </rect>
              )}
              {m.emAndamento && realSeg.h > 0 && (
                <rect x={x} y={realSeg.top} width={barW} height={realSeg.h} fill={`url(#hatch-${uid})`} pointerEvents="none" />
              )}
              {hasPrev && prevSeg.h > 0 && (
                <rect
                  x={x}
                  y={prevSeg.top}
                  width={barW}
                  height={prevSeg.h}
                  fill={cor}
                  fillOpacity="0.15"
                  stroke="rgb(252, 211, 77)"
                  strokeWidth="1.5"
                  strokeDasharray="4,3"
                >
                  <title>{tipPrev}</title>
                </rect>
              )}
              {v !== 0 && (
                <text
                  x={cx}
                  y={pos ? topY - 6 : bottomY + 13}
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
                {marcaTaxa(m) && (m.entradaUsd !== 0 || m.saidaUsd !== 0) ? "*" : ""}
              </text>
            </g>
          );
        })}

        {acumulado && (
          <g>
            {solidPts.length > 1 && (
              <polyline points={solidPts.join(" ")} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
            )}
            {dashedPts.length > 1 && (
              <polyline
                points={dashedPts.join(" ")}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeDasharray="5,4"
              />
            )}
            {meses.map((m, i) => {
              const incerto = temPrevisao(m) || m.emAndamento;
              return (
                <circle
                  key={m.month}
                  cx={xCenter(i)}
                  cy={yOf(m.acumulado)}
                  r="3"
                  fill={incerto ? "hsl(var(--background))" : "hsl(var(--primary))"}
                  stroke="hsl(var(--primary))"
                  strokeWidth={incerto ? 1.5 : 0}
                >
                  <title>
                    {`Acumulado até ${formatMonthLabel(m.month)}: ${formatCurrency(m.acumulado, "BRL")}` +
                      (temPrevisao(m) ? " (inclui previsão)" : "") +
                      (m.emAndamento ? " (mês em andamento)" : "")}
                  </title>
                </circle>
              );
            })}
          </g>
        )}

        {legendItems.map((l) => (
          <g key={l.key}>
            {l.node(l.x)}
            <text x={l.x + 22} y={H} fontSize="10" fill="currentColor" fillOpacity="0.6">
              {l.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MesesTable({ meses }: { meses: MesResultado[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Detalhe por mês</h2>
        <p className="text-xs text-muted">
          Net por moeda (igual ao card &quot;Resultado do mês&quot;) e a conversão usada. Entradas/saídas/net já incluem a
          previsão, quando houver.
        </p>
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
              <th className="px-4 py-2 text-right font-medium">Previsão (net)</th>
              <th className="px-4 py-2 text-right font-medium">Net (R$)</th>
              <th className="px-4 py-2 text-right font-medium">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.month} className="border-b border-border/50 font-mono text-xs last:border-0">
                <td className="px-4 py-2 font-sans text-foreground">
                  {formatMonthLabel(m.month)}
                  {m.emAndamento && (
                    <span className="ml-2 rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted">
                      em andamento
                    </span>
                  )}
                  {temPrevisao(m) && (
                    <span
                      className="ml-2 rounded border border-dashed border-amber-300/60 px-1.5 py-0.5 text-[10px] text-amber-300"
                      title={`Previsão Campanhas — sem fechamento: ${m.campanhasPrev.join(", ") || "—"}`}
                    >
                      previsão
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right text-muted">{formatCurrency(m.entradaBrl - m.saidaBrl, "BRL")}</td>
                <td className="px-4 py-2 text-right text-muted">{formatCurrency(m.entradaUsd - m.saidaUsd, "USD")}</td>
                <td
                  className={`px-4 py-2 text-right ${marcaTaxa(m) ? "text-amber-300" : "text-muted"}`}
                  title={marcaTaxa(m) ? `Sem cotação própria: ${descTaxa(m)}` : "Cotação cadastrada no mês"}
                >
                  {m.rate.toFixed(4).replace(".", ",")}
                  {marcaTaxa(m) ? "*" : ""}
                </td>
                <td className="px-4 py-2 text-right text-emerald-300">{formatCurrency(m.entrada, "BRL")}</td>
                <td className="px-4 py-2 text-right text-danger">{formatCurrency(m.saida, "BRL")}</td>
                <td
                  className={`px-4 py-2 text-right ${temPrevisao(m) ? "text-amber-300" : "text-muted"}`}
                  title={
                    temPrevisao(m)
                      ? `Entradas previstas ${formatCurrency(m.prevEntrada, "BRL")} · saídas previstas ${formatCurrency(m.prevSaida, "BRL")}\nCampanhas sem fechamento: ${m.campanhasPrev.join(", ") || "—"}`
                      : undefined
                  }
                >
                  {temPrevisao(m) ? formatCurrency(m.prevEntrada - m.prevSaida, "BRL") : "—"}
                </td>
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

function fmtTaxa(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// Ex.: "5,36 herdada de jul/26" · "5,60 padrão (nenhuma cotação cadastrada)".
function descTaxa(m: MesResultado): string {
  if (m.rateOrigem === "herdada")
    return `${fmtTaxa(m.rate)} herdada${m.rateSourceMonth ? ` de ${shortMonth(m.rateSourceMonth).toLowerCase()}` : ""}`;
  if (m.rateOrigem === "fallback") return `${fmtTaxa(m.rate)} padrão (nenhuma cotação cadastrada)`;
  return fmtTaxa(m.rate);
}
