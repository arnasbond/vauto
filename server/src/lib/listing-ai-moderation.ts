import { chatJson, hasAiKey } from "../ai/llm-provider.js";
import { adminPatchListing } from "../repository.js";
import type { ApiListing } from "../types.js";
import { readConductorLineage } from "./conductor-publish.js";
import { moderateListingInput } from "./listing-moderation.js";
import { logProductionWarn } from "./production-log.js";

export type ListingModerationAction = "allow" | "review" | "reject";

export interface ListingAiModerationResult {
  action: ListingModerationAction;
  reason?: string;
  aiPowered: boolean;
}

function analyzeListingWithRules(listing: ApiListing): ListingAiModerationResult {
  const mod = moderateListingInput({
    title: listing.title,
    description: listing.description,
    location: listing.location,
  });
  if (!mod.allowed) {
    return { action: "reject", reason: mod.reason, aiPowered: false };
  }
  return { action: "allow", aiPowered: false };
}

async function analyzeListingWithAi(
  listing: ApiListing
): Promise<ListingAiModerationResult> {
  const lineage = readConductorLineage(listing.attributes);
  const raw = await chatJson([
    {
      role: "user",
      content: `Moderuok lietuvišką skelbimą. Grąžink JSON:
{"action":"allow"|"review"|"reject","reason":"string","confidence":0-100}

allow — švarus skelbimas.
review — įtartina kaina/aprašymas/AI šaltiniai, bet ne akivaizdus pažeidimas.
reject — ginklai, narkotikai, sukčiavimas, nelegalūs daiktai, akivaizdus spamas.

Skelbimas:
title: ${listing.title}
category: ${listing.category}
price: ${listing.price}
location: ${listing.location}
description: ${(listing.description ?? "").slice(0, 800)}
conductorSources: ${lineage.sources.join(",") || "none"}`,
    },
  ]);

  const actionRaw = typeof raw.action === "string" ? raw.action : "review";
  const action: ListingModerationAction =
    actionRaw === "reject" || actionRaw === "allow" || actionRaw === "review"
      ? actionRaw
      : "review";
  const confidence =
    typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
      ? raw.confidence
      : 50;
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : undefined;

  if (action === "reject" && confidence >= 55) {
    return { action: "reject", reason, aiPowered: true };
  }
  if (action === "review" || confidence < 70) {
    return { action: "review", reason, aiPowered: true };
  }
  return { action: "allow", reason, aiPowered: true };
}

export async function runListingAiModeration(
  listing: ApiListing
): Promise<ListingAiModerationResult> {
  const rules = analyzeListingWithRules(listing);
  if (rules.action === "reject") return rules;
  if (!hasAiKey()) {
    return listing.requiresReview
      ? { action: "review", aiPowered: false }
      : rules;
  }
  try {
    return await analyzeListingWithAi(listing);
  } catch (e) {
    logProductionWarn("listing_ai_moderation", "AI moderation failed", {
      listingId: listing.id,
      error: String(e),
    });
    return listing.requiresReview
      ? { action: "review", aiPowered: false }
      : rules;
  }
}

/** Phase 2 — async post-publish moderation (never blocks HTTP response). */
export function scheduleListingAiModeration(listing: ApiListing): void {
  void (async () => {
    const result = await runListingAiModeration(listing);
    if (result.action === "reject") {
      await adminPatchListing(listing.id, {
        banned: true,
        requiresReview: false,
      });
    } else if (result.action === "review" && !listing.requiresReview) {
      await adminPatchListing(listing.id, { requiresReview: true });
    }
    logProductionWarn("listing_ai_moderation", result.action, {
      listingId: listing.id,
      sellerId: listing.sellerId,
      aiPowered: result.aiPowered,
      reason: result.reason,
    });
  })().catch((e) => {
    logProductionWarn("listing_ai_moderation", "schedule failed", {
      listingId: listing.id,
      error: String(e),
    });
  });
}
