import { applyLaunchPromoPrice } from "../shared/launch-promo.js";

const STRIPE_PLANS_CATALOG = {
  starter: { amount: 2900, label: "VAUTO Starto paketas" },
  pro: { amount: 9900, label: "VAUTO Pro paketas" },
} as const;

export type StripePlanId = keyof typeof STRIPE_PLANS_CATALOG;

/** Stripe plan amounts in cents — 0 during First Month Free launch promo. */
export const STRIPE_PLANS: Record<
  StripePlanId,
  { amount: number; label: string; listAmount: number }
> = {
  starter: {
    listAmount: STRIPE_PLANS_CATALOG.starter.amount,
    amount: Math.round(
      applyLaunchPromoPrice(STRIPE_PLANS_CATALOG.starter.amount / 100) * 100
    ),
    label: STRIPE_PLANS_CATALOG.starter.label,
  },
  pro: {
    listAmount: STRIPE_PLANS_CATALOG.pro.amount,
    amount: Math.round(
      applyLaunchPromoPrice(STRIPE_PLANS_CATALOG.pro.amount / 100) * 100
    ),
    label: STRIPE_PLANS_CATALOG.pro.label,
  },
};
