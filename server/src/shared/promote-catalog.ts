/**
 * Canonical promote / visibility catalog — mirror of shared/promote-catalog.ts
 */
export type PromoteTierId = 1 | 2 | 3 | 4 | 5;

export const PROMOTE_TIER_BASE_PRICE_EUR: Record<PromoteTierId, number> = {
  1: 3.99,
  2: 9.99,
  3: 24.99,
  4: 59.99,
  5: 129.99,
};

export const PROMOTE_TIER_DURATION_DAYS: Record<PromoteTierId, number> = {
  1: 7,
  2: 14,
  3: 30,
  4: 60,
  5: 90,
};

export const PROMOTE_TIER_BOOST_SCORE: Record<number, number> = {
  0: 0,
  1: 0.08,
  2: 0.18,
  3: 0.28,
  4: 0.38,
  5: 0.48,
};

export const PROMOTE_CATEGORY_PRICE_MULTIPLIER: Record<string, number> = {
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

export const VISIBILITY_TIER_ATTR = "_visibilityTier";
export const VISIBILITY_EXPIRES_ATTR = "_visibilityExpiresAt";
export const STYLE_BOOST_ATTR = "aiStyleBoostUntil";

export function b2cProductToPromoteTier(input: {
  productId?: string | null;
  visibilityTier?: string | null;
  bumpOnly?: boolean;
}): PromoteTierId {
  const id = String(input.productId ?? "").toLowerCase();
  const badge = String(input.visibilityTier ?? "").toLowerCase();
  if (input.bumpOnly || id === "refresh") return 1;
  if (id === "top" || badge === "top") return 2;
  if (id === "plus" || badge === "plus") return 1;
  return 2;
}

export function feedBadgeForPlanTier(
  tier: number
): "free" | "plus" | "top" {
  if (tier >= 2) return "top";
  if (tier === 1) return "plus";
  return "free";
}

export function normalizePromoteTier(raw: unknown): PromoteTierId {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (n >= 1 && n <= 5) return Math.floor(n) as PromoteTierId;
  return 2;
}

export function promoteDurationDays(tier: PromoteTierId): number {
  return PROMOTE_TIER_DURATION_DAYS[tier];
}

export function resolvePromotePriceEur(input: {
  tier: PromoteTierId;
  category?: string | null;
}): number {
  const base = PROMOTE_TIER_BASE_PRICE_EUR[input.tier];
  const mult =
    PROMOTE_CATEGORY_PRICE_MULTIPLIER[
      String(input.category ?? "other").toLowerCase()
    ] ?? 1;
  return Math.round(base * mult * 100) / 100;
}

export function visibilityBoostFromTier(tier: number): number {
  return PROMOTE_TIER_BOOST_SCORE[tier] ?? 0;
}

export function trustBoostScore(avg: number, count: number): number {
  if (count < 3 || !Number.isFinite(avg) || avg <= 0) return 0;
  const quality = Math.max(0, Math.min(1, (avg - 3.5) / 1.5));
  const confidence = Math.min(1, count / 10);
  return Math.round(0.08 * quality * confidence * 1000) / 1000;
}

export function styleBoostScore(expiresIso?: string | null, now = Date.now()): number {
  if (!expiresIso || typeof expiresIso !== "string") return 0;
  const t = new Date(expiresIso).getTime();
  if (!Number.isFinite(t) || t <= now) return 0;
  return 0.06;
}

export function stripExpiredVisibilityAttributes(
  attributes: Record<string, unknown> | null | undefined,
  promoted: boolean,
  now = Date.now()
): { attributes: Record<string, unknown> | undefined; promoted: boolean } {
  const attrs = attributes ? { ...attributes } : undefined;
  if (!attrs) return { attributes: undefined, promoted: Boolean(promoted) };

  const expiresRaw = attrs[VISIBILITY_EXPIRES_ATTR];
  if (typeof expiresRaw === "string") {
    const exp = new Date(expiresRaw).getTime();
    if (Number.isFinite(exp) && exp <= now) {
      delete attrs[VISIBILITY_TIER_ATTR];
      delete attrs[VISIBILITY_EXPIRES_ATTR];
      return {
        attributes: Object.keys(attrs).length ? attrs : undefined,
        promoted: false,
      };
    }
  }

  return {
    attributes: Object.keys(attrs).length ? attrs : undefined,
    promoted: Boolean(promoted),
  };
}
