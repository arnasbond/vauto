"use client";

import { useState } from "react";
import { Link2, Loader2, Sparkles } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { isSupportedImportUrl } from "@/lib/listing-url-import";
import { cn } from "@/lib/cn";

export function QuickImportFromUrlCard() {
  const { importListingFromUrl, sellerStep, showToast } = useVauto();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const busy =
    loading || (sellerStep !== "idle" && sellerStep !== "published");

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      showToast("Įklijuokite skelbimo nuorodą", "info");
      return;
    }
    if (!isSupportedImportUrl(trimmed)) {
      showToast(
        "Palaikoma: Autoplius, Aruodas, Vinted, Skelbiu, CVBankas",
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
        "mb-5 rounded-2xl border p-4",
        "border-[var(--vauto-border)] bg-[var(--vauto-surface)]",
        "shadow-sm"
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--vauto-teal)]/15">
          <Sparkles className="h-4 w-4 text-[var(--vauto-teal)]" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[var(--vauto-text)]">
            Greitasis AI importas iš kitų portalų
          </h3>
          <p className="text-[10px] text-[var(--vauto-text-muted)]">
            Visoje Lietuvoje · Autoplius · Aruodas · Vinted · Skelbiu · CVBankas
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--vauto-text-muted)]" />
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            name="listing-import-url"
            placeholder="https://autoplius.lt/skelbimai/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            className={cn(
              "w-full rounded-xl border py-3 pl-10 pr-3 text-sm",
              "border-[var(--vauto-border)] bg-[var(--vauto-bg)]",
              "text-[var(--vauto-text)] placeholder:text-[var(--vauto-text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-[var(--vauto-teal)]/40"
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
            "shrink-0 rounded-xl px-4 py-3 text-sm font-semibold text-white",
            "bg-[var(--vauto-orange)] hover:opacity-90 disabled:opacity-50"
          )}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            "Importuoti"
          )}
        </button>
      </div>
    </section>
  );
}
