"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import type { Listing } from "@/lib/types";
import {
  canUseNativeShare,
  shareListingNative,
} from "@/lib/social-share";
import { ShareListingModal } from "@/components/social/ShareListingModal";
import { cn } from "@/lib/cn";

interface ShareListingButtonProps {
  listing: Listing;
  className?: string;
  label?: string;
  variant?: "button" | "icon";
}

export function ShareListingButton({
  listing,
  className,
  label = "Dalintis",
  variant = "button",
}: ShareListingButtonProps) {
  const [open, setOpen] = useState(false);

  const quickShare = async () => {
    if (canUseNativeShare()) {
      const ok = await shareListingNative(listing);
      if (ok) return;
    }
    setOpen(true);
  };

  if (variant === "icon") {
    return (
      <>
        <button
          type="button"
          onClick={() => void quickShare()}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--vauto-surface-muted)] text-[var(--vauto-text-muted)]",
            className
          )}
          aria-label="Dalintis"
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>
        <ShareListingModal
          listing={listing}
          open={open}
          onClose={() => setOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void quickShare()}
        className={cn(
          "flex items-center justify-center gap-1 rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-3 py-2 text-xs font-medium text-[var(--vauto-text-main)] hover:bg-[var(--vauto-surface-muted)]",
          className
        )}
      >
        <Share2 className="h-3.5 w-3.5" />
        {label}
      </button>
      <ShareListingModal
        listing={listing}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
