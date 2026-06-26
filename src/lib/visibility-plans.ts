import type { Listing, ListingCategory, UserProfile } from "@/lib/types";
import type { MarketInsights } from "@/lib/market-insights";

/** Matomumo pakopos: 1–5. Fiksuotos kainos — be aukciono ir kainų lenktynių. */
export type VisibilityTierId = 1 | 2 | 3 | 4 | 5;

export interface VisibilityPlan {
  id: VisibilityTierId;
  label: string;
  shortLabel: string;
  description: string;
  durationDays: number;
  /** Fiksuota kaina EUR (prieš kategorijos koeficientą) */
  basePrice: number;
  price: number;
  /** Kiek skelbimų gali būti šioje pakopoje vienoje kategorijoje + mieste */
  maxSlotsPerRegion: number | "unlimited";
  /** Minimalus reikalavimas */
  requirement?: string;
  requirementMet: boolean;
  slotsUsed: number;
  slotsAvailable: boolean;
  available: boolean;
  unavailableReason?: string;
  expectedLift: string;
  feedPosition: string;
  recommended?: boolean;
}

const CATEGORY_PRICE_MULTIPLIER: Record<ListingCategory, number> = {
  electronics: 1,
  clothing: 1,
  home: 1.1,
  other: 1,
  services: 1.15,
  vehicles: 1.35,
  real_estate: 2,
  jobs: 1.05,
};

const TIER_DEFINITIONS: Array<{
  id: VisibilityTierId;
  label: string;
  shortLabel: string;
  description: string;
  durationDays: number;
  basePrice: number;
  maxSlotsPerRegion: number | "unlimited";
  expectedLift: string;
  feedPosition: string;
  minBillingPlan?: "start" | "growth" | "enterprise" | "starter" | "pro";
  minWalletBalance?: number;
  cooldownDaysAfterExpiry?: number;
}> = [
  {
    id: 1,
    label: "Paryškintas",
    shortLabel: "★",
    description: "Švelnus paryškinimas ir ženklelis — tinka testui ar sezoniniam matomumui.",
    durationDays: 7,
    basePrice: 3.99,
    maxSlotsPerRegion: "unlimited",
    expectedLift: "+35% matomumo",
    feedPosition: "Virš standartinių skelbimų",
  },
  {
    id: 2,
    label: "Iškeltas",
    shortLabel: "TOP",
    description: "Iškėlimas paieškoje 2 savaitėms — geras balansas kainai ir rezultatui.",
    durationDays: 14,
    basePrice: 9.99,
    maxSlotsPerRegion: "unlimited",
    expectedLift: "+90% matomumo",
    feedPosition: "Pirmųjų 5–8 rezultatų zonoje",
  },
  {
    id: 3,
    label: "Premium",
    shortLabel: "VIP",
    description: "Mėnesio matomumas — iki 3 skelbimų vienoje kategorijoje ir regione.",
    durationDays: 30,
    basePrice: 24.99,
    maxSlotsPerRegion: 3,
    expectedLift: "+160% matomumo",
    feedPosition: "Pirmųjų 3 rezultatų zonoje",
  },
  {
    id: 4,
    label: "Verslo partneris",
    shortLabel: "PRO",
    description: "Ilgalaikis matomumas 60 d. — ribotas skaičius, kad niekas negalėtų monopolizuoti.",
    durationDays: 60,
    basePrice: 59.99,
    maxSlotsPerRegion: 2,
    expectedLift: "+220% matomumo",
    feedPosition: "Pirmųjų 2 rezultatų zonoje",
    minBillingPlan: "starter",
  },
  {
    id: 5,
    label: "Ilgalaikis partneris",
    shortLabel: "MAX",
    description:
      "Maksimalus matomumas 90 d. — tik 1 vieta kategorijoje ir regione. Reikalauja apgalvoto sprendimo.",
    durationDays: 90,
    basePrice: 129.99,
    maxSlotsPerRegion: 1,
    expectedLift: "+280% matomumo",
    feedPosition: "1-oji rekomenduojama pozicija (rotacija su lygiaverte pakopa)",
    minBillingPlan: "pro",
    minWalletBalance: 50,
    cooldownDaysAfterExpiry: 30,
  },
];

const VISIBILITY_TIER_ATTR = "_visibilityTier";
const VISIBILITY_EXPIRES_ATTR = "_visibilityExpiresAt";
const VISIBILITY_COOLDOWN_ATTR = "_visibilityCooldownUntil";

function normalizeCity(location: string): string {
  return location.split(",")[0]?.trim().toLowerCase() || "lietuva";
}

export function planPriceForCategory(basePrice: number, category: ListingCategory): number {
  const mult = CATEGORY_PRICE_MULTIPLIER[category] ?? 1;
  return Math.round(basePrice * mult * 100) / 100;
}

export function readVisibilityTier(listing: Listing): VisibilityTierId | undefined {
  if (listing.visibilityPlanTier) return listing.visibilityPlanTier;
  const raw = listing.attributes?.[VISIBILITY_TIER_ATTR];
  const n = typeof raw === "string" ? parseInt(raw, 10) : typeof raw === "number" ? raw : 0;
  if (n >= 1 && n <= 5) return n as VisibilityTierId;
  return listing.promoted ? 2 : undefined;
}

export function readVisibilityExpiresAt(listing: Listing): string | undefined {
  if (listing.visibilityExpiresAt) return listing.visibilityExpiresAt;
  const raw = listing.attributes?.[VISIBILITY_EXPIRES_ATTR];
  return typeof raw === "string" ? raw : undefined;
}

export function isVisibilityActive(listing: Listing, now = Date.now()): boolean {
  const tier = readVisibilityTier(listing);
  if (!tier) return false;
  const expires = readVisibilityExpiresAt(listing);
  if (!expires) return !!listing.promoted;
  return new Date(expires).getTime() > now;
}

export function effectiveVisibilityTier(listing: Listing): VisibilityTierId | 0 {
  return isVisibilityActive(listing) ? (readVisibilityTier(listing) ?? 0) : 0;
}

export function visibilityBoostScore(listing: Listing): number {
  const tier = effectiveVisibilityTier(listing);
  const boosts: Record<number, number> = {
    0: 0,
    1: 0.05,
    2: 0.12,
    3: 0.2,
    4: 0.28,
    5: 0.35,
  };
  return boosts[tier] ?? 0;
}

export function buildVisibilityAttributes(
  tier: VisibilityTierId,
  durationDays: number,
  existing?: Listing["attributes"]
): Listing["attributes"] {
  const expires = new Date();
  expires.setDate(expires.getDate() + durationDays);
  return {
    ...existing,
    [VISIBILITY_TIER_ATTR]: String(tier),
    [VISIBILITY_EXPIRES_ATTR]: expires.toISOString(),
  };
}

function readCooldownUntil(listing: Listing): string | undefined {
  const raw = listing.attributes?.[VISIBILITY_COOLDOWN_ATTR];
  return typeof raw === "string" ? raw : undefined;
}

function billingPlanRank(plan?: UserProfile["billingPlan"]): number {
  if (plan === "enterprise") return 3;
  if (plan === "pro" || plan === "growth") return 2;
  if (plan === "starter" || plan === "start") return 1;
  return 0;
}

function countActiveTierSlots(
  allListings: Listing[],
  category: ListingCategory,
  city: string,
  minTier: VisibilityTierId,
  excludeListingId?: string
): number {
  const cityNorm = normalizeCity(city);
  return allListings.filter((l) => {
    if (l.id === excludeListingId) return false;
    if (l.category !== category) return false;
    if (l.status === "sold" || l.banned) return false;
    if (!isVisibilityActive(l)) return false;
    const tier = effectiveVisibilityTier(l);
    if (tier < minTier) return false;
    return normalizeCity(l.location) === cityNorm;
  }).length;
}

function isOnTierCooldown(
  listing: Listing,
  tierDef: (typeof TIER_DEFINITIONS)[number],
  now = Date.now()
): boolean {
  if (!tierDef.cooldownDaysAfterExpiry) return false;
  const cooldownUntil = readCooldownUntil(listing);
  if (cooldownUntil && new Date(cooldownUntil).getTime() > now) return true;
  const expires = readVisibilityExpiresAt(listing);
  const prevTier = readVisibilityTier(listing);
  if (
    prevTier === tierDef.id &&
    expires &&
    new Date(expires).getTime() <= now
  ) {
    const cooldownEnd =
      new Date(expires).getTime() + tierDef.cooldownDaysAfterExpiry * 86_400_000;
    return now < cooldownEnd;
  }
  return false;
}

export function getRecommendedVisibilityTier(
  competitorCount: number,
  insights?: MarketInsights
): VisibilityTierId {
  if (competitorCount >= 8) return 3;
  if (competitorCount >= 5) return 2;
  if (competitorCount >= 2) return 2;
  if (insights?.priceAdvice.verdict === "low") return 2;
  return 1;
}

export function getVisibilityPlans(
  listing: Listing,
  allListings: Listing[],
  user?: Pick<UserProfile, "billingPlan" | "walletBalance">
): VisibilityPlan[] {
  const city = listing.location;
  const currentTier = effectiveVisibilityTier(listing);
  const recommended = getRecommendedVisibilityTier(
    allListings.filter(
      (l) =>
        l.id !== listing.id &&
        l.category === listing.category &&
        l.status !== "sold" &&
        !l.banned
    ).length
  );

  return TIER_DEFINITIONS.map((def) => {
    const price = planPriceForCategory(def.basePrice, listing.category);
    const slotsUsed =
      def.maxSlotsPerRegion === "unlimited"
        ? 0
        : countActiveTierSlots(allListings, listing.category, city, def.id, listing.id);

    const maxSlots = def.maxSlotsPerRegion;
    const slotsAvailable =
      maxSlots === "unlimited" ? true : slotsUsed < maxSlots;

    let requirementMet = true;
    let requirement: string | undefined;
    if (def.minBillingPlan) {
      requirement = `Reikia „${def.minBillingPlan === "pro" ? "Pro" : "Starto"}“ verslo plano`;
      requirementMet = billingPlanRank(user?.billingPlan) >= billingPlanRank(def.minBillingPlan);
    }
    if (def.minWalletBalance) {
      const walletReq = `Piniginėje min. ${def.minWalletBalance} € (be šio pirkimo)`;
      requirement = requirement ? `${requirement} · ${walletReq}` : walletReq;
      requirementMet =
        requirementMet && (user?.walletBalance ?? 0) >= def.minWalletBalance;
    }

    let available = slotsAvailable && requirementMet;
    let unavailableReason: string | undefined;

    if (!slotsAvailable && maxSlots !== "unlimited") {
      unavailableReason = `Užimta: ${slotsUsed}/${maxSlots} vietų ${normalizeCity(city)}`;
      available = false;
    } else if (!requirementMet) {
      unavailableReason = requirement;
      available = false;
    } else if (isOnTierCooldown(listing, def)) {
      unavailableReason = `Po šios pakopos galioja ${def.cooldownDaysAfterExpiry} d. pertrauka — apsauga nuo monopolijos`;
      available = false;
    } else if (currentTier >= def.id) {
      unavailableReason =
        currentTier === def.id
          ? "Ši pakopa jau aktyvi"
          : "Jau turite aukštesnę aktyvią pakopą";
      available = false;
    }

    return {
      id: def.id,
      label: def.label,
      shortLabel: def.shortLabel,
      description: def.description,
      durationDays: def.durationDays,
      basePrice: def.basePrice,
      price,
      maxSlotsPerRegion: def.maxSlotsPerRegion,
      requirement,
      requirementMet,
      slotsUsed,
      slotsAvailable,
      available,
      unavailableReason,
      expectedLift: def.expectedLift,
      feedPosition: def.feedPosition,
      recommended: def.id === recommended && available,
    };
  });
}

export function getVisibilityPlanById(
  tierId: VisibilityTierId,
  listing: Listing,
  allListings: Listing[],
  user?: Pick<UserProfile, "billingPlan" | "walletBalance">
): VisibilityPlan | undefined {
  return getVisibilityPlans(listing, allListings, user).find((p) => p.id === tierId);
}

export const VISIBILITY_POLICY_SUMMARY = [
  "Fiksuotos kainos — niekas negali „permušti“ kito pasiūlymo didesne suma.",
  "Premium pakopose ribotas vietų skaičius kategorijoje ir regione.",
  "Brangiausia pakopa — tik 1 vieta ir 30 d. pertrauka po galiojimo.",
  "Renkatės planą pagal tikslą: trumpas testas, mėnesinis matomumas ar ilgalaikis partnerystės lygis.",
];

export function formatVisibilityExpiry(listing: Listing): string | null {
  const expires = readVisibilityExpiresAt(listing);
  const tier = effectiveVisibilityTier(listing);
  if (!tier || !expires) return null;
  const days = Math.ceil((new Date(expires).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return null;
  const plan = TIER_DEFINITIONS.find((d) => d.id === tier);
  return `${plan?.label ?? "Matomumas"} · liko ${days} d.`;
}
