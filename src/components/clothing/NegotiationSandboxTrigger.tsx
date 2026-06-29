"use client";

import { useMemo, useState } from "react";
import { Bot } from "lucide-react";
import { NegotiationSandboxModal } from "@/components/clothing/NegotiationSandboxModal";
import type { Listing } from "@/lib/types";

interface NegotiationSandboxTriggerProps {
  listings: Listing[];
  sellerName: string;
  className?: string;
}

export function NegotiationSandboxTrigger({
  listings,
  sellerName,
  className,
}: NegotiationSandboxTriggerProps) {
  const [open, setOpen] = useState(false);
  const listing = useMemo(
    () =>
      listings.find(
        (l) => l.category === "clothing" && l.status !== "sold" && l.price > 0
      ) ?? null,
    [listings]
  );

  if (!listing) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-fuchsia-500/40 bg-gradient-to-r from-fuchsia-950/60 to-[#131c38] py-3.5 text-sm font-semibold text-fuchsia-100 shadow-md transition hover:border-fuchsia-400/60 hover:brightness-110"
        }
      >
        <Bot className="h-4 w-4" />
        Išbandyti derybų AI
      </button>

      <NegotiationSandboxModal
        open={open}
        onClose={() => setOpen(false)}
        listing={listing}
        sellerName={sellerName}
      />
    </>
  );
}
