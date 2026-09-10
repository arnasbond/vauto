/**
 * Explicit client concept of active semantic surface / goal.
 *
 * SELL/CREATE owns the primary interaction surface when a listing draft is
 * being created/edited conversationally (`hasListingDraft`) or a seller-wizard
 * step is active (`sellerStep !== "idle"`). In that state the catalog search
 * scaffold (filter bar, results grid, zero-result empty state) must not be
 * presented as the result of the SELL turn.
 *
 * STATE PRESERVATION ≠ SURFACE VISIBILITY: returning to SEARCH must not have
 * lost prior catalog state. This resolver only decides *which surface is
 * visible*, never which state is kept.
 *
 * Extensible for future WANTED / DEAL / NEGOTIATION / business surfaces.
 */

export type ActiveSurface = "idle" | "search" | "sell_create";

export interface ActiveSurfaceInput {
  /** SellerFlowStep: "idle" | "recording" | "processing" | "confirmation" | "published". */
  sellerStep: string;
  /** True when an active listing draft exists (agent conversational sell). */
  hasListingDraft: boolean;
  /** Canonical search query (trimmed). */
  searchQuery: string;
}

export function resolveActiveSurface(input: ActiveSurfaceInput): ActiveSurface {
  if (input.sellerStep !== "idle" || input.hasListingDraft) {
    return "sell_create";
  }
  if (input.searchQuery.trim().length >= 3) {
    return "search";
  }
  return "idle";
}

/** The catalog search scaffold is visible only when SELL/CREATE does not own the surface. */
export function catalogSurfaceVisible(surface: ActiveSurface): boolean {
  return surface !== "sell_create";
}
