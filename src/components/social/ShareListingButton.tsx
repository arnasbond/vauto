"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import type { Listing } from "@/lib/types";
import {
  canUseNativeShare,
  copyListingLink,
  shareListingNative,
} from "@/lib/social-share";
import { ShareListingPanel } from "@/components/social/ShareListingPanel";
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
        {open && (
          <ShareListingModal listing={listing} onClose={() => setOpen(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void quickShare()}
        className={cn(
          "flex items-center justify-center gap-1 rounded-xl bg-[var(--vauto-teal)]/15 px-3 py-2 text-xs font-semibold text-[var(--vauto-teal)]",
          className
        )}
      >
        <Share2 className="h-3.5 w-3.5" />
        {label}
      </button>
      {open && <ShareListingModal listing={listing} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareListingModal({
  listing,
  onClose,
}: {
  listing: Listing;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/80 p-4 sm:items-center">
      <div className="vauto-auth-modal w-full max-w-md rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-white">Dalintis skelbimu</h3>
          <button type="button" onClick={onClose} className="text-slate-400 text-sm">
            Uždaryti
          </button>
        </div>
        <ShareListingPanel listing={listing} compact />
        <button
          type="button"
          onClick={async () => {
            await copyListingLink(listing);
            onClose();
          }}
          className="mt-3 w-full rounded-xl bg-white/10 py-2 text-xs text-white"
        >
          Tik kopijuoti nuorodą
        </button>
      </div>
    </div>
  );
}
