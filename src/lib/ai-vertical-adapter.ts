import type { ListingCategory } from "@/lib/types";
import {
  VERTICAL_TO_LISTING_CATEGORY,
  listingCategoriesForVertical,
  resolveVerticalId,
  type VerticalId,
} from "@vauto/shared/marketplace-domain";

/**
 * Stage 18.1 (MEDIUM-1) — AI vertical adapter.
 *
 * The **set** of verticals and the listingCategory that a vertical resolves to
 * come from the canonical 13A domain model (`CANONICAL_VERTICALS` via
 * `VERTICAL_TO_LISTING_CATEGORY` / `listingCategoriesForVertical`). This module
 * is ONLY an AI-specific adapter that maps natural-language synonyms onto a
 * canonical `VerticalId` → canonical listing category → `MarketplaceFilterState`.
 *
 * It deliberately does NOT re-declare category structure, capability rules, or
 * attribute schemas — those stay in the shared domain registry. The synonym
 * lists below are a pure pronunciation/NL adapter keyed by canonical vertical.
 *
 * Fail-closed: a query that matches no recognized vertical resolves to `"all"`.
 */

/** Canonical listing category for a vertical, using the operational marketplace segment. */
function canonicalListingCategory(vertical: VerticalId): ListingCategory {
  const categories = listingCategoriesForVertical(vertical);
  // Canonical alias set is derived from the registry (ListingCategory-filterable).
  const canonical = categories.map((c) => c as ListingCategory);
  // TRANSPORT exposes two canonical segments; the marketplace operates on "vehicles".
  if (vertical === "TRANSPORT" && canonical.includes("vehicles")) return "vehicles";
  const primary = VERTICAL_TO_LISTING_CATEGORY[vertical] as ListingCategory;
  if (canonical.includes(primary)) return primary;
  return canonical[0];
}

/** Normalise: lowercase + strip diacritics ("šiauliai", "ieskoti", "butu"). */
function normDiacritics(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function hasAny(text: string, needles: readonly string[]): boolean {
  return needles.some((n) => text.includes(n));
}

interface VerticalAdapterRule {
  /** Canonical 13A vertical the synonyms resolve to (validated via resolveVerticalId). */
  verticalId: VerticalId;
  /** Pure NL synonyms keyed to the canonical vertical. Only checked; never a domain source. */
  synonyms: readonly string[];
}

/**
 * Ordered NL→vertical adapter rules. Order preserves precedence: real-estate is
 * checked first to avoid vehicle/goods overlap. Each rule resolves through
 * `resolveVerticalId` to guarantee it targets a canonical vertical.
 */
const ADAPTER_RULES: readonly VerticalAdapterRule[] = [
  {
    verticalId: "REAL_ESTATE",
    synonyms: [
      "butas", "buto", "butai", "butu", "bute", "kambari",
      "sklyp", "nekilnoj", "aruod", "patalp",
      "namas", "namo", "namu", "namai", "sodyb",
    ],
  },
  {
    verticalId: "SERVICES",
    synonyms: [
      "elektrik", "meistr", "paslaug", "santechn", "valym", "remont",
      "statyb", "plytel", "groz", "kirpej", "rangov", "dažy", "techin priez",
      // Equipment / short-term rental services (excavator, tools, transport hire)
      // resolve to SERVICES — NOT real estate. "butas nuomai" still hits REAL_ESTATE
      // via its residential noun; a bare rental word without such a noun is a service.
      "ekskavatori", "technikos nuom", "irangos nuom", "priekab", "keltuv",
    ],
  },
  {
    verticalId: "JOBS",
    synonyms: [
      "darbas", "darbo", "darbu", "darba", "atlygin", "uzmokes", "etat",
      "sandel", "vairuotoj", "kurjer", "administr", "pardavej", "kandidat",
      "hybrid", "nuotolin", "cv ",
    ],
  },
  {
    verticalId: "TRANSPORT",
    synonyms: [
      "bmw", "audi", "vw", "volkswagen", "mercedes", "benz", "toyota", "opel",
      "ford", "peugeot", "citroen", "renault", "skoda", "seat", "nissan", "honda",
      "mazda", "volvo", "kia", "hyundai", "tesla", "dacia", "suzuki", "fiat",
      "auto", "automobil", "masin", "vairas", "rida", "dyzel", "benzin", "varik",
      "sedan", "universal", "hecbek", "hatchback", "visureig", "suv", "greiciu",
    ],
  },
  {
    verticalId: "ELECTRONICS",
    synonyms: [
      "macbook", "iphone", "ipad", "telefon", "nout", "kompiuter", "televiz",
      "saldy", "skalb", "mobil", "pultas", "samsung", "xiaomi", "apple",
      "gpu", "kamera", "laptop",
    ],
  },
  {
    // OTHER_GOODS = canonical HOME_GARDEN physical goods. A pure NL adapter onto
    // the canonical vertical (resolves via resolveVerticalId → listingCategories
    // → "home"). Furniture/garden physical goods live here; ambiguous service
    // rentals (equipment hire) are captured earlier by SERVICES, and appliances
    // by ELECTRONICS (which precedes this rule). No canonical structure is
    // re-declared — only pronunciation synonyms.
    verticalId: "HOME_GARDEN",
    synonyms: [
      "sofa", "sof", "bald", "stalas", "kede", "spinta", "dvirat",
      "irat", "sodo", "velets", "tekin", "mebl", "matrac", "lova",
      "šviestuv", "kilim", "patalyn", "pagalv", "antklod", "ind", "puod",
      "leksle", "stikline", "serviz", "grilyje", "vaza", "puokste",
    ],
  },
];

/**
 * Clothing is a VAUTO presentation category (recognised by the adaptive-category
 * layer) but not a canonical 13A priority vertical. This is a pure NL-adapter
 * case: it still flows to the canonical `MarketplaceFilterState.category`, so it
 * never duplicates canonical vertical structure or capability rules.
 */
const CLOTHING_SYNONYMS: readonly string[] = [
  "suknel", "batai", "batu", "drabuz", "striuk", "megzt", "kelnes", "keln",
  "marskin", "palaid", "kepur", "kresp", "vinted", "dydis", "zara", "nike",
  "adidas", "mados",
];

/**
 * Resolve a natural-language query onto a canonical listing category
 * (`MarketplaceFilterState.category`) via the canonical 13A vertical registry.
 */
export function resolveAiVertical(query: string): ListingCategory | "all" {
  const q = normDiacritics(query);
  if (!q) return "all";

  for (const rule of ADAPTER_RULES) {
    if (!hasAny(q, rule.synonyms)) continue;
    // Guard: the adapter must always target a canonical vertical.
    const verticalId = resolveVerticalId(rule.verticalId);
    if (!verticalId) continue;
    return canonicalListingCategory(verticalId);
  }

  if (hasAny(q, CLOTHING_SYNONYMS)) {
    return "clothing";
  }

  return "all";
}
