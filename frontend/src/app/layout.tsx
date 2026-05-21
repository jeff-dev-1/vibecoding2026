import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Log Analysis · Vibe Coding Demo",
  description: "Upload logs, get AI-summarized anomalies, ask in natural language.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <div className="mx-auto max-w-6xl px-6 py-8">
          <header className="mb-8 flex items-baseline justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">AI Log Analysis</h1>
            <span className="text-xs text-slate-500">
              Vibe Coding Demo · Envoy AI Gateway in the middle
            </span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
