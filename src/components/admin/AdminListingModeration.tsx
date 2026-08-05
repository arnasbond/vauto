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
import { Badge, Button, Card } from "@/design-system";
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

/** UI-only risk from existing listing flags (no new scoring API). */
function resolveListingRisk(
  listing: Listing
): { label: string; tone: "risk-low" | "risk-medium" | "risk-high" } {
  if (listing.banned || listing.requiresReview) {
    if (listing.banned) return { label: "Risk High", tone: "risk-high" };
    const score = listing.appraisalScore;
    if (typeof score === "number" && score < 40) {
      return { label: "Risk High", tone: "risk-high" };
    }
    if (typeof score === "number" && score < 70) {
      return { label: "Risk Medium", tone: "risk-medium" };
    }
    return { label: "Risk Medium", tone: "risk-medium" };
  }
  if (listing.isVerified || listing.vinVerified) {
    return { label: "Risk Low", tone: "risk-low" };
  }
  return { label: "Risk Low", tone: "risk-low" };
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

  const markAiReview = (listing: Listing) => {
    setOpen(true);
    void sendAgentMessage(
      `Pažymėk skelbimą „${listing.title}“ (${listing.id}) AI patikrai: requiresReview, conductor šaltiniai, rizikos požymiai.`
    );
  };

  return (
    <div className="px-4 pb-8 pt-4" data-cc-mission-8="listings">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--ds-text-muted)]">
          Peržiūrėkite AI-assisted skelbimus, patvirtinkite arba blokuokite.
          Eilėje laukiantys skelbimai nerodomi viešame kataloge.
        </p>
        <Button
          variant="ai"
          size="sm"
          leftIcon={<Sparkles className="h-3.5 w-3.5" />}
          onClick={() => {
            setOpen(true);
            void sendAgentMessage(
              "Peržiūrėk skelbimus, kuriems reikia moderacijos (requiresReview), ir blokuok įtartinus. Naudok blockListing įrankį su listingId ir priežastimi."
            );
          }}
        >
          AI moderacija
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ieškoti pagal pavadinimą, miestą, pardavėją…"
          className="w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] py-2.5 pl-9 pr-3 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
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
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={filter === item.id ? "primary" : "secondary"}
            onClick={() => setFilter(item.id)}
          >
            {item.label} ({counts[item.id]})
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <Card variant="muted" className="py-10 text-center text-sm text-[var(--ds-text-muted)]">
            {filter === "review"
              ? "Nėra skelbimų laukiančių peržiūros."
              : "Skelbimų nerasta."}
          </Card>
        ) : (
          rows.map((listing) => {
            const sellerBanned = bannedUserIds.has(listing.sellerId);
            const conductorSources = formatConductorSources(listing);
            const pendingReview = Boolean(
              listing.requiresReview && !listing.banned
            );
            const risk = resolveListingRisk(listing);
            return (
              <Card
                key={listing.id}
                variant={
                  listing.banned
                    ? "danger"
                    : pendingReview
                      ? "warning"
                      : "default"
                }
                className={cn(pendingReview && "ring-1 ring-[var(--ds-warning)]/30")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={risk.tone}>{risk.label}</Badge>
                      {pendingReview ? (
                        <Badge tone="warning">Laukia peržiūros</Badge>
                      ) : null}
                      {listing.banned ? (
                        <Badge tone="danger">Blokuotas</Badge>
                      ) : null}
                      {sellerBanned ? (
                        <Badge tone="warning">Pardavėjas blokuotas</Badge>
                      ) : null}
                      <Badge tone="category">
                        {listing.category ?? "—"}
                      </Badge>
                      {conductorSources ? (
                        <Badge tone="ai">AI: {conductorSources}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[var(--ds-text-primary)]">
                      {listing.title}
                    </p>
                    <p className="text-xs text-[var(--ds-text-muted)]">
                      {listing.location} ·{" "}
                      {listing.priceLabel ?? `${listing.price} €`}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--ds-text-muted)]">
                      Pardavėjas: {listing.sellerId}
                    </p>
                  </div>
                  <Link
                    href={listingPath(listing)}
                    className="shrink-0 rounded-[var(--ds-radius-control)] bg-[var(--ds-surface-muted)] p-2 text-[var(--ds-text-secondary)]"
                    aria-label="Atidaryti skelbimą"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {pendingReview ? (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        leftIcon={<ClipboardCheck className="h-3.5 w-3.5" />}
                        onClick={() =>
                          resolveListingReview(listing.id, "approve")
                        }
                        className="bg-[var(--ds-success)] hover:brightness-95"
                      >
                        Patvirtinti
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        leftIcon={<Ban className="h-3.5 w-3.5" />}
                        onClick={() =>
                          resolveListingReview(listing.id, "reject")
                        }
                      >
                        Atmesti
                      </Button>
                      <Button
                        size="sm"
                        variant="ai"
                        leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                        onClick={() => markAiReview(listing)}
                      >
                        Pažymėti AI patikrai
                      </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant={listing.banned ? "secondary" : "tertiary"}
                    leftIcon={
                      listing.banned ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : (
                        <Ban className="h-3.5 w-3.5" />
                      )
                    }
                    onClick={() =>
                      setListingBanned(listing.id, !listing.banned)
                    }
                  >
                    {listing.banned
                      ? "Atblokuoti skelbimą"
                      : "Blokuoti skelbimą"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={
                      sellerBanned ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : (
                        <UserX className="h-3.5 w-3.5" />
                      )
                    }
                    onClick={() =>
                      setSellerBanned(listing.sellerId, !sellerBanned)
                    }
                  >
                    {sellerBanned
                      ? "Atblokuoti pardavėją"
                      : "Blokuoti pardavėją"}
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
