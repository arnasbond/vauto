import { getCategoryCapabilities } from "./queries.js";
import { getVertical } from "./registry.js";
import { resolveVerticalId, verticalIdToUiSlug } from "./legacy.js";
import type {
  CategoryCapabilities,
  ListingKind,
  VerticalId,
  VerticalUiSlug,
} from "./types.js";

/** Draft attribute key — survives isolation so the chat keeps the canonical vertical. */
export const CANONICAL_VERTICAL_ATTR_KEY = "_canonicalVertical";

/** ListingCategory-compatible slugs used by the seller draft (not 13A IDs). */
export const VERTICAL_TO_LISTING_CATEGORY: Record<VerticalId, string> = {
  TRANSPORT: "transport",
  REAL_ESTATE: "real_estate",
  ELECTRONICS: "electronics",
  SERVICES: "services",
  JOBS: "jobs",
  HOME_GARDEN: "home",
  CLOTHING: "clothing",
  OTHER: "other",
};

export type AddListingSearchState = {
  isFashion: boolean;
  verticalId: VerticalId | null;
  uiSlug: VerticalUiSlug | null;
};

const EMPTY_ADD_SEARCH: AddListingSearchState = {
  isFashion: false,
  verticalId: null,
  uiSlug: null,
};

export type CanonicalListingFlowContext = {
  verticalId: VerticalId;
  uiSlug: VerticalUiSlug;
  listingCategory: string;
  label: string;
  listingKind: ListingKind;
  attributeKeys: readonly string[];
  capabilities: CategoryCapabilities;
  welcome: string;
};

function searchParamsOf(search: string | URLSearchParams): URLSearchParams {
  if (search instanceof URLSearchParams) return search;
  const raw = String(search ?? "").trim();
  if (!raw) return new URLSearchParams();
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/")) {
    const q = raw.indexOf("?");
    return new URLSearchParams(q >= 0 ? raw.slice(q + 1) : "");
  }
  return new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
}

/** Read /add ?vertical= / ?verticalId= — fashion is not a 13A root. */
export function parseAddListingSearch(
  search: string | URLSearchParams
): AddListingSearchState {
  const params = searchParamsOf(search);
  const vertical = (params.get("vertical") ?? "").trim();
  const verticalIdRaw = (params.get("verticalId") ?? "").trim();
  if (vertical.toLowerCase() === "fashion") {
    return { isFashion: true, verticalId: null, uiSlug: null };
  }
  const verticalId =
    resolveVerticalId(verticalIdRaw) ?? resolveVerticalId(vertical);
  if (!verticalId) return EMPTY_ADD_SEARCH;
  return {
    isFashion: false,
    verticalId,
    uiSlug: verticalIdToUiSlug(verticalId),
  };
}

/** Guest → login return path. Unknown slug stays /add (fail-closed). */
export function addListingReturnPath(input: {
  isFashion?: boolean;
  uiSlug?: string | null;
  verticalId?: VerticalId | null;
}): string {
  if (input.isFashion) return "/add?vertical=fashion";
  const id = input.verticalId ?? resolveVerticalId(input.uiSlug);
  if (!id) return "/add";
  return `/add?vertical=${verticalIdToUiSlug(id)}`;
}

export function listingCategoryForVertical(id: VerticalId): string {
  return VERTICAL_TO_LISTING_CATEGORY[id];
}

export function buildCanonicalSellerWelcome(id: VerticalId): string {
  const schema = getVertical(id);
  const caps = schema.capabilities;
  const parts = [
    `Pasirinkote ${schema.label}. Aprašykite objektą laisvai. AI padeda su antrašte ir detalėmis — skelbimą tvirtinate jūs.`,
  ];
  if (id === "ELECTRONICS") {
    parts.push(
      "Ši kategorija naudoja elektronikos laukus; transporto specifikacijos nenaudojamos."
    );
  }
  if (id === "JOBS") {
    parts.push("Nurodykite pareigas ir sąlygas.");
  }
  if (!caps.supportsPlatformPayment) {
    parts.push("Šioje kategorijoje platformos mokėjimas netaikomas.");
  }
  if (!caps.supportsShipping && id !== "ELECTRONICS") {
    parts.push("Siunta šiai kategorijai netaikoma.");
  }
  return parts.join(" ");
}

export function buildCanonicalListingFlowContext(
  id: VerticalId
): CanonicalListingFlowContext {
  const schema = getVertical(id);
  return {
    verticalId: id,
    uiSlug: schema.uiSlug,
    listingCategory: listingCategoryForVertical(id),
    label: schema.label,
    listingKind: schema.listingKind,
    attributeKeys: schema.attributes.map((a) => a.key),
    capabilities: getCategoryCapabilities(id),
    welcome: buildCanonicalSellerWelcome(id),
  };
}

/** /add grid pick → login redirect → parse URL → listing context. */
export function simulateAddAuthRoundTrip(selectedSlug: string): {
  returnPath: string;
  parsed: AddListingSearchState;
  context: CanonicalListingFlowContext | null;
} {
  const returnPath = addListingReturnPath({ uiSlug: selectedSlug });
  const parsed = parseAddListingSearch(returnPath);
  return {
    returnPath,
    parsed,
    context: parsed.verticalId
      ? buildCanonicalListingFlowContext(parsed.verticalId)
      : null,
  };
}
