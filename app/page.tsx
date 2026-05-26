"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/gerencial/navbar";
import { DashboardView } from "@/components/gerencial/dashboard-view";
import { TransactionsView } from "@/components/gerencial/transactions-view";

function HomeInner() {
  const searchParams = useSearchParams();
  const view = (searchParams?.get("view") as "transacoes" | null) === "transacoes" ? "transacoes" : "dashboard";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar view={view} />
      {view === "dashboard" ? <DashboardView /> : <TransactionsView />}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
