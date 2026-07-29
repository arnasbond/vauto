"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import type { Listing } from "@/lib/types";
import {
  buildListingSharePayload,
  canUseNativeShare,
  copyListingLink,
  copyTextToClipboard,
  openPlatformShare,
  PRIMARY_SHARE_PLATFORMS,
  shareListingNative,
  SOCIAL_PLATFORMS,
  type SocialPlatformId,
} from "@/lib/social-share";
import {
  fetchListingShareCopy,
  SHARE_TONE_OPTIONS,
  type ListingShareCopy,
  type SocialShareTone,
} from "@/lib/listing-share-generator";
import { StoryVisualGenerator } from "@/components/social/StoryVisualGenerator";
import { cn } from "@/lib/cn";

interface ShareListingModalProps {
  listing: Listing;
  open: boolean;
  onClose: () => void;
  /** Post-publish: softer dismiss label */
  skipLabel?: string;
  className?: string;
  onShared?: (platform: SocialPlatformId | "native" | "copy" | "ai-copy") => void;
}

const BTN =
  "border border-[var(--vauto-border)] bg-[var(--vauto-surface)] text-[var(--vauto-text)] font-medium rounded-xl hover:bg-black/[0.03] transition";

export function ShareListingModal({
  listing,
  open,
  onClose,
  skipLabel = "Praleisti",
  className,
  onShared,
}: ShareListingModalProps) {
  const [copied, setCopied] = useState<"link" | "caption" | null>(null);
  const [tone, setTone] = useState<SocialShareTone>("casual");
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiCopy, setAiCopy] = useState<ListingShareCopy | null>(null);
  const nativeAvailable = canUseNativeShare();
  const payload = buildListingSharePayload(listing);
  const caption = aiCopy?.caption || payload.text;

  const loadAi = useCallback(
    async (nextTone: SocialShareTone, force = false) => {
      setLoadingAi(true);
      try {
        const result = await fetchListingShareCopy(listing, {
          tone: nextTone,
          persist: true,
          force,
        });
        setAiCopy(result);
      } finally {
        setLoadingAi(false);
      }
    },
    [listing]
  );

  useEffect(() => {
    if (!open) return;
    void loadAi(tone);
  }, [open, listing.id]); // eslint-disable-line react-hooks/exhaustive-deps -- load once on open

  if (!open) return null;

  const handleTone = (next: SocialShareTone) => {
    setTone(next);
    void loadAi(next, true);
  };

  const handleCopyLink = async () => {
    const ok = await copyListingLink(listing);
    if (ok) {
      setCopied("link");
      onShared?.("copy");
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleCopyCaption = async () => {
    const ok = await copyTextToClipboard(caption);
    if (ok) {
      setCopied("caption");
      onShared?.("ai-copy");
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleNative = async () => {
    const ok = await shareListingNative(listing, caption);
    if (ok) onShared?.("native");
  };

  const handlePlatform = (platform: SocialPlatformId) => {
    const text =
      platform === "instagram"
        ? aiCopy?.instagram || caption
        : platform === "facebook"
          ? aiCopy?.facebook || caption
          : caption;
    const result = openPlatformShare(platform, listing, text);
    if (result === "copied") {
      void copyTextToClipboard(text);
      setCopied("caption");
      setTimeout(() => setCopied(null), 2000);
    }
    onShared?.(platform);
  };

  const primary = SOCIAL_PLATFORMS.filter((p) =>
    PRIMARY_SHARE_PLATFORMS.includes(p.id)
  );

  return (
    <div
      className={cn(
        "fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-3 sm:items-center",
        className
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-listing-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Uždaryti"
        onClick={onClose}
      />
      <div className="relative z-[1] w-full max-w-md overflow-hidden rounded-3xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] p-5 shadow-xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="share-listing-title"
              className="text-base font-semibold text-[var(--vauto-text)]"
            >
              Pasidalinkite skelbimu
            </h2>
            <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
              1–2 paspaudimai — papildoma reklama be mokamos reklamos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--vauto-text-muted)] hover:bg-black/[0.04]"
            aria-label="Uždaryti"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {nativeAvailable && (
            <button
              type="button"
              onClick={() => void handleNative()}
              className={cn("flex items-center gap-1.5 px-3 py-2.5 text-xs", BTN)}
            >
              <Share2 className="h-3.5 w-3.5" />
              Dalintis
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className={cn("flex items-center gap-1.5 px-3 py-2.5 text-xs", BTN)}
          >
            {copied === "link" ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                Nukopijuota
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Kopijuoti nuorodą
              </>
            )}
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          {primary.map((platform) => (
            <button
              key={platform.id}
              type="button"
              onClick={() => handlePlatform(platform.id)}
              className={cn("px-3 py-3 text-left text-xs font-semibold", BTN)}
            >
              {platform.label}
            </button>
          ))}
        </div>

        <div className="mb-3 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--vauto-text)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--vauto-teal)]" />
              AI postas
            </p>
            <div className="flex gap-1">
              {SHARE_TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.hint}
                  onClick={() => handleTone(opt.id)}
                  className={cn(
                    "rounded-lg px-2 py-1 text-[10px] font-medium transition",
                    tone === opt.id
                      ? "bg-[var(--vauto-teal)] text-white"
                      : "bg-black/[0.04] text-[var(--vauto-text-muted)]"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {loadingAi ? (
            <div className="flex items-center gap-2 py-3 text-xs text-[var(--vauto-text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generuojamas tekstas…
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--vauto-text-muted)]">
                {caption}
              </p>
              <button
                type="button"
                onClick={() => void handleCopyCaption()}
                className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[var(--vauto-teal)]"
              >
                {copied === "caption" ? (
                  <>
                    <Check className="h-3 w-3" /> Nukopijuota
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Kopijuoti tekstą
                  </>
                )}
              </button>
            </>
          )}
        </div>

        <StoryVisualGenerator
          listing={listing}
          caption={aiCopy?.instagram || caption}
          className="mb-4"
          onShared={() => onShared?.("instagram")}
        />

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl py-3 text-sm font-semibold text-[var(--vauto-text-muted)] hover:bg-black/[0.03]"
        >
          {skipLabel}
        </button>
      </div>
    </div>
  );
}
