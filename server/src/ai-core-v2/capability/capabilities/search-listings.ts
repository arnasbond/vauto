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
import { visibleCategoryOptions } from "../../../shared/category-registry.js";
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
  category: string;
  price: number;
  location: string;
  attributes?: Record<string, string | string[] | undefined>;
  snippet?: string;
}

export interface SearchListingsData {
  count: number;
  listings: SearchListingsListing[];
}

function buildSearchListingsDescription(): string {
  const catSummary = visibleCategoryOptions()
    .map((c) => `${c.id} (${c.label})`)
    .join(", ");
  return `Ieškoti aktyvių skelbimų kataloge pagal kietus filtrus (query, category, city, minPrice, maxPrice). VAUTO kategorijos (category ID): ${catSummary}.`;
}

function truncateSnippet(text: string | undefined, maxLen: number = 160): string | undefined {
  if (!text) return undefined;
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return undefined;
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
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
  description: buildSearchListingsDescription(),
  operation: "READ",
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
      const listings: SearchListingsListing[] = rows.map((l) => {
        const item: SearchListingsListing = {
          id: l.id,
          title: l.title,
          category: l.category,
          price: l.price,
          location: l.location,
        };
        if (l.attributes && Object.keys(l.attributes).length > 0) {
          item.attributes = l.attributes;
        }
        const snippet = truncateSnippet(l.description);
        if (snippet) {
          item.snippet = snippet;
        }
        return item;
      });
      return { ok: true, data: { count: listings.length, listings } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "search failed" };
    }
  },
};
