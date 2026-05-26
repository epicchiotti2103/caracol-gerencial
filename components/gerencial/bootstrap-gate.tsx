"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { HUB_URL } from "@/lib/config";

type GateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "not-admin" }
  | { status: "error"; message: string };

export function BootstrapGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [state, setState] = useState<GateState>({ status: "idle" });

  const skipGate = pathname === "/login";

  useEffect(() => {
    if (skipGate) {
      setState({ status: "idle" });
      return;
    }
    if (loading) {
      setState({ status: "checking" });
      return;
    }
    if (!user) {
      setState({ status: "idle" });
      return;
    }
    if (user.role !== "admin") {
      setState({ status: "not-admin" });
      return;
    }
    setState({ status: "ok" });
  }, [user, loading, skipGate]);

  useEffect(() => {
    if (state.status === "not-admin" && typeof window !== "undefined") {
      const target = `${HUB_URL}?reason=no_access_gerencial`;
      const t = setTimeout(() => {
        window.location.href = target;
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [state.status]);

  if (skipGate) return <>{children}</>;

  if (state.status === "checking" || state.status === "idle") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (state.status === "not-admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
        <div className="max-w-md space-y-3">
          <h1 className="text-lg font-semibold">Sem acesso ao Gerencial</h1>
          <p className="text-sm text-muted">
            Apenas admins do Caracol acessam essa area. Voltando pro Hub.
          </p>
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
        <div className="max-w-md space-y-3">
          <h1 className="text-lg font-semibold">Erro ao validar acesso</h1>
          <p className="text-sm text-muted">{state.message}</p>
          <button
            onClick={() => logout()}
            className="mt-2 inline-flex h-9 items-center rounded border border-border bg-surface px-3 text-[13px] hover:bg-background"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
