"use client";

import { useCallback, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  Share2,
} from "lucide-react";
import type { Listing } from "@/lib/types";
import {
  buildListingSharePayload,
  canUseNativeShare,
  copyListingLink,
  openPlatformShare,
  PRIMARY_SHARE_PLATFORMS,
  shareCaptionForPlatform,
  shareListingNative,
  SOCIAL_PLATFORMS,
  type SocialPlatformId,
} from "@/lib/social-share";
import { ShareListingModal } from "@/components/social/ShareListingModal";
import { StoryVisualGenerator } from "@/components/social/StoryVisualGenerator";
import { cn } from "@/lib/cn";

interface ShareListingPanelProps {
  listing: Listing;
  compact?: boolean;
  className?: string;
  onShared?: (platform: SocialPlatformId | "native" | "copy") => void;
  showVautoPromo?: boolean;
  /** Use full modal with AI tones (recommended for post-publish). */
  preferModal?: boolean;
}

const NEUTRAL_SHARE_BTN =
  "border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] text-[var(--ds-text-primary)] font-medium rounded-xl hover:bg-[var(--ds-surface-muted)]";

export function ShareListingPanel({
  listing,
  compact = false,
  className,
  onShared,
  showVautoPromo = true,
  preferModal = false,
}: ShareListingPanelProps) {
  const [copied, setCopied] = useState(false);
  const [captionPlatform, setCaptionPlatform] = useState<SocialPlatformId | null>(null);
  const [modalOpen, setModalOpen] = useState(preferModal);
  const payload = buildListingSharePayload(listing);
  const nativeAvailable = canUseNativeShare();

  const primaryPlatforms = SOCIAL_PLATFORMS.filter((p) =>
    PRIMARY_SHARE_PLATFORMS.includes(p.id)
  );

  const handleCopy = useCallback(async () => {
    const ok = await copyListingLink(listing);
    if (ok) {
      setCopied(true);
      onShared?.("copy");
      setTimeout(() => setCopied(false), 2000);
    }
  }, [listing, onShared]);

  const handleNative = useCallback(async () => {
    const ok = await shareListingNative(listing);
    if (ok) onShared?.("native");
  }, [listing, onShared]);

  const handlePlatform = useCallback(
    (platform: SocialPlatformId) => {
      const result = openPlatformShare(platform, listing);
      if (result === "copied") {
        setCaptionPlatform("instagram");
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
      onShared?.(platform);
    },
    [listing, onShared]
  );

  if (preferModal) {
    return (
      <div className={cn(className)}>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={cn(
            "flex w-full items-center justify-center gap-2 px-3 py-3 text-sm",
            NEUTRAL_SHARE_BTN
          )}
        >
          <Share2 className="h-4 w-4" />
          Dalintis socialiniuose tinkluose
        </button>
        <ShareListingModal
          listing={listing}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onShared={(p) => {
            if (p === "ai-copy") onShared?.("copy");
            else onShared?.(p);
          }}
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {showVautoPromo && !compact && (
        <p className="text-xs leading-relaxed text-[var(--ds-text-muted)]">
          Pasidalykite skelbimu socialiniuose tinkluose — papildoma reklama jūsų prekei
          ar paslaugai ir didesnis VAUTO žinomumas.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {nativeAvailable && (
          <button
            type="button"
            onClick={() => void handleNative()}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs",
              NEUTRAL_SHARE_BTN
            )}
          >
            <Share2 className="h-3.5 w-3.5" />
            Dalintis
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs",
            NEUTRAL_SHARE_BTN
          )}
        >
          {copied ? (
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
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs",
            NEUTRAL_SHARE_BTN
          )}
        >
          AI tekstas
        </button>
      </div>

      <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
        {primaryPlatforms.map((platform) => (
          <button
            key={platform.id}
            type="button"
            onClick={() => handlePlatform(platform.id)}
            className={cn(
              "px-2.5 py-2.5 text-left text-[11px] transition",
              NEUTRAL_SHARE_BTN
            )}
          >
            {platform.label}
          </button>
        ))}
      </div>

      {!compact && (
        <p className="flex items-start gap-1.5 text-[10px] text-[var(--ds-text-muted)]">
          <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-all">{payload.url}</span>
        </p>
      )}

      {captionPlatform === "instagram" && (
        <p className="rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-muted)] p-2 text-[10px] text-[var(--ds-text-secondary,var(--ds-text-muted))]">
          Instagram: nuoroda nukopijuota. Įklijuokite į Stories, postą ar bio. Tekstas:{" "}
          {shareCaptionForPlatform("instagram", listing)}
        </p>
      )}

      <StoryVisualGenerator
        listing={listing}
        onShared={() => onShared?.("instagram")}
      />

      <ShareListingModal
        listing={listing}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onShared={(p) => {
          if (p === "ai-copy") onShared?.("copy");
          else onShared?.(p);
        }}
      />
    </div>
  );
}
