"use client";

import { useAuth } from "@/lib/auth-context";
import { LogOut, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Home() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-black">
              GE
            </div>
            <span className="text-base font-semibold">Caracol Gerencial</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">{user?.name || user?.email}</span>
            <button
              onClick={() => logout()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs hover:bg-surface/80"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="h-6 w-6" />
          </div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
            Fase 4.1 - Infra
          </h4>
          <h1 className="mb-3 text-2xl font-semibold">Em construcao</h1>
          <p className="text-sm leading-relaxed text-muted">
            O app Gerencial ainda esta sendo montado. Em breve voce vai ver aqui o dashboard
            mensal de receitas, despesas, lucro previsto vs realizado e provisionamento por
            moeda. Por enquanto, o backend ja esta em producao com a tabela de transacoes
            avulsas e recorrentes (salario, fixo, parceiro sem nota).
          </p>
        </div>
      </div>
    </main>
  );
}
