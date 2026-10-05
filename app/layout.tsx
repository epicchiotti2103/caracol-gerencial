import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/lib/toast-context";
import { BootstrapGate } from "@/components/gerencial/bootstrap-gate";
import { AssistWidget } from "@/components/assist-widget";

export const metadata: Metadata = {
  title: "Caracol Gerencial",
  description: "Controle financeiro interno da Caracol"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body>
        <AuthProvider>
          <ToastProvider>
            <BootstrapGate>{children}</BootstrapGate>
          </ToastProvider>
          <AssistWidget app="gerencial" />
        </AuthProvider>
      </body>
    </html>
  );
}
