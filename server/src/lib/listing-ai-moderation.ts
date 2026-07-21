import { chatJson, hasAiKey } from "../ai/llm-provider.js";
import { runVisionAntiFraudGuard } from "../ai/vision-anti-fraud.js";
import {
  notifySellerListingRejected,
} from "../push/listing-moderation-notify.js";
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

function mergeModerationResults(
  primary: ListingAiModerationResult,
  secondary: ListingAiModerationResult | null
): ListingAiModerationResult {
  if (!secondary) return primary;
  if (primary.action === "reject" || secondary.action === "reject") {
    return primary.action === "reject" ? primary : secondary;
  }
  if (primary.action === "review" || secondary.action === "review") {
    return primary.action === "review" ? primary : secondary;
  }
  return primary;
}

async function analyzeListingVision(
  listing: ApiListing
): Promise<ListingAiModerationResult | null> {
  const images = listing.image?.trim() ? [listing.image.trim()] : [];
  if (!images.length) return null;
  const vision = await runVisionAntiFraudGuard(images, {
    title: listing.title,
    category: listing.category,
  });
  if (vision.riskScore >= 80) {
    return {
      action: "reject",
      reason: vision.userNotice || "Nuotrauka neatitinka platformos reikalavimų",
      aiPowered: true,
    };
  }
  if (vision.requiresReview) {
    return {
      action: "review",
      reason: vision.userNotice || "Nuotrauka reikalauja papildomos peržiūros",
      aiPowered: true,
    };
  }
  return null;
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

  let visionResult: ListingAiModerationResult | null = null;
  if (hasAiKey()) {
    try {
      visionResult = await analyzeListingVision(listing);
      if (visionResult?.action === "reject") return visionResult;
    } catch (e) {
      logProductionWarn("listing_ai_moderation", "vision check failed", {
        listingId: listing.id,
        error: String(e),
      });
    }
  }

  if (!hasAiKey()) {
    return mergeModerationResults(
      listing.requiresReview ? { action: "review", aiPowered: false } : rules,
      visionResult
    );
  }
  try {
    const textResult = await analyzeListingWithAi(listing);
    return mergeModerationResults(textResult, visionResult);
  } catch (e) {
    logProductionWarn("listing_ai_moderation", "AI moderation failed", {
      listingId: listing.id,
      error: String(e),
    });
    return mergeModerationResults(
      listing.requiresReview ? { action: "review", aiPowered: false } : rules,
      visionResult
    );
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
      void notifySellerListingRejected(listing, result.reason);
    } else if (result.action === "review" && !listing.requiresReview) {
      // Do not soft-hide live publishes from the public feed.
      // Reject path still bans; admins can flag requiresReview manually.
      logProductionWarn("listing_ai_moderation", "review_noted_live", {
        listingId: listing.id,
        sellerId: listing.sellerId,
        reason: result.reason,
      });
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
