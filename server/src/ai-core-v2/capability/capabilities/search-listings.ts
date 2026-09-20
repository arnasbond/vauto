/**
 * VAUTO AI Core v2 — searchListings capability (READ).
 *
 * Wraps the existing marketplace search service behind a clean, typed,
 * validating capability contract. No intent logic, no query rewriting —
 * the reasoning layer supplies the concrete filters; this layer only
 * validates them and returns grounded results.
 */
import { searchListingsFiltered } from "../../../repository.js";
import type { ListingSearchParams } from "../../../repository.js";
import type {
  CapabilityContext,
  CapabilityContract,
  CapabilityResult,
} from "../capability.js";

export interface SearchListingsArgs {
  query?: string;
  category?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
}

export interface SearchListingsListing {
  id: string;
  title: string;
  price: number;
  location: string;
}

export interface SearchListingsData {
  count: number;
  listings: SearchListingsListing[];
}

function toFiniteNumber(value: unknown, field: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid ${field}: expected a non-negative number`);
  }
  return value;
}

function toOptionalString(value: unknown, field: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error(`invalid ${field}: expected a string`);
  const t = value.trim();
  return t || undefined;
}

export const searchListingsCapability: CapabilityContract<
  SearchListingsArgs,
  SearchListingsData
> = {
  name: "searchListings",
  description: "Ieškoti aktyvių skelbimų kataloge pagal kietus filtrus (query, category, city, price).",
  consequence: "READ",
  validate(raw: unknown): SearchListingsArgs {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("searchListings args must be an object");
    }
    const r = raw as Record<string, unknown>;
    return {
      query: toOptionalString(r.query, "query"),
      category: toOptionalString(r.category, "category"),
      city: toOptionalString(r.city, "city"),
      minPrice: toFiniteNumber(r.minPrice, "minPrice"),
      maxPrice: toFiniteNumber(r.maxPrice, "maxPrice"),
      limit: toFiniteNumber(r.limit, "limit"),
    };
  },
  async execute(
    args: SearchListingsArgs,
    _ctx: CapabilityContext
  ): Promise<CapabilityResult<SearchListingsData>> {
    try {
      const params: ListingSearchParams = {
        query: args.query,
        category: args.category,
        city: args.city,
        minPrice: args.minPrice,
        maxPrice: args.maxPrice,
        limit: args.limit,
      };
      const rows = await searchListingsFiltered(params);
      const listings = rows.map((l) => ({
        id: l.id,
        title: l.title,
        price: l.price,
        location: l.location,
      }));
      return { ok: true, data: { count: listings.length, listings } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "search failed" };
    }
  },
};
