/**
 * @deprecated Stage 20B.1 — "portal listing filter" semantics are deprecated.
 *
 * Compatibility bridge for existing importers. All logic lives in
 * `@/lib/vertical-listing-filter`. New code must import from there.
 */
export {
  categoriesForVertical,
  verticalIdForQuery,
  inferStrictCategory,
  filterListingsForVertical,
  verticalRankedListings,
  sanitizeSearchQuery,
} from "@/lib/vertical-listing-filter";
export type { VerticalPresentationId } from "@/lib/vertical-presentation";
