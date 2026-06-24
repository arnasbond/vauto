import type { UserProfile } from "@/lib/types";
import { resolveAgentUserRole } from "@/lib/vauto-agent-client";

export type MonetizationTier = "free" | "business_pro";

export type MicroPaymentProduct = "smart_boost" | "region_stats" | "generic";

export interface MonetizationState {
  tier: MonetizationTier;
  activeBoost: boolean;
  billingPlan?: string;
  walletBalance?: number;
}

export interface ZeroUiMicroPaymentIntent {
  reason: string;
  price: number;
  product: MicroPaymentProduct;
  voiceConfirmPhrase?: string;
}

export const SMART_BOOST_PRICE_EUR = 2.99;
export const REGION_STATS_PRICE_EUR = 4.99;
export const VOICE_PAY_CONFIRM_PHRASE = "Taip, apmokėti";

export function resolveMonetizationTier(user: UserProfile): MonetizationTier {
  const agentRole = resolveAgentUserRole(user);
  if (agentRole === "business" || agentRole === "admin") return "business_pro";
  if (user.billingPlan === "pro" || user.billingPlan === "starter") {
    return "business_pro";
  }
  return "free";
}

export function resolveClientMonetizationState(
  user: UserProfile,
  activeBoost = false
): MonetizationState {
  return {
    tier: resolveMonetizationTier(user),
    activeBoost,
    billingPlan: user.billingPlan,
    walletBalance: user.walletBalance,
  };
}

export function microPaymentFromToolResult(result: unknown): ZeroUiMicroPaymentIntent | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (!r.ok) return null;
  const reason = String(r.reason ?? "").trim();
  const price = Number(r.price);
  if (!reason || !Number.isFinite(price) || price <= 0) return null;
  const product = String(r.product ?? "smart_boost") as MicroPaymentProduct;
  return {
    reason,
    price,
    product:
      product === "region_stats" || product === "generic" ? product : "smart_boost",
    voiceConfirmPhrase: String(r.voiceConfirmPhrase ?? VOICE_PAY_CONFIRM_PHRASE),
  };
}
