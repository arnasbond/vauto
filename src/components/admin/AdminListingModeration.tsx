"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  CheckCircle,
  ClipboardCheck,
  ExternalLink,
  Search,
  Sparkles,
  UserX,
} from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { listingPath } from "@/lib/seo";
import { cn } from "@/lib/cn";
import { CONDUCTOR_SOURCES_ATTR } from "@/lib/vauto-conductor";
import type { Listing } from "@/lib/types";

type ListingFilter = "all" | "review" | "active" | "banned";

function formatConductorSources(listing: Listing): string | null {
  const raw = listing.attributes?.[CONDUCTOR_SOURCES_ATTR];
  if (typeof raw === "string" && raw.trim()) return raw;
  return null;
}

export function AdminListingModeration() {
  const {
    listings,
    bannedUserIds,
    setListingBanned,
    resolveListingReview,
    setSellerBanned,
  } = useVauto();
  const { setOpen, sendAgentMessage } = useVautoAgent();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListingFilter>("review");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings
      .filter((l) => {
        if (filter === "review" && (!l.requiresReview || l.banned)) return false;
        if (filter === "active" && (l.banned || l.requiresReview)) return false;
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
        if (filter === "review") {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        if (a.banned !== b.banned) return a.banned ? -1 : 1;
        return a.title.localeCompare(b.title, "lt");
      });
  }, [listings, query, filter]);

  const counts = useMemo(
    () => ({
      all: listings.length,
      review: listings.filter((l) => l.requiresReview && !l.banned).length,
      active: listings.filter((l) => !l.banned && !l.requiresReview).length,
      banned: listings.filter((l) => l.banned).length,
    }),
    [listings]
  );

  return (
    <div className="px-4 pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          Peržiūrėkite AI-assisted skelbimus, patvirtinkite arba blokuokite.
          Eilėje laukiantys skelbimai nerodomi viešame kataloge.
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            void sendAgentMessage(
              "Peržiūrėk skelbimus, kuriems reikia moderacijos (requiresReview), ir blokuok įtartinus. Naudok blockListing įrankį su listingId ir priežastimi."
            );
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#1167b1] px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI moderacija
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ieškoti pagal pavadinimą, miestą, pardavėją…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-600"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { id: "review" as const, label: "Peržiūra" },
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
                ? item.id === "review" && counts.review > 0
                  ? "bg-amber-500 text-white"
                  : "bg-[var(--vauto-teal)] text-white"
                : "bg-slate-100 text-slate-600"
            )}
          >
            {item.label} ({counts[item.id]})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="vauto-dashboard-card rounded-2xl py-10 text-center text-sm text-slate-500">
            {filter === "review"
              ? "Nėra skelbimų laukiančių peržiūros."
              : "Skelbimų nerasta."}
          </p>
        ) : (
          rows.map((listing) => {
            const sellerBanned = bannedUserIds.has(listing.sellerId);
            const conductorSources = formatConductorSources(listing);
            const pendingReview = Boolean(listing.requiresReview && !listing.banned);
            return (
              <div
                key={listing.id}
                className={cn(
                  "vauto-dashboard-card rounded-2xl p-3",
                  listing.banned && "ring-1 ring-red-400/30",
                  pendingReview && "ring-1 ring-amber-400/40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {pendingReview && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                          Laukia peržiūros
                        </span>
                      )}
                      {listing.banned && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-800">
                          Blokuotas
                        </span>
                      )}
                      {sellerBanned && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                          Pardavėjas blokuotas
                        </span>
                      )}
                      <span className="text-[10px] uppercase text-slate-500">
                        {listing.category ?? "—"}
                      </span>
                      {conductorSources && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                          AI: {conductorSources}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{listing.title}</p>
                    <p className="text-xs text-slate-400">
                      {listing.location} · {listing.priceLabel ?? `${listing.price} €`}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      Pardavėjas: {listing.sellerId}
                    </p>
                  </div>
                  <Link
                    href={listingPath(listing)}
                    className="shrink-0 rounded-lg bg-slate-100 p-2 text-slate-600"
                    aria-label="Atidaryti skelbimą"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {pendingReview && (
                    <>
                      <button
                        type="button"
                        onClick={() => resolveListingReview(listing.id, "approve")}
                        className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Patvirtinti
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveListingReview(listing.id, "reject")}
                        className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Atmesti
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setListingBanned(listing.id, !listing.banned)}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium",
                      listing.banned
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-red-50 text-red-700"
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
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-amber-50 text-amber-800"
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
