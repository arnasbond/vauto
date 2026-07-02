import { unifiedLlmJson } from "./llm-provider.js";
import { logProductionError } from "../lib/production-log.js";
import {
  buildNegotiationSystemPrompt,
  type NegotiationProfileType,
} from "../services/ai-negotiator.js";
import { logNegotiationAudit } from "./negotiation-audit.js";
import {
  applyMaxDiscountRule,
  evaluateNegotiationGuards,
} from "./negotiation-guards.js";

export interface BargainTwinRules {
  minPrice: number;
  listingPrice: number;
  /** Pardavėjo išankstinis patvirtinimas autonominėms deryboms */
  sellerApproved: boolean;
  /** Įjungta per UI (Negotiation Twin toggle) */
  autoNegotiationEnabled: boolean;
  /** Aiškus sutikimas per skelbimą (ISO data arba true) */
  sellerConsent?: boolean | string;
  /** Maks. nuolaida % nuo skelbimo kainos */
  maxDiscountPercent?: number;
}

export interface BargainTwinInput {
  buyerMessage: string;
  listingPrice: number;
  minPrice: number;
  listingTitle: string;
  sellerName: string;
  profileType?: NegotiationProfileType;
  rules?: BargainTwinRules;
  threadId?: string;
  listingId?: string;
  sellerUserId?: string;
}

export interface BargainTwinResult {
  shouldReply: boolean;
  offeredPrice?: number;
  counterPrice?: number;
  dealReady: boolean;
  autoReply: string;
  sellerNotification: string;
  blockedReason?: string;
}

function extractOfferedPrice(text: string): number | undefined {
  const normalized = text.replace(/\s/g, " ");
  const eurMatch = normalized.match(/(\d[\d\s.,]*)\s*(?:€|eur|euro)/i);
  if (eurMatch) {
    const n = Number(eurMatch[1]!.replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const bare = normalized.match(/\b(?:siūlau|siulau|duodu|moku|galiu)\s*(\d[\d\s.,]*)/i);
  if (bare) {
    const n = Number(bare[1]!.replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function counterPrice(listingPrice: number, minPrice: number, offered: number): number {
  if (offered >= minPrice) return offered;
  const mid = Math.round((minPrice + listingPrice) / 2);
  return Math.max(minPrice, Math.min(listingPrice - 1, mid));
}

function hasSellerConsent(rules: BargainTwinRules): boolean {
  if (rules.sellerConsent === false) return false;
  if (rules.sellerConsent === true) return true;
  if (typeof rules.sellerConsent === "string" && rules.sellerConsent.trim()) {
    return true;
  }
  return rules.sellerApproved;
}

/** Ar AI dvyniui leidžiama autonomiškai derėtis */
export function canAutoNegotiate(rules: BargainTwinRules): boolean {
  return (
    rules.autoNegotiationEnabled &&
    hasSellerConsent(rules) &&
    rules.sellerApproved &&
    rules.minPrice > 0 &&
    rules.listingPrice >= rules.minPrice
  );
}

function localBargainTwin(input: BargainTwinInput): BargainTwinResult {
  const sellerFirst = input.sellerName.trim().split(/\s+/)[0] || "Pardavėja";
  const offered = extractOfferedPrice(input.buyerMessage);
  const min = Math.max(1, input.minPrice);
  const list = Math.max(min, input.listingPrice);

  if (!offered) {
    return {
      shouldReply: false,
      dealReady: false,
      autoReply: "",
      sellerNotification: "",
    };
  }

  if (offered >= min) {
    return {
      shouldReply: true,
      offeredPrice: offered,
      counterPrice: offered,
      dealReady: true,
      autoReply: `Puiku! ${sellerFirst} sutinka su ${offered} € — galime tęsti saugų pirkimą per VAUTO escrow. Ar patvirtinate?`,
      sellerNotification: `${sellerFirst}, AI Dvynys užbaigė derybas — pirkėja sutinka ${offered} €.`,
    };
  }

  const counter = counterPrice(list, min, offered);
  return {
    shouldReply: true,
    offeredPrice: offered,
    counterPrice: counter,
    dealReady: false,
    autoReply: `Ačiū už pasiūlymą ${offered} €. ${sellerFirst} gali sutikti su ${counter} € — tai artima jos minimaliai kainai. Ar tinka?`,
    sellerNotification: `${sellerFirst}, AI Dvynys pasiūlė ${counter} € (min ${min} €, pirkėja siūlė ${offered} €).`,
  };
}

/**
 * Auto-negotiation — veikia tik su pardavėjo patvirtinimu arba aiškiai nustatytomis taisyklėmis.
 */
export async function runAutoNegotiation(
  input: BargainTwinInput
): Promise<BargainTwinResult> {
  const rules: BargainTwinRules = input.rules ?? {
    minPrice: input.minPrice,
    listingPrice: input.listingPrice,
    sellerApproved: true,
    autoNegotiationEnabled: true,
  };

  const guard = evaluateNegotiationGuards(input.buyerMessage);
  if (guard.escalate) {
    const escalated: BargainTwinResult = {
      shouldReply: false,
      dealReady: false,
      autoReply: "",
      sellerNotification: guard.sellerNotification ?? "",
      blockedReason: `escalated_${guard.reason}`,
    };
    void logNegotiationAudit({
      threadId: input.threadId,
      listingId: input.listingId,
      sellerUserId: input.sellerUserId,
      buyerMessage: input.buyerMessage,
      escalated: true,
      escalateReason: guard.reason,
      ruleApplied: "negotiation_guard",
    });
    return escalated;
  }

  if (!canAutoNegotiate(rules)) {
    const blocked: BargainTwinResult = {
      shouldReply: false,
      dealReady: false,
      autoReply: "",
      sellerNotification: "",
      blockedReason: !rules.autoNegotiationEnabled
        ? "auto_negotiation_disabled"
        : !hasSellerConsent(rules)
          ? "seller_consent_missing"
          : !rules.sellerApproved
            ? "seller_not_approved"
            : "invalid_price_range",
    };
    void logNegotiationAudit({
      threadId: input.threadId,
      listingId: input.listingId,
      sellerUserId: input.sellerUserId,
      buyerMessage: input.buyerMessage,
      escalated: false,
      ruleApplied: blocked.blockedReason,
    });
    return blocked;
  }

  const offered = extractOfferedPrice(input.buyerMessage);
  const discountRule = applyMaxDiscountRule({
    listingPrice: input.listingPrice,
    minPrice: input.minPrice,
    offeredPrice: offered,
    maxDiscountPercent: rules.maxDiscountPercent,
  });
  const effectiveMin = discountRule.floorPrice;

  const local = localBargainTwin({
    ...input,
    minPrice: effectiveMin,
  });
  if (!local.shouldReply) return local;

  if (offered && !discountRule.allowed) {
    const blocked: BargainTwinResult = {
      shouldReply: true,
      offeredPrice: offered,
      counterPrice: discountRule.floorPrice,
      dealReady: false,
      autoReply: `Ačiū už pasiūlymą. Minimali galima kaina šiam skelbimui yra ${discountRule.floorPrice} €.`,
      sellerNotification: `AI Dvynys atmetė per žemą pasiūlymą (${offered} €) — grindis ${discountRule.floorPrice} €.`,
      blockedReason: "max_discount_exceeded",
    };
    void logNegotiationAudit({
      threadId: input.threadId,
      listingId: input.listingId,
      sellerUserId: input.sellerUserId,
      buyerMessage: input.buyerMessage,
      autoReply: blocked.autoReply,
      offeredPrice: offered,
      counterPrice: discountRule.floorPrice,
      ruleApplied: "max_discount",
    });
    return blocked;
  }

  try {
    const raw = await unifiedLlmJson({
      systemInstruction: buildNegotiationSystemPrompt(input.profileType),
      prompt: `Pardavėja: ${input.sellerName}
Skelbimas: ${input.listingTitle}
Kaina: ${input.listingPrice} €, minimumas: ${effectiveMin} €
Profilio tipas: ${input.profileType ?? "nežinomas"}
Pirkėjo žinutė: "${input.buyerMessage}"`,
    });

    const result: BargainTwinResult = {
      shouldReply: Boolean(raw.shouldReply ?? true),
      offeredPrice: Number(raw.offeredPrice) || local.offeredPrice,
      counterPrice:
        raw.counterPrice != null ? Number(raw.counterPrice) : local.counterPrice,
      dealReady: Boolean(raw.dealReady ?? local.dealReady),
      autoReply: String(raw.autoReply ?? local.autoReply).trim() || local.autoReply,
      sellerNotification:
        String(raw.sellerNotification ?? local.sellerNotification).trim() ||
        local.sellerNotification,
    };
    void logNegotiationAudit({
      threadId: input.threadId,
      listingId: input.listingId,
      sellerUserId: input.sellerUserId,
      buyerMessage: input.buyerMessage,
      autoReply: result.autoReply,
      offeredPrice: result.offeredPrice,
      counterPrice: result.counterPrice,
      dealReady: result.dealReady,
      ruleApplied: "llm_negotiation",
    });
    return result;
  } catch (err) {
    logProductionError("negotiation-twin", err, {
      listingTitle: input.listingTitle,
      profileType: input.profileType,
    });
    void logNegotiationAudit({
      threadId: input.threadId,
      listingId: input.listingId,
      sellerUserId: input.sellerUserId,
      buyerMessage: input.buyerMessage,
      autoReply: local.autoReply,
      offeredPrice: local.offeredPrice,
      counterPrice: local.counterPrice,
      dealReady: local.dealReady,
      ruleApplied: "local_fallback",
    });
    return local;
  }
}

/** @deprecated naudok runAutoNegotiation — palikta suderinamumui */
export async function analyzeNegotiationTwin(
  input: Omit<BargainTwinInput, "rules"> & { rules?: BargainTwinRules }
): Promise<BargainTwinResult> {
  return runAutoNegotiation(input);
}
