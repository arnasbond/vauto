export const STRIPE_PLANS = {
  starter: { amount: 2900, label: "VAUTO Starto paketas" },
  pro: { amount: 9900, label: "VAUTO Pro paketas" },
} as const;

export type StripePlanId = keyof typeof STRIPE_PLANS;
