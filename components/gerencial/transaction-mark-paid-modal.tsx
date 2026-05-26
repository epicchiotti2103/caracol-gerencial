"use client";

import { useState } from "react";
import { X, AlertCircle, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import type { GerencialTransaction } from "@/types";
import { formatCurrency } from "@/lib/format";

interface Props {
  transaction: GerencialTransaction;
  onClose: () => void;
  onSaved: (t: GerencialTransaction) => void;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIME = ["image/png", "image/jpeg", "application/pdf"];

export function TransactionMarkPaidModal({ transaction, onClose, onSaved }: Props) {
  const toast = useToast();
  const [proof, setProof] = useState<File | null>(null);
  const [paidAt, setPaidAt] = useState(
    new Date().toISOString().slice(0, 10) // hoje YYYY-MM-DD
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isReceita = transaction.kind === "receita";
  const label = isReceita ? "Marcar como recebida" : "Marcar como paga";

  const onFile = (file: File | null) => {
    setError("");
    if (!file) {
      setProof(null);
      return;
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      setError("Arquivo deve ser PNG, JPEG ou PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Arquivo maior que 10MB.");
      return;
    }
    setProof(file);
  };

  const handleSubmit = async () => {
    setError("");
    setSaving(true);
    try {
      const fd = new FormData();
      // paid_at em ISO; backend aceita
      fd.append("paid_at", new Date(paidAt + "T12:00:00").toISOString());
      if (proof) fd.append("proof", proof);
      const saved: GerencialTransaction = await apiFetch(
        `/gerencial/transactions/${transaction.id}/mark-paid`,
        { method: "POST", body: fd }
      );
      toast.success(isReceita ? "Marcada como recebida." : "Marcada como paga.");
      onSaved(saved);
    } catch (err: any) {
      setError(err?.message || "Falha ao marcar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-zinc-950 px-6 py-4">
          <div>
            <p className="text-base font-semibold text-orange-50">{label}</p>
            <p className="mt-0.5 text-xs text-orange-100/50">
              {transaction.description} • {formatCurrency(transaction.amount, transaction.moeda)}
            </p>
          </div>
          <button onClick={onClose} className="text-orange-100/40 hover:text-orange-50" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Data</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Comprovante (opcional, PNG/JPEG/PDF, max 10MB)
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background py-6 text-center hover:bg-surface/60">
              <Upload className="h-5 w-5 text-muted" />
              <span className="text-sm text-muted">
                {proof ? proof.name : "Clique para anexar"}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}
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
            {saving ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
