"use client";

import { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import type {
  GerencialTransaction,
  GerencialTransactionCreate,
  Moeda,
  CaracolEntity,
  TransactionKind
} from "@/types";
import {
  parseNumberPtBr,
  sanitizeNumberInput,
  blurFormatNumberPtBr,
  buildMonthOptions,
  currentYearMonth
} from "@/lib/format";

interface Props {
  transaction: GerencialTransaction | null; // null = criar
  onClose: () => void;
  onSaved: (t: GerencialTransaction) => void;
}

const CATEGORIES = ["Fixo", "Variável", "Salário"];

export function TransactionEditModal({ transaction, onClose, onSaved }: Props) {
  const isEdit = !!transaction;
  const toast = useToast();
  const monthOpts = buildMonthOptions();

  const [kind, setKind] = useState<TransactionKind>(transaction?.kind || "despesa");
  const [category, setCategory] = useState(transaction?.category || "Fixo");
  const [description, setDescription] = useState(transaction?.description || "");
  const [amount, setAmount] = useState(
    transaction?.amount != null ? blurFormatNumberPtBr(String(transaction.amount)) : ""
  );
  const [moeda, setMoeda] = useState<Moeda>(transaction?.moeda || "BRL");
  const [entity, setEntity] = useState<CaracolEntity>(transaction?.caracol_entity || "BR");
  const [referenceMonth, setReferenceMonth] = useState(
    (transaction?.reference_month || "").slice(0, 7) || currentYearMonth()
  );
  const [dueDate, setDueDate] = useState((transaction?.due_date || "").slice(0, 10));
  const [notes, setNotes] = useState(transaction?.notes || "");
  const [recurring, setRecurring] = useState(transaction?.recurring ?? false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!description.trim()) {
      setError("Descrição obrigatória.");
      return;
    }
    const amountValue = parseNumberPtBr(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Valor inválido.");
      return;
    }

    const payload: GerencialTransactionCreate = {
      kind,
      category: category.trim(),
      description: description.trim(),
      amount: amountValue,
      moeda,
      caracol_entity: entity,
      reference_month: referenceMonth,
      due_date: dueDate || null,
      notes: notes.trim() || null,
      recurring
    };

    setSaving(true);
    try {
      const saved: GerencialTransaction = isEdit && transaction
        ? await apiFetch(`/gerencial/transactions/${transaction.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await apiFetch("/gerencial/transactions", {
            method: "POST",
            body: JSON.stringify(payload)
          });
      toast.success(isEdit ? "Transação atualizada." : "Transação criada.");
      onSaved(saved);
    } catch (err: any) {
      setError(err?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/60";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-zinc-950 px-6 py-4">
          <p className="text-base font-semibold text-orange-50">
            {isEdit ? "Editar movimentação" : "Nova movimentação"}
          </p>
          <button onClick={onClose} className="text-orange-100/40 hover:text-orange-50" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Tipo */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Tipo</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setKind("despesa")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                    kind === "despesa"
                      ? "border-danger/50 bg-danger/10 text-danger"
                      : "border-border bg-background text-muted"
                  }`}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => setKind("receita")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                    kind === "receita"
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                      : "border-border bg-background text-muted"
                  }`}
                >
                  Receita
                </button>
              </div>
            </div>

            {/* Categoria */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Categoria</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputCls}
                placeholder="Fixo, Variável, Salário..."
                list="cat-list"
              />
              <datalist id="cat-list">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            {/* Descricao */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Descrição</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputCls}
                placeholder='Ex: "Salário Pedro maio/2026"'
                autoFocus
              />
            </div>

            {/* Valor + Moeda */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-foreground">Valor</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(sanitizeNumberInput(e.target.value))}
                  onBlur={(e) => setAmount(blurFormatNumberPtBr(e.target.value))}
                  className={inputCls + " font-mono text-right"}
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Moeda</label>
                <select value={moeda} onChange={(e) => setMoeda(e.target.value as Moeda)} className={inputCls}>
                  <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            {/* Pais + Mes ref */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">País</label>
                <select value={entity} onChange={(e) => setEntity(e.target.value as CaracolEntity)} className={inputCls}>
                  <option value="BR">Brasil</option>
                  <option value="LLC">Exterior</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Mês de referência</label>
                <select value={referenceMonth} onChange={(e) => setReferenceMonth(e.target.value)} className={inputCls}>
                  {monthOpts.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Due date + Recurring */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Vencimento (opcional)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(e) => setRecurring(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Recorrente
                </label>
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Notas (opcional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputCls + " min-h-[60px] resize-y"}
                placeholder="Anotações internas..."
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-background/40 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:bg-surface"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : isEdit ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
