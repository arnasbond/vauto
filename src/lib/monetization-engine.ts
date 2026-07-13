import type { UserProfile } from "@/lib/types";
import { resolveAgentUserRole } from "@/lib/vauto-agent-client";

export type MonetizationTier = "free" | "business_pro";

export type MonetizationAudience = "c2c" | "b2b";

export type MicroPaymentProduct =
  | "smart_boost"
  | "region_stats"
  | "b2b_lead"
  | "generic";

export interface MonetizationState {
  tier: MonetizationTier;
  audience: MonetizationAudience;
  activeBoost: boolean;
  billingPlan?: string;
  walletBalance?: number;
}

export interface ZeroUiMicroPaymentIntent {
  reason: string;
  price: number;
  product: MicroPaymentProduct;
  voiceConfirmPhrase?: string;
  metadata?: {
    kind?: "ai_twin";
    listingId?: string;
  };
}

export const SMART_BOOST_C2C = 2.99;
export const SMART_BOOST_B2B = 29.99;
export const BUSINESS_MONTHLY_PRO = 199.0;
export const B2B_LEAD_PRICE = 14.99;

/** @deprecated Naudok SMART_BOOST_C2C */
export const SMART_BOOST_PRICE_EUR = SMART_BOOST_C2C;

export const VOICE_PAY_CONFIRM_PHRASE = "Taip, apmokėti";

export function resolveMonetizationAudience(user: UserProfile): MonetizationAudience {
  const agentRole = resolveAgentUserRole(user);
  if (agentRole === "business" || agentRole === "admin") return "b2b";
  return "c2c";
}

export function resolveMonetizationTier(user: UserProfile): MonetizationTier {
  const agentRole = resolveAgentUserRole(user);
  if (agentRole === "admin") return "business_pro";
  if (user.billingPlan === "pro") return "business_pro";
  return "free";
}

export function resolveClientMonetizationState(
  user: UserProfile,
  activeBoost = false
): MonetizationState {
  return {
    tier: resolveMonetizationTier(user),
    audience: resolveMonetizationAudience(user),
    activeBoost,
    billingPlan: user.billingPlan,
    walletBalance: user.walletBalance,
  };
}

export function resolveSmartBoostPrice(user: UserProfile): number {
  return resolveMonetizationAudience(user) === "b2b"
    ? SMART_BOOST_B2B
    : SMART_BOOST_C2C;
}

export function normalizeMicroPaymentIntent(
  intent: ZeroUiMicroPaymentIntent,
  user: UserProfile
): ZeroUiMicroPaymentIntent {
  if (intent.product !== "smart_boost") return intent;
  return { ...intent, price: resolveSmartBoostPrice(user) };
}

export function microPaymentFromToolResult(result: unknown): ZeroUiMicroPaymentIntent | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (!r.ok) return null;
  const reason = String(r.reason ?? "").trim();
  const price = Number(r.price);
  if (!reason || !Number.isFinite(price) || price <= 0) return null;
  const product = String(r.product ?? "smart_boost") as MicroPaymentProduct;
  const validProducts: MicroPaymentProduct[] = [
    "smart_boost",
    "region_stats",
    "b2b_lead",
    "generic",
  ];
  return {
    reason,
    price,
    product: validProducts.includes(product) ? product : "smart_boost",
    voiceConfirmPhrase: String(r.voiceConfirmPhrase ?? VOICE_PAY_CONFIRM_PHRASE),
  };
}
