export type B2BBillingPlanId = "start" | "growth" | "enterprise";
export type B2BBillingModel = "ppc" | "subscription";

/** @deprecated Legacy plan ids from earlier builds */
export type LegacyB2BBillingPlanId = "starter" | "pro";

export interface B2BPlan {
  id: B2BBillingPlanId;
  label: string;
  monthlyPrice: number;
  jobListingLimit: number | "unlimited";
  features: string[];
  homepageLogo: boolean;
  aiCvFilter: boolean;
}

export const B2B_PLANS: B2BPlan[] = [
  {
    id: "start",
    label: "START",
    monthlyPrice: 29,
    jobListingLimit: 1,
    features: [
      "1 aktyvus darbo skelbimas per mėnesį",
      "CV paraiškų gavimas",
      "Bazinė darbdavio statistika",
    ],
    homepageLogo: false,
    aiCvFilter: false,
  },
  {
    id: "growth",
    label: "GROWTH",
    monthlyPrice: 99,
    jobListingLimit: 5,
    features: [
      "Iki 5 aktyvių darbo skelbimų",
      "Logotipo rodymas pagrindiniame puslapyje",
      "Išplėstinė analitika ir TOP prioritetas",
    ],
    homepageLogo: true,
    aiCvFilter: false,
  },
  {
    id: "enterprise",
    label: "ENTERPRISE",
    monthlyPrice: 249,
    jobListingLimit: "unlimited",
    features: [
      "Neriboti darbo skelbimai",
      "AI automatinis CV atrankos filtras",
      "Dedikuotas palaikymas ir API prieiga",
    ],
    homepageLogo: true,
    aiCvFilter: true,
  },
];

export function normalizeBillingPlan(
  plan?: string | null
): B2BBillingPlanId | "free" {
  if (!plan || plan === "free") return "free";
  if (plan === "starter" || plan === "start") return "start";
  if (plan === "pro" || plan === "growth") return "growth";
  if (plan === "enterprise") return "enterprise";
  return "free";
}

export function billingPlanRank(plan?: string | null): number {
  const normalized = normalizeBillingPlan(plan);
  if (normalized === "enterprise") return 3;
  if (normalized === "growth") return 2;
  if (normalized === "start") return 1;
  return 0;
}

export function getB2BPlan(id: B2BBillingPlanId): B2BPlan {
  const plan = B2B_PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown B2B plan: ${id}`);
  return plan;
}

export function jobCreditsForPlan(planId: B2BBillingPlanId): number | "unlimited" {
  return getB2BPlan(planId).jobListingLimit;
}

export function buildB2BCheckout(planId: B2BBillingPlanId) {
  const plan = getB2BPlan(planId);
  return {
    id: `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: "b2b_subscription" as const,
    productId: planId,
    lineTitle: `${plan.label} prenumerata`,
    lineDescription: plan.features[0] ?? plan.label,
    amountEur: plan.monthlyPrice,
    vatRate: 0.21,
  };
}

export const PPC_RATES = {
  listingClick: 0.08,
  callClick: 0.35,
  safeBuyStart: 0.2,
  serviceLeadOpen: 1.2,
};

export function estimatePpcSpend(metrics: {
  clicks: number;
  callClicks: number;
  safeBuyStarts?: number;
}): number {
  const amount =
    metrics.clicks * PPC_RATES.listingClick +
    metrics.callClicks * PPC_RATES.callClick +
    (metrics.safeBuyStarts ?? 0) * PPC_RATES.safeBuyStart;
  return Math.round(amount * 100) / 100;
}
