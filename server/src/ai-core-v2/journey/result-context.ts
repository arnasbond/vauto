/**
 * VAUTO AI Core v2.5 — grounded result continuity.
 *
 * Retains the structured result context from a search turn so a follow-up can
 * naturally refer to a returned listing without restating its id. The MODEL
 * resolves the conversational reference; DETERMINISTIC code only validates
 * that the referenced listing actually exists in the previously grounded
 * result set. No regex/ordinal phrase cages, no invented facts.
 */
import type { SearchListingsData } from "../capability/capabilities/search-listings.js";

export interface GroundedListing {
  id: string;
  title: string;
  price: number;
  location: string;
}

export interface ResultContext {
  listings: GroundedListing[];
}

export const EMPTY_RESULT_CONTEXT: ResultContext = { listings: [] };

/** Build a result context from a grounded searchListings result. */
export function resultContextFromSearch(data: SearchListingsData | undefined): ResultContext {
  if (!data) return EMPTY_RESULT_CONTEXT;
  return {
    listings: data.listings.map((l) => ({
      id: l.id,
      title: l.title,
      price: l.price,
      location: l.location,
    })),
  };
}

/**
 * Resolve a model-provided reference to a grounded listing id.
 * Accepts an exact listing id, or a 1-based numeric position into the result
 * set. Returns null when the reference cannot be grounded (fail closed).
 */
export function resolveListingReference(reference: string, ctx: ResultContext): string | null {
  const ref = String(reference ?? "").trim();
  if (!ref) return null;
  if (ctx.listings.some((l) => l.id === ref)) return ref;
  const n = Number(ref);
  if (Number.isInteger(n) && n >= 1 && n <= ctx.listings.length) {
    return ctx.listings[n - 1]!.id;
  }
  return null;
}

/** Deterministic guard: is a listing id present in the grounded result set? */
export function isGroundedListing(id: string, ctx: ResultContext): boolean {
  return ctx.listings.some((l) => l.id === id);
}
