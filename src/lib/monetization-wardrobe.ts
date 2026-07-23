import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import {
  VAT_RATE_LT,
  type CheckoutSession,
} from "@/lib/monetization-catalog";
import type { ChatThread, EscrowTransaction, Listing, UserProfile } from "@/lib/types";

/** Success-based micro-fee — tik Derybų dvynio sandoriams Spintos režime */
export const WARDROBE_NEGOTIATION_TWIN_FEE_RATE = 0.03;
export const WARDROBE_NEGOTIATION_TWIN_FEE_LABEL = "AI saugumo garantija";

/** AI Visibility Booster — asmeninių stiliaus derinių srautas */
export const WARDROBE_STYLE_BOOST_EUR = 1.49;
export const WARDROBE_STYLE_BOOST_DAYS = 7;

/** Spintos Power-User prenumerata */
export const WARDROBE_POWER_SUBSCRIPTION_EUR = 4.99;
export const WARDROBE_POWER_SUBSCRIPTION_DAYS = 30;
export const WARDROBE_FREE_IMPORT_LIMIT = 1;

export const WARDROBE_STYLE_BOOST_ATTR = "aiStyleBoostUntil";

const IMPORT_COUNT_KEY = "vauto_wardrobe_import_count";

export interface WardrobeEscrowMonetizationContext {
  theme: ChameleonThemeId;
  listingCategory?: Listing["category"];
  negotiationTwinEnabled: boolean;
}

/** Monetizacija aktyvi tik wardrobe chameleon sluoksnyje (escrow / sandoriai) */
export function isWardrobeMonetizationActive(theme: ChameleonThemeId): boolean {
  return theme === "wardrobe";
}

/** Kabineto monetizacija — wardrobe tema arba aktyvus „Mano Spinta“ kontekstas */
export function isWardrobeSpintaEconomyActive(
  theme: ChameleonThemeId,
  inSpintaCabinet = false
): boolean {
  return isWardrobeMonetizationActive(theme) || inSpintaCabinet;
}

export function shouldApplyNegotiationTwinFee(
  ctx: WardrobeEscrowMonetizationContext
): boolean {
  if (!isWardrobeMonetizationActive(ctx.theme)) return false;
  if (ctx.listingCategory !== "clothing") return false;
  return ctx.negotiationTwinEnabled;
}

export function calculateNegotiationTwinBuyerFee(dealAmountEur: number): number {
  if (dealAmountEur <= 0) return 0;
  return Math.round(dealAmountEur * WARDROBE_NEGOTIATION_TWIN_FEE_RATE * 100) / 100;
}

export function calculateBuyerTotalWithWardrobeFee(
  dealAmountEur: number,
  feeEur: number
): number {
  return Math.round((dealAmountEur + feeEur) * 100) / 100;
}

export function buildWardrobeEscrowContext(
  theme: ChameleonThemeId,
  chat: ChatThread,
  listing?: Listing | null
): WardrobeEscrowMonetizationContext {
  return {
    theme,
    listingCategory: listing?.category,
    negotiationTwinEnabled: Boolean(chat.negotiationTwin?.enabled),
  };
}

/** Pritaiko 3% mokestį escrow įrašui (idempotentiška) */
export function applyWardrobeNegotiationTwinFee(
  escrow: EscrowTransaction,
  ctx: WardrobeEscrowMonetizationContext
): EscrowTransaction {
  if (!shouldApplyNegotiationTwinFee(ctx)) return escrow;
  if (escrow.negotiationTwinFeeApplied) return escrow;

  const fee = calculateNegotiationTwinBuyerFee(escrow.amount);
  if (fee <= 0) return escrow;

  return {
    ...escrow,
    negotiationTwinFeeApplied: true,
    buyerServiceFeeEur: fee,
    buyerTotalEur: calculateBuyerTotalWithWardrobeFee(escrow.amount, fee),
  };
}

/** Sandorio uždarymo metu — užtikrina, kad mokestis fiksuotas */
export function finalizeWardrobeEscrowOnClose(
  escrow: EscrowTransaction,
  ctx: WardrobeEscrowMonetizationContext
): EscrowTransaction {
  if (escrow.status !== "completed") return escrow;
  return applyWardrobeNegotiationTwinFee(escrow, ctx);
}

export function buildWardrobeStyleBoostCheckout(
  listingId: string,
  listingTitle: string
): CheckoutSession {
  return {
    id: `chk_wardrobe_boost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: "wardrobe_style_boost",
    productId: "style_boost",
    listingId,
    listingTitle,
    lineTitle: "AI stiliaus derinių srautas",
    lineDescription: `${WARDROBE_STYLE_BOOST_DAYS} d. — prekė rodoma asmeniniuose AI stiliaus deriniuose`,
    amountEur: WARDROBE_STYLE_BOOST_EUR,
    vatRate: VAT_RATE_LT,
  };
}

/** @deprecated Spinta Power-User monetization removed — kept for old session replay only. */
export function buildWardrobePowerSubscriptionCheckout(): CheckoutSession {
  return {
    id: `chk_wardrobe_power_deprecated_${Date.now()}`,
    kind: "wardrobe_power_subscription",
    productId: "power_subscription",
    lineTitle: "VAUTO Spinta Power-User (nebenaudojama)",
    lineDescription: "Ši prenumerata nebenaudojama — Spinta importas nemokamas.",
    amountEur: 0,
    vatRate: VAT_RATE_LT,
  };
}

export function styleBoostExpiryIso(from = Date.now()): string {
  return new Date(from + WARDROBE_STYLE_BOOST_DAYS * 86_400_000).toISOString();
}

export function powerSubscriptionExpiryIso(from = Date.now()): string {
  return new Date(from + WARDROBE_POWER_SUBSCRIPTION_DAYS * 86_400_000).toISOString();
}

export function isListingInStyleBoostFeed(listing: Listing, now = Date.now()): boolean {
  const until = listing.attributes?.[WARDROBE_STYLE_BOOST_ATTR];
  if (!until || typeof until !== "string") return false;
  return new Date(until).getTime() > now;
}

export function readWardrobeImportCount(userId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(`${IMPORT_COUNT_KEY}_${userId}`);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function incrementWardrobeImportCount(userId: string): number {
  const next = readWardrobeImportCount(userId) + 1;
  try {
    localStorage.setItem(`${IMPORT_COUNT_KEY}_${userId}`, String(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function isWardrobePowerUser(user: UserProfile, now = Date.now()): boolean {
  if (!user.wardrobePowerUser) return false;
  if (!user.wardrobePowerUntil) return true;
  return new Date(user.wardrobePowerUntil).getTime() > now;
}
