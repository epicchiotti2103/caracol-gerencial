"use client";

import { useState } from "react";
import { Plus, Pencil, Power, Loader2, Clock, RefreshCw } from "lucide-react";
import { apiFetchStrict, readableError } from "@/lib/api-error";
import { useToast } from "@/lib/toast-context";
import { RecurringEditModal } from "./recurring-edit-modal";
import type { GerencialRecurring } from "@/types";
import { formatCurrency, formatMonthLabel } from "@/lib/format";
import { contaLabel } from "@/lib/contas";

export type RecurringStatus = "loading" | "ready" | "unavailable";

interface Props {
  status: RecurringStatus;
  errorDetail?: string;
  items: GerencialRecurring[];
  month: string; // YYYY-MM selecionado na lista de transacoes
  highlightId?: string | null;
  onReload: () => void;
  onUpsert: (m: GerencialRecurring) => void;
  onMaterialized: () => void;
}

export function RecurringPanel({
  status,
  errorDetail,
  items,
  month,
  highlightId,
  onReload,
  onUpsert,
  onMaterialized
}: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState<GerencialRecurring | null | undefined>(undefined);
  const [materializing, setMaterializing] = useState(false);

  const toggleActive = async (m: GerencialRecurring) => {
    try {
      if (m.active) {
        if (!confirm(`Desativar "${m.description}"? Lançamentos já gerados continuam.`)) return;
        const res = await apiFetchStrict(`/gerencial/recurring/${m.id}`, { method: "DELETE" });
        onUpsert(res && res.id ? res : { ...m, active: false });
        toast.success("Modelo desativado.");
      } else {
        const res: GerencialRecurring = await apiFetchStrict(`/gerencial/recurring/${m.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: true })
        });
        onUpsert(res && res.id ? res : { ...m, active: true });
        toast.success("Modelo reativado.");
      }
    } catch (err: any) {
      toast.error(readableError(err, "Falha ao alterar."));
    }
  };

  const materialize = async () => {
    setMaterializing(true);
    try {
      const res: { month: string; created: string[] } = await apiFetchStrict(
        `/gerencial/recurring/materialize?month=${month}`,
        { method: "POST" }
      );
      const n = res?.created?.length ?? 0;
      toast.success(
        n > 0
          ? `${n} lançamento(s) gerado(s) em ${formatMonthLabel(month)}.`
          : `Nada a gerar em ${formatMonthLabel(month)} (já estava em dia).`
      );
      if (n > 0) onMaterialized();
    } catch (err: any) {
      toast.error(readableError(err, "Falha ao gerar lançamentos."));
    } finally {
      setMaterializing(false);
    }
  };

  if (status === "unavailable") {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <Clock className="mx-auto mb-3 h-6 w-6 text-amber-300" />
        <p className="text-sm font-medium text-foreground">Recurso aguardando ativação</p>
        <p className="mt-1 text-xs text-muted">
          Os lançamentos recorrentes dependem de uma atualização do banco que ainda não foi aplicada.
          As transações seguem funcionando normalmente.
        </p>
        {errorDetail && <p className="mt-2 text-[11px] text-muted/70">({errorDetail})</p>}
        <button
          onClick={onReload}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar de novo
        </button>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) =>
    a.active === b.active ? a.description.localeCompare(b.description, "pt-BR") : a.active ? -1 : 1
  );

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p className="text-xs text-muted">
          Modelos que geram um lançamento por mês automaticamente (vencimento no dia escolhido).
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={materialize}
            disabled={materializing || status !== "ready"}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
            title="Gera (se faltar) os lançamentos dos modelos ativos no mês selecionado"
          >
            {materializing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Gerar {formatMonthLabel(month)}
          </button>
          <button
            onClick={() => setEditing(null)}
            disabled={status !== "ready"}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo recorrente
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Tipo", "Descrição", "Categoria", "Valor", "Conta", "Dia", "Vigência", "Status", "Ações"].map((h) => (
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
            {status === "loading" ? (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-muted">
                  Nenhum modelo recorrente. Clique em "Novo recorrente" pra adicionar.
                </td>
              </tr>
            ) : (
              sorted.map((m, i) => (
                <tr
                  key={m.id}
                  id={`recurring-${m.id}`}
                  className={`transition-colors hover:bg-background ${
                    i < sorted.length - 1 ? "border-b border-border" : ""
                  } ${m.active ? "" : "opacity-50"} ${highlightId === m.id ? "bg-primary/10" : ""}`}
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    {m.kind === "despesa" ? (
                      <span className="inline-flex items-center rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                        Despesa
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        Receita
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {m.description}
                    <div className="text-[10px] uppercase tracking-wider text-muted">
                      {m.caracol_entity === "BR" ? "Brasil" : "Exterior"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{m.category}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-foreground">
                    {formatCurrency(m.amount, m.moeda)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{contaLabel(m.moeda, m.conta)}</td>
                  <td className="px-4 py-3 text-muted">{m.day_of_month}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatMonthLabel(m.start_month.slice(0, 7))} →{" "}
                    {m.end_month ? formatMonthLabel(m.end_month.slice(0, 7)) : "sem fim"}
                  </td>
                  <td className="px-4 py-3">
                    {m.active ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-zinc-500/15 px-2 py-0.5 text-xs font-medium text-muted">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(m)}
                        className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggleActive(m)}
                        className={`rounded p-1.5 text-muted ${
                          m.active
                            ? "hover:bg-danger/15 hover:text-danger"
                            : "hover:bg-emerald-500/15 hover:text-emerald-300"
                        }`}
                        title={m.active ? "Desativar" : "Reativar"}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing !== undefined && (
        <RecurringEditModal
          model={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(m) => {
            setEditing(undefined);
            onUpsert(m);
          }}
        />
      )}
    </div>
  );
}
