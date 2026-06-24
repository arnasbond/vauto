"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiMemory } from "@/context/ZeroUiMemoryContext";
import {
  buildFleetMatchMessage,
  findNewFleetMatches,
} from "@/lib/fleet-listing-match";
import { listingPath } from "@/lib/seo";
import type { Listing } from "@/lib/types";

export function FleetMatchBuddyHost() {
  const { listings } = useVauto();
  const { primaryVehicle, defaultRegion } = useZeroUiMemory();
  const router = useRouter();
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const [offer, setOffer] = useState<Listing | null>(null);

  useEffect(() => {
    if (!listings.length) return;

    if (!seededRef.current) {
      listings.forEach((l) => seenIdsRef.current.add(l.id));
      seededRef.current = true;
      return;
    }

    const matches = findNewFleetMatches(
      listings,
      seenIdsRef.current,
      primaryVehicle,
      defaultRegion
    );
    listings.forEach((l) => seenIdsRef.current.add(l.id));

    if (matches.length > 0 && !offer) {
      setOffer(matches[0]!);
    }
  }, [listings, primaryVehicle, defaultRegion, offer]);

  if (!offer) return null;

  const message = buildFleetMatchMessage(offer, primaryVehicle, defaultRegion);

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[280] flex justify-end px-4">
      <div
        className="pointer-events-auto max-w-sm animate-[buddyPulse_2.4s_ease-in-out_infinite] rounded-2xl bg-gradient-to-br from-[var(--vauto-teal)]/95 to-[var(--flux-indigo)]/95 p-[1px] shadow-lg shadow-[var(--vauto-teal)]/25"
        role="status"
        aria-live="polite"
      >
        <div className="rounded-[15px] bg-slate-950/90 px-4 py-3 text-sm text-white backdrop-blur-sm">
          <div className="mb-2 flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vauto-orange)]" />
            <p className="flex-1 leading-snug">{message}</p>
            <button
              type="button"
              onClick={() => setOffer(null)}
              className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
              aria-label="Uždaryti"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2 pl-6">
            <button
              type="button"
              onClick={() => {
                router.push(listingPath(offer));
                setOffer(null);
              }}
              className="rounded-lg bg-[var(--vauto-teal)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              Atverti skelbimą
            </button>
            <button
              type="button"
              onClick={() => setOffer(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-white/70 hover:text-white"
            >
              Ne dabar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
