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
            "flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300",
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
          "flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50",
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
