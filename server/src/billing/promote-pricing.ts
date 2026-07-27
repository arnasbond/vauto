/**
 * Server-authoritative visibility / promote pricing.
 * Re-exports the shared promote catalog (single source of truth).
 */
export {
  type PromoteTierId,
  normalizePromoteTier,
  resolvePromotePriceEur,
  promoteDurationDays,
  b2cProductToPromoteTier,
  stripExpiredVisibilityAttributes,
  VISIBILITY_TIER_ATTR,
  VISIBILITY_EXPIRES_ATTR,
  PROMOTE_TIER_BASE_PRICE_EUR,
  PROMOTE_TIER_DURATION_DAYS,
} from "../shared/promote-catalog.js";
