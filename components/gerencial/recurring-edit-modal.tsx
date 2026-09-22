"use client";

import { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import type {
  GerencialRecurring,
  GerencialRecurringCreate,
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
import { contasOf, CONTA_DEFAULT, isContaValid } from "@/lib/contas";

interface Props {
  model: GerencialRecurring | null; // null = criar
  onClose: () => void;
  onSaved: (m: GerencialRecurring) => void;
}

const CATEGORIES = ["Fixo", "Variável", "Salário"];

export function RecurringEditModal({ model, onClose, onSaved }: Props) {
  const isEdit = !!model;
  const toast = useToast();

  const [kind, setKind] = useState<TransactionKind>(model?.kind || "despesa");
  const [category, setCategory] = useState(model?.category || "Fixo");
  const [description, setDescription] = useState(model?.description || "");
  const [amount, setAmount] = useState(
    model?.amount != null ? blurFormatNumberPtBr(String(model.amount)) : ""
  );
  const [moeda, setMoeda] = useState<Moeda>(model?.moeda || "BRL");
  const [conta, setConta] = useState<string>(model?.conta || CONTA_DEFAULT[model?.moeda || "BRL"]);
  const [entity, setEntity] = useState<CaracolEntity>(model?.caracol_entity || "BR");
  const [day, setDay] = useState(String(model?.day_of_month ?? 5));
  const [startMonth, setStartMonth] = useState((model?.start_month || "").slice(0, 7) || currentYearMonth());
  const [endMonth, setEndMonth] = useState((model?.end_month || "").slice(0, 7));
  const [active, setActive] = useState(model?.active ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const monthOpts = buildMonthOptions([startMonth, endMonth]);
  const categories = CATEGORIES.includes(category) ? CATEGORIES : [...CATEGORIES, category];

  const changeMoeda = (m: Moeda) => {
    setMoeda(m);
    if (!isContaValid(m, conta)) setConta(CONTA_DEFAULT[m]);
  };

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
    const dayValue = parseInt(day, 10);
    if (!Number.isInteger(dayValue) || dayValue < 1 || dayValue > 31) {
      setError("Dia do mês deve ser entre 1 e 31.");
      return;
    }
    if (endMonth && endMonth < startMonth) {
      setError("Mês fim não pode ser antes do mês início.");
      return;
    }

    const payload: GerencialRecurringCreate = {
      kind,
      category: category.trim(),
      description: description.trim(),
      amount: amountValue,
      moeda,
      conta,
      caracol_entity: entity,
      day_of_month: dayValue,
      start_month: startMonth,
      end_month: endMonth || null,
      active
    };

    setSaving(true);
    try {
      const saved: GerencialRecurring = isEdit && model
        ? await apiFetch(`/gerencial/recurring/${model.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await apiFetch("/gerencial/recurring", {
            method: "POST",
            body: JSON.stringify(payload)
          });
      toast.success(isEdit ? "Modelo atualizado." : "Modelo criado.");
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
            {isEdit ? "Editar recorrente" : "Novo lançamento recorrente"}
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
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Descricao */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Descrição</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputCls}
                placeholder='Ex: "Salário Pedro"'
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
                <select value={moeda} onChange={(e) => changeMoeda(e.target.value as Moeda)} className={inputCls}>
                  <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            {/* Conta + Pais */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Conta</label>
                <select value={conta} onChange={(e) => setConta(e.target.value)} className={inputCls}>
                  {contasOf(moeda).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">País</label>
                <select value={entity} onChange={(e) => setEntity(e.target.value as CaracolEntity)} className={inputCls}>
                  <option value="BR">Brasil</option>
                  <option value="LLC">Exterior</option>
                </select>
              </div>
            </div>

            {/* Dia + inicio + fim */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Dia do mês</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Início</label>
                <select value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className={inputCls}>
                  {monthOpts.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Fim</label>
                <select value={endMonth} onChange={(e) => setEndMonth(e.target.value)} className={inputCls}>
                  <option value="">Sem fim</option>
                  {monthOpts.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted">
              Vencimento no dia escolhido (ou no último dia do mês, se não existir). O lançamento de cada mês é
              gerado automaticamente até o mês seguinte ao atual.
            </p>

            {isEdit && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Ativo
              </label>
            )}

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
