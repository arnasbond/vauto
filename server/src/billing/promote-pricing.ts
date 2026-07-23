/**
 * Server-authoritative visibility / promote pricing.
 * Client may suggest a tier; EUR cost is always resolved here.
 */

export type PromoteTierId = 1 | 2 | 3 | 4 | 5;

const TIER_BASE_PRICE_EUR: Record<PromoteTierId, number> = {
  1: 3.99,
  2: 9.99,
  3: 24.99,
  4: 49.99,
  5: 129.99,
};

const CATEGORY_PRICE_MULTIPLIER: Record<string, number> = {
  electronics: 1,
  clothing: 1,
  home: 1.1,
  other: 1,
  services: 1.15,
  vehicles: 1.35,
  transport: 1.25,
  real_estate: 2,
  jobs: 1.05,
  tools: 1.1,
  rental: 1.2,
};

const TIER_DURATION_DAYS: Record<PromoteTierId, number> = {
  1: 7,
  2: 14,
  3: 30,
  4: 60,
  5: 90,
};

export function normalizePromoteTier(raw: unknown): PromoteTierId {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (n >= 1 && n <= 5) return Math.floor(n) as PromoteTierId;
  return 2;
}

export function resolvePromotePriceEur(input: {
  tier: PromoteTierId;
  category?: string | null;
}): number {
  const base = TIER_BASE_PRICE_EUR[input.tier];
  const mult =
    CATEGORY_PRICE_MULTIPLIER[String(input.category ?? "other").toLowerCase()] ??
    1;
  return Math.round(base * mult * 100) / 100;
}

export function promoteDurationDays(tier: PromoteTierId): number {
  return TIER_DURATION_DAYS[tier];
}
