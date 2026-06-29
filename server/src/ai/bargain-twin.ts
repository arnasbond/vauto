import { unifiedLlmJson } from "./llm-provider.js";
import { logProductionError } from "../lib/production-log.js";
import {
  buildNegotiationSystemPrompt,
  type NegotiationProfileType,
} from "../services/ai-negotiator.js";

export interface BargainTwinRules {
  minPrice: number;
  listingPrice: number;
  /** Pardavėjo išankstinis patvirtinimas autonominėms deryboms */
  sellerApproved: boolean;
  /** Įjungta per UI (Negotiation Twin toggle) */
  autoNegotiationEnabled: boolean;
}

export interface BargainTwinInput {
  buyerMessage: string;
  listingPrice: number;
  minPrice: number;
  listingTitle: string;
  sellerName: string;
  profileType?: NegotiationProfileType;
  rules?: BargainTwinRules;
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

/** Ar AI dvyniui leidžiama autonomiškai derėtis */
export function canAutoNegotiate(rules: BargainTwinRules): boolean {
  return (
    rules.autoNegotiationEnabled &&
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

  if (!canAutoNegotiate(rules)) {
    return {
      shouldReply: false,
      dealReady: false,
      autoReply: "",
      sellerNotification: "",
      blockedReason: !rules.autoNegotiationEnabled
        ? "auto_negotiation_disabled"
        : !rules.sellerApproved
          ? "seller_not_approved"
          : "invalid_price_range",
    };
  }

  const local = localBargainTwin(input);
  if (!local.shouldReply) return local;

  try {
    const raw = await unifiedLlmJson({
      systemInstruction: buildNegotiationSystemPrompt(input.profileType),
      prompt: `Pardavėja: ${input.sellerName}
Skelbimas: ${input.listingTitle}
Kaina: ${input.listingPrice} €, minimumas: ${input.minPrice} €
Profilio tipas: ${input.profileType ?? "nežinomas"}
Pirkėjo žinutė: "${input.buyerMessage}"`,
    });

    return {
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
  } catch (err) {
    logProductionError("negotiation-twin", err, {
      listingTitle: input.listingTitle,
      profileType: input.profileType,
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
