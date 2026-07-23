import { logNegotiationAudit } from "./negotiation-audit.js";
import { evaluateNegotiationGuards } from "./negotiation-guards.js";
import {
  pickTwinTemplate,
  twinTemplateText,
  type TwinTemplateId,
} from "./twin-templates.js";
import type { NegotiationProfileType } from "../services/ai-negotiator.js";

export interface BargainTwinRules {
  minPrice: number;
  listingPrice: number;
  /** Pardavėjo išankstinis patvirtinimas autonominėms deryboms */
  sellerApproved: boolean;
  /** Įjungta per UI (Negotiation Twin toggle) */
  autoNegotiationEnabled: boolean;
  /** Aiškus sutikimas per skelbimą (ISO data arba true) */
  sellerConsent?: boolean | string;
  /** Maks. nuolaida % nuo skelbimo kainos (S5: ignored — floor only) */
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
  escalate?: boolean;
  templateId?: TwinTemplateId;
}

function hasSellerConsent(rules: BargainTwinRules): boolean {
  if (rules.sellerConsent === false) return false;
  if (rules.sellerConsent === true) return true;
  if (typeof rules.sellerConsent === "string" && rules.sellerConsent.trim()) {
    return true;
  }
  return rules.sellerApproved;
}

/** Ar AI dvyniui leidžiama autonomiškai atsakyti šablonais */
export function canAutoNegotiate(rules: BargainTwinRules): boolean {
  return (
    rules.autoNegotiationEnabled &&
    hasSellerConsent(rules) &&
    rules.sellerApproved &&
    rules.minPrice > 0 &&
    rules.listingPrice >= rules.minPrice
  );
}

/**
 * S5 MVP auto-negotiation — fixed templates only (no LLM / no counter-offers).
 */
export async function runAutoNegotiation(
  input: BargainTwinInput
): Promise<BargainTwinResult> {
  const rules: BargainTwinRules = input.rules ?? {
    minPrice: input.minPrice,
    listingPrice: input.listingPrice,
    // Fail-closed: never auto-negotiate without explicit rules from a trusted caller.
    sellerApproved: false,
    autoNegotiationEnabled: false,
  };

  const guard = evaluateNegotiationGuards(input.buyerMessage);
  if (guard.escalate) {
    const escalated: BargainTwinResult = {
      shouldReply: true,
      dealReady: false,
      autoReply: twinTemplateText("escalate_human", input.minPrice),
      sellerNotification: guard.sellerNotification ?? "",
      blockedReason: `escalated_${guard.reason}`,
      escalate: true,
      templateId: "escalate_human",
    };
    void logNegotiationAudit({
      threadId: input.threadId,
      listingId: input.listingId,
      sellerUserId: input.sellerUserId,
      buyerMessage: input.buyerMessage,
      escalated: true,
      escalateReason: guard.reason,
      ruleApplied: "negotiation_guard",
      autoReply: escalated.autoReply,
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
      escalate: false,
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

  const picked = pickTwinTemplate(
    input.buyerMessage,
    input.minPrice,
    input.sellerName
  );
  const result: BargainTwinResult = {
    shouldReply: true,
    offeredPrice: picked.offeredPrice,
    counterPrice: picked.templateId === "price_floor" ? input.minPrice : undefined,
    dealReady: picked.dealReady,
    autoReply: picked.autoReply,
    sellerNotification: picked.sellerNotification,
    escalate: picked.escalate,
    templateId: picked.templateId,
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
    escalated: Boolean(result.escalate),
    escalateReason: result.escalate ? "template_escalate_human" : undefined,
    ruleApplied: `template_${picked.templateId}`,
  });

  return result;
}

/** @deprecated naudok runAutoNegotiation — palikta suderinamumui */
export async function analyzeNegotiationTwin(
  input: Omit<BargainTwinInput, "rules"> & { rules?: BargainTwinRules }
): Promise<BargainTwinResult> {
  return runAutoNegotiation(input);
}
