/**
 * VAUTO NL Search 10B — SearchQuery Zod schema.
 * Numeric fields use strict Zod .min/.max (no silent clamp — Etapas 10K M-01).
 */

import { z } from "zod";

export const SEARCH_SORTS = [
  "relevance",
  "price_asc",
  "price_desc",
  "newest",
  "distance",
] as const;

export type SearchSort = (typeof SEARCH_SORTS)[number];

export const SEARCH_BOUNDS = {
  priceMin: 0,
  priceMax: 10_000_000,
  yearMin: 1950,
  yearMax: new Date().getFullYear() + 1,
  mileageMax: 2_000_000,
  radiusKmMin: 1,
  radiusKmMax: 500,
  queryMax: 240,
} as const;

const boundedPrice = z
  .number()
  .finite()
  .min(SEARCH_BOUNDS.priceMin)
  .max(SEARCH_BOUNDS.priceMax);

const boundedYear = z
  .number()
  .finite()
  .int()
  .min(SEARCH_BOUNDS.yearMin)
  .max(SEARCH_BOUNDS.yearMax);

const boundedMileage = z
  .number()
  .finite()
  .min(0)
  .max(SEARCH_BOUNDS.mileageMax);

const boundedRadius = z
  .number()
  .finite()
  .min(SEARCH_BOUNDS.radiusKmMin)
  .max(SEARCH_BOUNDS.radiusKmMax);

export const SearchQuerySchema = z
  .object({
    category: z.string().max(64).optional(),
    brand: z.string().max(80).optional(),
    model: z.string().max(80).optional(),
    priceMin: boundedPrice.optional(),
    priceMax: boundedPrice.optional(),
    yearMin: boundedYear.optional(),
    yearMax: boundedYear.optional(),
    mileageMax: boundedMileage.optional(),
    location: z.string().max(80).optional(),
    radiusKm: boundedRadius.optional(),
    condition: z.array(z.string().max(32)).max(8).optional(),
    delivery: z.array(z.string().max(32)).max(8).optional(),
    fuel: z.string().max(32).optional(),
    transmission: z.string().max(32).optional(),
    /** Free-text keyword remnant after structured extraction (sanitized). */
    keywords: z.string().max(SEARCH_BOUNDS.queryMax).optional(),
    sort: z.enum(SEARCH_SORTS).optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (
      q.priceMin != null &&
      q.priceMax != null &&
      q.priceMin > q.priceMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "priceMin cannot exceed priceMax",
        path: ["priceMin"],
      });
    }
    if (q.yearMin != null && q.yearMax != null && q.yearMin > q.yearMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "yearMin cannot exceed yearMax",
        path: ["yearMin"],
      });
    }
  });

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export function parseSearchQuery(raw: unknown): SearchQuery {
  return SearchQuerySchema.parse(raw);
}

/** Strip control chars / SQL metachar noise from free-text fragments (never concatenate into SQL). */
export function sanitizeSearchText(raw: string): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[;'"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_BOUNDS.queryMax);
}

export type SearchRelaxation = {
  field: keyof SearchQuery | "keywords";
  action: "remove" | "widen";
  label: string;
};

export type SearchListingRecord = {
  id: string;
  title: string;
  price: number;
  location: string;
  category: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  mileage?: number | null;
  condition?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  delivery?: string[] | null;
  /** Distance from buyer when known; null = unknown (do NOT invent). */
  distanceKm?: number | null;
  createdAt: string;
  sellerVerified?: boolean;
  status?: string | null;
  banned?: boolean;
  requiresReview?: boolean;
  /** Private / owner-only — never in public NL search. */
  visibility?: "public" | "private" | "hidden";
  ownerUserId?: string;
};

export type SearchHit = {
  id: string;
  score: number;
  title: string;
  price: number;
  location: string;
  category: string;
  distanceKm: number | null;
};

/** 10D Market Intelligence signal — never invents a market price. */
export type AskingPriceVsMarketSignal =
  | "BELOW_RANGE"
  | "WITHIN_RANGE"
  | "ABOVE_RANGE"
  | "UNKNOWN";

export type NlSearchResult = {
  originalText: string;
  normalizedText: string;
  intent: string;
  query: SearchQuery | null;
  results: SearchHit[];
  candidateIds: string[];
  zeroResult: boolean;
  suggestedRelaxations: SearchRelaxation[];
  /** When intent cannot run search. */
  blockedReason?: string;
  hardConstraints: Partial<SearchQuery>;
  foundationVersion: string;
  latencyMs: number;
  /**
   * Optional 10D technical signal vs deterministic ValuationResult.
   * Absent / UNKNOWN when market data was not supplied.
   */
  askingPriceVsMarket?: AskingPriceVsMarketSignal;
};
