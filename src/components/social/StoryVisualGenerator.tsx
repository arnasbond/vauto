"use client";

import { useCallback, useState } from "react";
import {
  Download,
  ImageIcon,
  Loader2,
  Share2,
  Sparkles,
} from "lucide-react";
import type { Listing } from "@/lib/types";
import {
  downloadStoryVisual,
  renderListingStoryVisual,
  shareStoryVisualFile,
  type StoryVisualResult,
} from "@/lib/story-visual";
import { trackListingEvent } from "@/lib/listing-events";
import { cn } from "@/lib/cn";

interface StoryVisualGeneratorProps {
  listing: Listing;
  caption?: string;
  className?: string;
  onGenerated?: () => void;
  onShared?: () => void;
}

const BTN =
  "border border-[var(--vauto-border)] bg-[var(--vauto-surface)] text-[var(--vauto-text)] font-medium rounded-xl hover:bg-black/[0.03] transition";

/**
 * One-tap 9:16 Story / Reels visual — preview, download, native share.
 */
export function StoryVisualGenerator({
  listing,
  caption,
  className,
  onGenerated,
  onShared,
}: StoryVisualGeneratorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StoryVisualResult | null>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "saved" | "shared">(
    "idle"
  );

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await renderListingStoryVisual(listing);
      setResult(next);
      setStatus("ready");
      onGenerated?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nepavyko sugeneruoti Stories vizualo"
      );
      setResult(null);
      setStatus("idle");
    } finally {
      setBusy(false);
    }
  }, [listing, onGenerated]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    downloadStoryVisual(result);
    setStatus("saved");
  }, [result]);

  const handleShare = useCallback(async () => {
    if (!result) return;
    const outcome = await shareStoryVisualFile(result, listing, caption);
    if (outcome === "shared" || outcome === "downloaded") {
      trackListingEvent("share_story", {
        listingId: listing.id,
        format: "9:16",
        outcome,
        sellerId: listing.sellerId,
      });
    }
    if (outcome === "shared") {
      setStatus("shared");
      onShared?.();
    } else if (outcome === "downloaded") {
      setStatus("saved");
    } else {
      setError("Dalijimasis nepavyko — bandykite atsisiųsti PNG.");
    }
  }, [caption, listing, onShared, result]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-3",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--vauto-text)]">
          <ImageIcon className="h-3.5 w-3.5 text-[var(--vauto-teal)]" />
          Stories / Reels · 9:16
        </p>
        <span className="text-[10px] text-[var(--vauto-text-muted)]">
          Instagram · TikTok · FB
        </span>
      </div>

      {!result ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className={cn(
            "flex w-full items-center justify-center gap-2 px-3 py-3 text-xs font-semibold",
            BTN,
            "border-[var(--vauto-teal)]/30 bg-[var(--vauto-teal)]/5 text-[var(--vauto-teal)]"
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generuojamas vizualas…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Sukurti Stories vizualą
            </>
          )}
        </button>
      ) : (
        <div className="space-y-2.5">
          <div className="mx-auto w-[42%] overflow-hidden rounded-xl border border-black/10 bg-black shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.dataUrl}
              alt="9:16 Stories peržiūra"
              className="aspect-[9/16] w-full object-cover"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs",
                BTN
              )}
            >
              <Download className="h-3.5 w-3.5" />
              Atsisiųsti
            </button>
            <button
              type="button"
              onClick={() => void handleShare()}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold",
                BTN,
                "bg-[var(--vauto-teal)] text-white hover:opacity-95"
              )}
            >
              <Share2 className="h-3.5 w-3.5" />
              Dalintis
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate()}
            className="w-full text-center text-[10px] font-medium text-[var(--vauto-text-muted)] hover:text-[var(--vauto-text)]"
          >
            Generuoti iš naujo
          </button>
          {status === "saved" ? (
            <p className="text-center text-[10px] text-emerald-600">
              PNG išsaugotas įrenginyje — įkelkite į Stories / Reels.
            </p>
          ) : null}
          {status === "shared" ? (
            <p className="text-center text-[10px] text-emerald-600">
              Vizualas perduotas dalijimosi langui.
            </p>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="mt-2 text-[10px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
