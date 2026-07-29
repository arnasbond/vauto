"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import type { Listing } from "@/lib/types";
import { ShareListingModal } from "@/components/social/ShareListingModal";
import { cn } from "@/lib/cn";

interface ShareSpintaButtonProps {
  listing: Listing;
  className?: string;
}

/** Legacy entry — opens the unified Share Modal (AI + platforms). */
export function ShareSpintaButton({ listing, className }: ShareSpintaButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-teal)] py-3 text-sm font-bold text-white transition hover:brightness-110"
      >
        <Share2 className="h-4 w-4" />
        AI dalijimosi tekstas
      </button>
      <ShareListingModal
        listing={listing}
        open={open}
        onClose={() => setOpen(false)}
        skipLabel="Uždaryti"
      />
    </div>
  );
}
