import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Log Analysis · Vibe Coding Demo",
  description: "Logs → AI structured summary → cited evidence, gated by Envoy AI Gateway.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
