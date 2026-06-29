"use client";

import { useState } from "react";
import { ExternalLink, Link2, Loader2, Sparkles } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { isSupportedImportUrl } from "@/lib/listing-url-import";
import { cn } from "@/lib/cn";

const SUPPORTED_PORTALS = [
  "Skelbiu",
  "Autoplius",
  "Aruodas",
  "Paslaugos.lt",
  "Vinted",
  "CVBankas",
];

export function QuickImportFromUrlCard() {
  const { importListingFromUrl, sellerStep, showToast } = useVauto();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const busy =
    loading || (sellerStep !== "idle" && sellerStep !== "published");

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      showToast("Įklijuokite skelbimo nuorodą (URL)", "info");
      return;
    }
    if (!isSupportedImportUrl(trimmed)) {
      showToast(
        "Palaikoma: Skelbiu, Autoplius, Aruodas, Paslaugos.lt, Vinted, CVBankas",
        "error"
      );
      return;
    }
    setLoading(true);
    try {
      await importListingFromUrl(trimmed);
      setUrl("");
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Importas nepavyko",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className={cn(
        "mb-6 overflow-hidden rounded-2xl border-2 shadow-md",
        "border-[var(--vauto-accent,#ff6b00)]/35",
        "bg-gradient-to-br from-[color-mix(in_srgb,var(--vauto-primary,#1167b1)_12%,#fff)] via-[var(--vauto-card-bg,#fff)] to-[color-mix(in_srgb,var(--vauto-accent,#ff6b00)_10%,#fff)]"
      )}
    >
      <div className="border-b border-[var(--vauto-border,#e5e7eb)] bg-[color-mix(in_srgb,var(--vauto-primary,#1167b1)_8%,transparent)] px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--vauto-accent,#ff6b00)] text-white shadow-sm">
            <ExternalLink className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-[var(--vauto-text-main,#111827)]">
                Importuoti iš kito portalo
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--vauto-primary,#1167b1)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--vauto-primary,#1167b1)]">
                <Sparkles className="h-3 w-3" />
                AI per 5 sek.
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--vauto-text-muted,#6b7280)]">
              Jau turite skelbimą{" "}
              <strong className="font-semibold text-[var(--vauto-text-main,#374151)]">
                Autoplius
              </strong>
              ,{" "}
              <strong className="font-semibold text-[var(--vauto-text-main,#374151)]">
                Skelbiu
              </strong>{" "}
              ar kitur? Įklijuokite nuorodą — nereikia visko rašyti ranka.
            </p>
            <p className="mt-1.5 text-[10px] font-medium text-[var(--vauto-text-muted,#9ca3af)]">
              {SUPPORTED_PORTALS.join(" · ")}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <label className="block text-xs font-semibold text-[var(--vauto-text-main,#374151)]">
          Įklijuokite skelbimo nuorodą (URL)
        </label>
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--vauto-text-muted,#9ca3af)]" />
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            name="listing-import-url"
            placeholder="https://autoplius.lt/skelbimai/... arba skelbiu.lt/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            className={cn(
              "profile-editable-input w-full rounded-xl border py-3.5 pl-10 pr-3 text-sm",
              "border-slate-700 bg-[#1e293b]",
              "text-white placeholder:text-slate-500",
              "focus:outline-none focus:ring-2 focus:ring-[var(--vauto-accent,#ff6b00)]/40"
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleImport();
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={busy}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-sm transition",
            "bg-[var(--vauto-accent,#ff6b00)] hover:brightness-105 disabled:opacity-50"
          )}
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Importuojama…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Importuoti per 5 sek.
            </>
          )}
        </button>
      </div>
    </section>
  );
}
