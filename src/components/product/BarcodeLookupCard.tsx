"use client";

import { Barcode, CheckCircle2, Loader2 } from "lucide-react";
import type { BarcodeLookupResult } from "@/lib/product-intelligence/barcode-lookup";

interface BarcodeLookupCardProps {
  loading: boolean;
  result: BarcodeLookupResult | null;
  barcode?: string;
}

function sourceLabel(source: BarcodeLookupResult["source"]): string {
  switch (source) {
    case "open-library":
      return "Open Library";
    case "open-beauty-facts":
      return "Open Beauty Facts";
    case "open-food-facts":
      return "Open Food Facts";
    case "upcitemdb":
      return "UPCitemdb";
    case "barcode-unregistered":
      return "Kodas neatpažintas registre";
    default:
      return source;
  }
}

export function BarcodeLookupCard({
  loading,
  result,
  barcode,
}: BarcodeLookupCardProps) {
  return (
    <div className="mb-3 rounded-xl border border-[var(--ds-ai)]/25 bg-[var(--ds-ai-soft)] p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-surface-card)] text-[var(--ds-ai)] shadow-sm">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Barcode className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--ds-ai)]">
            Brūkšninis kodas
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--vauto-body)]">
            {loading
              ? "Tikriname gamyklinius duomenis…"
              : barcode
                ? `Kodas: ${barcode}`
                : "Nuskaitytas kodas automatiškai užpildo prekės laukus."}
          </p>
          {result?.verified && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-success-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--ds-success)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Gyvi registrai — {sourceLabel(result.source)}
            </span>
          )}
        </div>
      </div>

      {result && !loading && (
        <div className="mt-3 rounded-lg bg-[var(--ds-surface-card)] p-3 text-xs text-[var(--vauto-body)]">
          {result.notFoundInRegistry ? (
            <p className="leading-relaxed text-amber-700 dark:text-amber-300">
              {result.userMessage ??
                "Kodas atpažintas, bet nerastas viešame registre. Parašykite daikto pavadinimą patys."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {result.brand && <span>Ženklas: {result.brand}</span>}
              {result.title && <span className="col-span-2">{result.title}</span>}
              {result.category && <span className="col-span-2">{result.category}</span>}
              {result.quantity && <span>Talpa/dydis: {result.quantity}</span>}
              {result.author && <span>Autorius: {result.author}</span>}
              {result.publishYear && <span>Metai: {result.publishYear}</span>}
              <span className="col-span-2 text-[var(--vauto-text-muted)]">
                Šaltinis: {sourceLabel(result.source)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
