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
  shareCaptionForPlatform,
  shareListingNative,
  SOCIAL_PLATFORMS,
  type SocialPlatformId,
} from "@/lib/social-share";
import { cn } from "@/lib/cn";

interface ShareListingPanelProps {
  listing: Listing;
  compact?: boolean;
  className?: string;
  onShared?: (platform: SocialPlatformId | "native" | "copy") => void;
  showVautoPromo?: boolean;
}

const PLATFORM_COLORS: Record<SocialPlatformId, string> = {
  facebook: "bg-[#1877f2]/20 text-[#6eb0ff] border-[#1877f2]/30",
  instagram: "bg-[#e1306c]/15 text-[#f472b6] border-[#e1306c]/25",
  linkedin: "bg-[#0a66c2]/20 text-[#60a5fa] border-[#0a66c2]/30",
  whatsapp: "bg-[#25d366]/15 text-[#4ade80] border-[#25d366]/25",
  telegram: "bg-[#229ed9]/15 text-[#38bdf8] border-[#229ed9]/25",
  viber: "bg-[#7360f2]/15 text-[#a78bfa] border-[#7360f2]/25",
};

export function ShareListingPanel({
  listing,
  compact = false,
  className,
  onShared,
  showVautoPromo = true,
}: ShareListingPanelProps) {
  const [copied, setCopied] = useState(false);
  const [captionPlatform, setCaptionPlatform] = useState<SocialPlatformId | null>(null);
  const payload = buildListingSharePayload(listing);
  const nativeAvailable = canUseNativeShare();

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

  return (
    <div className={cn("space-y-3", className)}>
      {showVautoPromo && !compact && (
        <p className="text-xs leading-relaxed text-slate-400">
          Pasidalykite skelbimu socialiniuose tinkluose — papildoma reklama jūsų prekei
          ar paslaugai ir didesnis Vauto žinomumas.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {nativeAvailable && (
          <button
            type="button"
            onClick={() => void handleNative()}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--vauto-teal)]/40 bg-[var(--vauto-teal)]/10 px-3 py-2 text-xs font-semibold text-[var(--vauto-teal)]"
          >
            <Share2 className="h-3.5 w-3.5" />
            Dalintis
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
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

      <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
        {SOCIAL_PLATFORMS.map((platform) => (
          <button
            key={platform.id}
            type="button"
            onClick={() => handlePlatform(platform.id)}
            className={cn(
              "rounded-xl border px-2.5 py-2 text-left text-[11px] font-semibold transition hover:brightness-110",
              PLATFORM_COLORS[platform.id]
            )}
          >
            {platform.label}
          </button>
        ))}
      </div>

      {!compact && (
        <p className="flex items-start gap-1.5 text-[10px] text-slate-500">
          <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-all">{payload.url}</span>
        </p>
      )}

      {captionPlatform === "instagram" && (
        <p className="rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">
          Instagram: nuoroda nukopijuota. Įklijuokite į Stories, postą ar bio. Tekstas:{" "}
          {shareCaptionForPlatform("instagram", listing)}
        </p>
      )}
    </div>
  );
}
