"use client";

import { useState } from "react";
import { Activity, CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  runNationwideDiagnostics,
  type DiagnosticResult,
} from "@/lib/qa-diagnostics";
import { cn } from "@/lib/cn";

export function SystemDiagnosticsCard() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[] | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const r = await runNationwideDiagnostics();
      setResults(r);
    } finally {
      setRunning(false);
    }
  };

  const allOk = results?.every((r) => r.ok);

  return (
    <section className="vauto-dashboard-card rounded-2xl border border-[var(--vauto-border)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[var(--vauto-teal)]" />
          <div>
            <h3 className="text-sm font-bold text-[var(--vauto-text)]">
              Sistemos diagnostika
            </h3>
            <p className="text-[10px] text-[var(--vauto-text-muted)]">
              Visos Lietuvos katalogas · filtrai · sitemap
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded-xl bg-[var(--vauto-teal)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Paleisti"
          )}
        </button>
      </div>

      {results && (
        <p
          className={cn(
            "mb-3 text-xs font-medium",
            allOk ? "text-green-600" : "text-amber-600"
          )}
        >
          {allOk
            ? "Visi testai praeiti"
            : "Kai kurie testai reikalauja dėmesio"}
        </p>
      )}

      <ul className="space-y-2">
        {(results ?? []).map((r) => (
          <li
            key={r.id}
            className="flex items-start gap-2 rounded-xl border border-[var(--vauto-border)]/60 bg-[var(--vauto-bg)]/50 p-2.5 text-xs"
          >
            {r.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--vauto-text)]">{r.label}</p>
              <p className="text-[var(--vauto-text-muted)]">{r.detail}</p>
              {r.ms != null && (
                <p className="text-[10px] text-[var(--vauto-text-muted)]">
                  {r.ms} ms
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
