"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import type { Listing } from "@/lib/types";
import {
  fetchListingShareCopy,
  type ListingShareCopy,
} from "@/lib/listing-share-generator";
import { cn } from "@/lib/cn";

interface ShareSpintaButtonProps {
  listing: Listing;
  className?: string;
}

function encode(text: string): string {
  return encodeURIComponent(text);
}

export function ShareSpintaButton({ listing, className }: ShareSpintaButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copy, setCopy] = useState<ListingShareCopy | null>(null);
  const [copied, setCopied] = useState<"facebook" | "instagram" | null>(null);

  const loadAndOpen = useCallback(async () => {
    setOpen(true);
    if (copy) return;
    setLoading(true);
    try {
      const result = await fetchListingShareCopy(listing);
      setCopy(result);
    } finally {
      setLoading(false);
    }
  }, [listing, copy]);

  const shareFacebook = () => {
    if (!copy) return;
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encode(copy.url)}&quote=${encode(copy.facebook)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=520");
  };

  const copyText = async (platform: "facebook" | "instagram", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(platform);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={() => void loadAndOpen()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#e1306c] to-[#f97316] py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:brightness-110"
      >
        <Sparkles className="h-4 w-4" />
        Pasidalinti spinta
      </button>

      {open && (
        <div className="rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-[var(--vauto-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI generuoja parduodantį tekstą…
            </div>
          )}

          {copy && !loading && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--vauto-text-muted)]">
                Facebook / Instagram
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={shareFacebook}
                  className="rounded-xl border border-[#1877f2]/30 bg-[#1877f2]/10 px-3 py-2.5 text-left text-xs font-semibold text-[#6eb0ff]"
                >
                  Facebook — dalintis
                </button>
                <button
                  type="button"
                  onClick={() => void copyText("instagram", copy.instagram)}
                  className="rounded-xl border border-[#e1306c]/25 bg-[#e1306c]/10 px-3 py-2.5 text-left text-xs font-semibold text-[#f472b6]"
                >
                  {copied === "instagram" ? (
                    <span className="flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Nukopijuota
                    </span>
                  ) : (
                    "Instagram — kopijuoti tekstą"
                  )}
                </button>
              </div>

              <div className="space-y-2 rounded-xl bg-black/5 p-3 text-[11px] leading-relaxed text-[var(--vauto-text-muted)]">
                <p className="font-medium text-[var(--vauto-text)]">Facebook:</p>
                <p>{copy.facebook}</p>
                <button
                  type="button"
                  onClick={() => void copyText("facebook", copy.facebook)}
                  className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[var(--vauto-teal)]"
                >
                  {copied === "facebook" ? (
                    <>
                      <Check className="h-3 w-3" /> Nukopijuota
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Kopijuoti
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
