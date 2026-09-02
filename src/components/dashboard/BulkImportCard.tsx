"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/design-system";
import {
  apiBulkImportPreview,
  checkImportFile,
  type ImportPreviewResponse,
} from "@/lib/api/bulk-import";

/**
 * F6 Final — real CSV/XML import card (replaces the demo BulkUploadCard).
 * Upload → server parse/validate/mapping preview → error report. The server
 * is the only authority: `importEnabled` is always shown as the server
 * reports it (currently fail-closed OFF) — the UI NEVER fakes completion
 * and never publishes anything.
 */
export function BulkImportCard() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const handleFile = async (file: File | undefined | null) => {
    setCopied(false);
    if (!file) return;
    const check = checkImportFile(file);
    if (!check.ok) {
      setFileName(file.name);
      setPreview(null);
      setError(check.message);
      return;
    }
    setFileName(file.name);
    setError(null);
    setBusy(true);
    const res = await apiBulkImportPreview(file);
    setBusy(false);
    if (!res.ok) {
      setPreview(null);
      setError(res.error);
      return;
    }
    setPreview(res.data);
    window.setTimeout(() => resultsRef.current?.focus(), 0);
  };

  const copyReport = async () => {
    if (!preview?.reportText) return;
    try {
      await navigator.clipboard.writeText(preview.reportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const downloadReport = () => {
    if (!preview?.reportText) return;
    const blob = new Blob([preview.reportText], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vauto-importo-ataskaita.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-label="Masinis CSV/XML importas"
      data-bulk-import-card
      className="vauto-dashboard-card mb-4 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]">
          <UploadCloud className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Masinis importas (CSV / XML)
          </p>
          <h2 className="mt-1 text-base font-bold text-[var(--vauto-text-heading)]">
            Įkelkite iki 100 skelbimų vienu failu
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
            Failas tikrinamas serveryje: UTF-8, kablelio/kabliataškio taisyklė,
            XXE/DTD atmetimas, dydžio ir eilučių limitai, kategorijų ir
            atributų validavimas.
          </p>

          <label
            htmlFor="bulk-import-file"
            className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--ds-brand)] px-4 py-2.5 text-xs font-semibold text-[var(--ds-brand-contrast)]"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            {busy ? "Tikrinama…" : "Pasirinkti failą (.csv, .xml)"}
          </label>
          <input
            ref={inputRef}
            id="bulk-import-file"
            type="file"
            accept=".csv,.xml,text/csv,application/xml,text/xml"
            className="sr-only"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          {fileName ? (
            <p className="mt-2 text-xs text-[var(--vauto-text-muted)]">
              Failas: <span className="font-medium">{fileName}</span>
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="mt-2 rounded-lg bg-[var(--ds-danger-soft)] px-3 py-2 text-xs text-[var(--ds-danger)]"
            >
              {error}
            </p>
          ) : null}

          {preview ? (
            <div
              ref={resultsRef}
              tabIndex={-1}
              aria-label="Importo tikrinimo rezultatai"
              className="mt-3 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-muted)] p-3 outline-none"
              data-import-preview
            >
              <div className="mb-2 flex items-start gap-2 rounded-lg bg-[var(--ds-warning-soft)] px-3 py-2 text-xs text-[var(--ds-text-primary)]">
                <ShieldAlert
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ds-warning)]"
                  aria-hidden
                />
                <span>
                  {preview.importEnabled
                    ? "Importas įjungtas. Importuojama tik į juodraščius ir niekada nepublikuojama automatiškai."
                    : "Importas šiuo metu išjungtas — failas buvo tik patikrintas, niekas nebuvo išsaugota ir jokie skelbimai nesukurti."}
                </span>
              </div>

              {preview.error ? (
                <p
                  role="alert"
                  className="mb-2 flex items-start gap-2 rounded-lg bg-[var(--ds-danger-soft)] px-3 py-2 text-xs text-[var(--ds-danger)]"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {preview.error}
                </p>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone="success">Tinkamos: {preview.summary.ok}</Badge>
                    {preview.summary.warnings > 0 ? (
                      <Badge tone="warning">
                        Su įspėjimais: {preview.summary.warnings}
                      </Badge>
                    ) : null}
                    {preview.summary.errors > 0 ? (
                      <Badge tone="danger">
                        Klaidingos: {preview.summary.errors}
                      </Badge>
                    ) : null}
                    <Badge tone="neutral">
                      {preview.source.toUpperCase()} · {preview.summary.total}{" "}
                      eil.
                    </Badge>
                  </div>

                  <p className="mb-2 text-xs font-semibold text-[var(--ds-text-secondary)]">
                    Stulpelių susiejimas
                  </p>
                  <ul className="mb-2 space-y-0.5 text-xs text-[var(--ds-text-muted)]">
                    {preview.mapping.map((m) => (
                      <li key={m.column}>
                        <span className="font-medium text-[var(--ds-text-primary)]">
                          {m.column}
                        </span>{" "}
                        → {m.ignored ? "(ignoruojamas)" : m.field}
                      </li>
                    ))}
                  </ul>

                  <ul className="mb-3 max-h-48 space-y-1 overflow-y-auto">
                    {preview.rows.map((row) => (
                      <li
                        key={row.line}
                        className="flex items-start gap-2 rounded-lg bg-[var(--ds-surface-card)] px-2 py-1.5 text-xs"
                      >
                        {row.verdict === "ok" ? (
                          <CheckCircle2
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ds-success)]"
                            aria-hidden
                          />
                        ) : (
                          <AlertTriangle
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ds-warning)]"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-[var(--ds-text-primary)]">
                            Eil. {row.line}: {row.title ?? "—"}
                          </span>{" "}
                          <span className="text-[var(--ds-text-muted)]">
                            {row.category ?? "—"} · {row.price ?? "—"} € ·{" "}
                            {row.location ?? "—"}
                          </span>
                          {row.errors.map((e, i) => (
                            <span
                              key={i}
                              className="block text-[var(--ds-danger)]"
                            >
                              Klaida: {e}
                            </span>
                          ))}
                          {row.warnings.map((w, i) => (
                            <span
                              key={i}
                              className="block text-[var(--ds-warning)]"
                            >
                              Įspėjimas: {w}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyReport()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ds-border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-text-primary)]"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
                  {copied ? "Nukopijuota" : "Kopijuoti ataskaitą"}
                </button>
                <button
                  type="button"
                  onClick={downloadReport}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ds-border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-text-primary)]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Atsisiųsti ataskaitą (.txt)
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
