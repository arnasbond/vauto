export const STRIPE_PLANS = {
  starter: { amount: 2900, label: "Vauto Starto paketas" },
  pro: { amount: 9900, label: "Vauto Pro paketas" },
} as const;

export type StripePlanId = keyof typeof STRIPE_PLANS;
