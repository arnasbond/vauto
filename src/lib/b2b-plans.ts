export type B2BBillingPlanId = "starter" | "pro";
export type B2BBillingModel = "ppc" | "subscription";

export interface B2BPlan {
  id: B2BBillingPlanId;
  label: string;
  monthlyPrice: number;
  listingLimit: number | "unlimited";
  features: string[];
}

export const B2B_PLANS: B2BPlan[] = [
  {
    id: "starter",
    label: "Starto paketas",
    monthlyPrice: 29,
    listingLimit: 50,
    features: [
      "Iki 50 aktyvių skelbimų",
      "PPC skambučių sekimas",
      "Vietinių paslaugų lead’ai",
      "Masinis CSV/XML importas",
    ],
  },
  {
    id: "pro",
    label: "Pro paketas",
    monthlyPrice: 99,
    listingLimit: "unlimited",
    features: [
      "Neriboti skelbimai",
      "Rinkos kainų palyginimas",
      "Pro Meistras: daugiau lead’ų ir Top Rated nuolaidos",
      "Automatinis TOP iškėlimas",
      "API/XML feed paruošimas",
    ],
  },
];

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
