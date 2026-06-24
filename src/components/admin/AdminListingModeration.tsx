"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, CheckCircle, ExternalLink, Search, UserX } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { listingPath } from "@/lib/seo";
import { cn } from "@/lib/cn";

type ListingFilter = "all" | "active" | "banned";

export function AdminListingModeration() {
  const {
    listings,
    bannedUserIds,
    setListingBanned,
    setSellerBanned,
  } = useVauto();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListingFilter>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings
      .filter((l) => {
        if (filter === "active" && l.banned) return false;
        if (filter === "banned" && !l.banned) return false;
        if (!q) return true;
        return (
          l.title.toLowerCase().includes(q) ||
          l.location.toLowerCase().includes(q) ||
          l.sellerId.toLowerCase().includes(q) ||
          (l.category ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.banned !== b.banned) return a.banned ? -1 : 1;
        return a.title.localeCompare(b.title, "lt");
      });
  }, [listings, query, filter]);

  const counts = useMemo(
    () => ({
      all: listings.length,
      active: listings.filter((l) => !l.banned).length,
      banned: listings.filter((l) => l.banned).length,
    }),
    [listings]
  );

  return (
    <div className="px-4 pb-8">
      <p className="mb-4 text-xs text-slate-400">
        Peržiūrėkite ir moderuokite skelbimus tiesiogiai — blokuokite ar atblokuokite
        skelbimą arba pardavėją.
      </p>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ieškoti pagal pavadinimą, miestą, pardavėją…"
          className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
        />
      </div>

      <div className="mb-4 flex gap-2">
        {(
          [
            { id: "all" as const, label: "Visi" },
            { id: "active" as const, label: "Aktyvūs" },
            { id: "banned" as const, label: "Blokuoti" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              filter === item.id
                ? "bg-[var(--vauto-teal)] text-white"
                : "bg-white/10 text-slate-300"
            )}
          >
            {item.label} ({counts[item.id]})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="vauto-dashboard-card rounded-2xl py-10 text-center text-sm text-slate-500">
            Skelbimų nerasta.
          </p>
        ) : (
          rows.map((listing) => {
            const sellerBanned = bannedUserIds.has(listing.sellerId);
            return (
              <div
                key={listing.id}
                className={cn(
                  "vauto-dashboard-card rounded-2xl p-3",
                  listing.banned && "ring-1 ring-red-400/30"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {listing.banned && (
                        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-300">
                          Blokuotas
                        </span>
                      )}
                      {sellerBanned && (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                          Pardavėjas blokuotas
                        </span>
                      )}
                      <span className="text-[10px] uppercase text-slate-500">
                        {listing.category ?? "—"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-white">{listing.title}</p>
                    <p className="text-xs text-slate-400">
                      {listing.location} · {listing.priceLabel ?? `${listing.price} €`}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      Pardavėjas: {listing.sellerId}
                    </p>
                  </div>
                  <Link
                    href={listingPath(listing)}
                    className="shrink-0 rounded-lg bg-white/10 p-2 text-slate-300"
                    aria-label="Atidaryti skelbimą"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setListingBanned(listing.id, !listing.banned)}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium",
                      listing.banned
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-red-500/15 text-red-300"
                    )}
                  >
                    {listing.banned ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" />
                        Atblokuoti skelbimą
                      </>
                    ) : (
                      <>
                        <Ban className="h-3.5 w-3.5" />
                        Blokuoti skelbimą
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSellerBanned(listing.sellerId, !sellerBanned)}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium",
                      sellerBanned
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-amber-500/15 text-amber-300"
                    )}
                  >
                    {sellerBanned ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" />
                        Atblokuoti pardavėją
                      </>
                    ) : (
                      <>
                        <UserX className="h-3.5 w-3.5" />
                        Blokuoti pardavėją
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
