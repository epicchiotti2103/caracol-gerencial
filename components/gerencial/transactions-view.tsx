"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  CheckCircle2,
  Copy,
  Trash2,
  AlertCircle,
  FileText,
  Loader2
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { TransactionEditModal } from "./transaction-edit-modal";
import { TransactionMarkPaidModal } from "./transaction-mark-paid-modal";
import type { GerencialTransaction, TransactionKind } from "@/types";
import {
  formatCurrency,
  formatMonthLabel,
  currentYearMonth,
  buildMonthOptions
} from "@/lib/format";

type StatusFilter = "todos" | "pendente" | "pago";

export function TransactionsView() {
  const toast = useToast();
  const monthOpts = buildMonthOptions();

  const [list, setList] = useState<GerencialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtros
  const [month, setMonth] = useState(currentYearMonth());
  const [kindFilter, setKindFilter] = useState<TransactionKind | "todos">("todos");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");

  // Modais
  const [editing, setEditing] = useState<GerencialTransaction | null | undefined>(undefined);
  // undefined = closed, null = new, object = edit existing
  const [marking, setMarking] = useState<GerencialTransaction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ reference_month: month });
      if (kindFilter !== "todos") params.set("kind", kindFilter);
      if (statusFilter !== "todos") params.set("status", statusFilter);
      const data = await apiFetch(`/gerencial/transactions?${params.toString()}`);
      setList(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [month, kindFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const onCreated = (t: GerencialTransaction) => {
    setEditing(undefined);
    setList((prev) => [t, ...prev]);
  };

  const onSaved = (t: GerencialTransaction) => {
    setEditing(undefined);
    setList((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  };

  const onMarked = (t: GerencialTransaction) => {
    setMarking(null);
    setList((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  };

  const unmarkPaid = async (t: GerencialTransaction) => {
    if (!confirm("Reverter pagamento?")) return;
    try {
      const updated: GerencialTransaction = await apiFetch(
        `/gerencial/transactions/${t.id}/unmark-paid`,
        { method: "POST" }
      );
      setList((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
      toast.success("Pagamento revertido.");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao reverter.");
    }
  };

  const cloneNext = async (t: GerencialTransaction) => {
    // proximo mes de reference_month
    const ref = (t.reference_month || "").slice(0, 7);
    const [y, m] = ref.split("-").map((s) => parseInt(s, 10));
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    try {
      const cloned: GerencialTransaction = await apiFetch(
        `/gerencial/transactions/${t.id}/clone`,
        { method: "POST", body: JSON.stringify({ reference_month: next }) }
      );
      toast.success(`Clonada para ${formatMonthLabel(next)}.`);
      // Se o mes selecionado eh o do clone, ja inclui na lista
      if (next === month) {
        setList((prev) => [cloned, ...prev]);
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha ao clonar.");
    }
  };

  const deleteTx = async (t: GerencialTransaction) => {
    if (!confirm(`Apagar "${t.description}"? Não dá pra desfazer.`)) return;
    try {
      await apiFetch(`/gerencial/transactions/${t.id}`, { method: "DELETE" });
      setList((prev) => prev.filter((x) => x.id !== t.id));
      toast.success("Apagada.");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao apagar.");
    }
  };

  const openProof = async (t: GerencialTransaction) => {
    try {
      const res: { url: string } = await apiFetch(`/gerencial/transactions/${t.id}/proof`);
      if (res?.url) window.open(res.url, "_blank");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao abrir comprovante.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">Caracol Gerencial</h4>
          <h1 className="text-2xl font-semibold text-foreground">Transações</h1>
          <p className="mt-1 text-sm text-muted">
            Despesas (salário, fixo, avulsos) e receitas (parceiros sem nota, avulsos).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-border bg-surface p-2 text-muted hover:bg-surface/80 disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setEditing(null)}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-black hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nova transação
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <div>
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

          <div className="flex items-center gap-1">
            {(
              [
                { v: "todos", l: "Todos" },
                { v: "despesa", l: "Despesa" },
                { v: "receita", l: "Receita" }
              ] as Array<{ v: TransactionKind | "todos"; l: string }>
            ).map((opt) => (
              <button
                key={opt.v}
                onClick={() => setKindFilter(opt.v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  kindFilter === opt.v ? "bg-primary text-black" : "bg-background text-muted hover:text-foreground"
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {(
              [
                { v: "todos", l: "Todos" },
                { v: "pendente", l: "Pendentes" },
                { v: "pago", l: "Pagos" }
              ] as Array<{ v: StatusFilter; l: string }>
            ).map((opt) => (
              <button
                key={opt.v}
                onClick={() => setStatusFilter(opt.v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === opt.v
                    ? "bg-primary text-black"
                    : "bg-background text-muted hover:text-foreground"
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Tipo", "Descrição", "Categoria", "Valor", "País", "Vencimento", "Status", "Ações"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-muted">
                    Nenhuma transação. Clique em "Nova transação" pra adicionar.
                  </td>
                </tr>
              ) : (
                list.map((t, i) => {
                  const isPaid = !!t.paid_at;
                  return (
                    <tr
                      key={t.id}
                      className={`transition-colors hover:bg-background ${
                        i < list.length - 1 ? "border-b border-border" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        {t.kind === "despesa" ? (
                          <span className="inline-flex items-center rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                            Despesa
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                            Receita
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{t.description}</div>
                        {t.recurring && (
                          <div className="text-[10px] uppercase tracking-wider text-muted">recorrente</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{t.category}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-foreground">
                        {formatCurrency(t.amount, t.moeda)}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {t.caracol_entity === "BR" ? "Brasil" : "Exterior"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {isPaid ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                            {t.kind === "despesa" ? "Pago" : "Recebido"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditing(t)}
                            className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
                            title="Editar"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          {!isPaid ? (
                            <button
                              onClick={() => setMarking(t)}
                              className="rounded p-1.5 text-muted hover:bg-emerald-500/15 hover:text-emerald-300"
                              title={t.kind === "despesa" ? "Marcar como paga" : "Marcar como recebida"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => unmarkPaid(t)}
                              className="rounded p-1.5 text-muted hover:bg-amber-500/15 hover:text-amber-300"
                              title="Reverter pagamento"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 rotate-180" />
                            </button>
                          )}
                          {t.proof_path && (
                            <button
                              onClick={() => openProof(t)}
                              className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
                              title="Ver comprovante"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => cloneNext(t)}
                            className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
                            title="Clonar pro próximo mês"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteTx(t)}
                            className="rounded p-1.5 text-muted hover:bg-danger/15 hover:text-danger"
                            title="Apagar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <TransactionEditModal
          transaction={editing}
          onClose={() => setEditing(undefined)}
          onSaved={editing === null ? onCreated : onSaved}
        />
      )}
      {marking && (
        <TransactionMarkPaidModal
          transaction={marking}
          onClose={() => setMarking(null)}
          onSaved={onMarked}
        />
      )}
    </div>
  );
}
