"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogOut, Wallet, LayoutDashboard, ListChecks } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type View = "dashboard" | "transacoes";

export function Navbar({ view }: { view: View }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const setView = (v: View) => {
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (v === "dashboard") params.delete("view");
    else params.set("view", v);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-black">
              GE
            </div>
            <span className="text-sm font-semibold text-foreground">Caracol Gerencial</span>
          </Link>

          <nav className="flex items-center gap-1">
            <TabButton
              active={view === "dashboard"}
              onClick={() => setView("dashboard")}
              icon={<LayoutDashboard className="h-3.5 w-3.5" />}
              label="Dashboard"
            />
            <TabButton
              active={view === "transacoes"}
              onClick={() => setView("transacoes")}
              icon={<ListChecks className="h-3.5 w-3.5" />}
              label="Transações"
            />
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{user?.name || user?.email}</span>
          <button
            onClick={() => logout()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs hover:bg-surface/80"
          >
            <LogOut className="h-3 w-3" />
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-black"
          : "text-muted hover:bg-background hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
