/** Offer Engine — no-match leads, smart bargaining, wishlist matching. */

export interface NormalizedUserRequirement {
  query: string;
  category?: string;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
  size?: string;
  subcategory?: string;
  wardrobeMode: boolean;
  filters?: Record<string, unknown>;
  source: string;
}

export interface UserRequirementRow {
  id: string;
  userId: string;
  query: string;
  category?: string | null;
  city?: string | null;
  maxPrice?: number | null;
  minPrice?: number | null;
  size?: string | null;
  subcategory?: string | null;
  wardrobeMode: boolean;
  lastNotifiedListingId?: string | null;
}

export interface ListingMatchInput {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  tags: string[];
  description?: string;
  attributes?: Record<string, unknown>;
}

export function normalizeUserRequirementArgs(
  args: Record<string, unknown>
): NormalizedUserRequirement {
  const nested =
    args.requirementData && typeof args.requirementData === "object" && !Array.isArray(args.requirementData)
      ? (args.requirementData as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = { ...nested, ...args };
  delete merged.requirementData;

  const query = String(merged.query ?? merged.title ?? "").trim();
  const category = merged.category ? String(merged.category).trim() : undefined;
  const city = merged.city ? String(merged.city).trim() : undefined;
  const size = merged.size ? String(merged.size).trim() : undefined;
  const subcategory = merged.subcategory ? String(merged.subcategory).trim() : undefined;
  const maxPrice = merged.maxPrice != null ? Number(merged.maxPrice) : undefined;
  const minPrice = merged.minPrice != null ? Number(merged.minPrice) : undefined;
  const wardrobeMode =
    Boolean(merged.wardrobeMode) ||
    category === "clothing" ||
    Boolean(merged.spinta);
  const filters =
    merged.filters && typeof merged.filters === "object" && !Array.isArray(merged.filters)
      ? (merged.filters as Record<string, unknown>)
      : undefined;
  const source = String(merged.source ?? "agent").trim() || "agent";

  return {
    query,
    category,
    city,
    maxPrice: maxPrice != null && !Number.isNaN(maxPrice) ? maxPrice : undefined,
    minPrice: minPrice != null && !Number.isNaN(minPrice) ? minPrice : undefined,
    size,
    subcategory,
    wardrobeMode,
    filters,
    source,
  };
}

function tokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,.;:!?—–-]+/)
    .filter((t) => t.length >= 3);
}

function haystackForListing(listing: ListingMatchInput): string {
  const attrs = listing.attributes ?? {};
  const attrText = Object.values(attrs)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter(Boolean)
    .join(" ");
  return [
    listing.title,
    listing.location,
    listing.category,
    ...listing.tags,
    listing.description ?? "",
    attrText,
  ]
    .join(" ")
    .toLowerCase();
}

/** Structured match against user_requirements (price, category, city, tokens). */
export function listingMatchesRequirement(
  listing: ListingMatchInput,
  req: UserRequirementRow
): boolean {
  if (req.lastNotifiedListingId === listing.id) return false;

  const hay = haystackForListing(listing);
  const qTokens = tokens(req.query);
  if (qTokens.length > 0 && !qTokens.every((t) => hay.includes(t))) {
    return false;
  }

  if (req.category && req.category !== listing.category) return false;

  if (req.city) {
    const city = req.city.toLowerCase();
    if (!listing.location.toLowerCase().includes(city)) return false;
  }

  if (req.maxPrice != null && listing.price > Number(req.maxPrice)) return false;
  if (req.minPrice != null && listing.price < Number(req.minPrice)) return false;

  if (req.wardrobeMode && listing.category !== "clothing") return false;

  if (req.size) {
    const size = req.size.toLowerCase();
    const attrs = listing.attributes ?? {};
    const listingSize = String(attrs.size ?? attrs.clothingSize ?? "").toLowerCase();
    if (listingSize && !listingSize.includes(size) && !hay.includes(size)) {
      return false;
    }
  }

  if (req.subcategory) {
    const sub = req.subcategory.toLowerCase();
    if (!hay.includes(sub)) return false;
  }

  return true;
}

export function buildWishlistMatchMessage(
  req: UserRequirementRow,
  listing: ListingMatchInput
): { title: string; body: string } {
  const query = req.query.trim() || listing.title;
  return {
    title: "VAUTO: radome jūsų pageidavimą!",
    body: `Naujas skelbimas atitinka „${query}“: ${listing.title} — ${listing.price.toFixed(0)} €, ${listing.location}`,
  };
}

export const NO_MATCH_LEAD_HINT = `NO-MATCH LEAD (createUserRequirement — PRIVALOMA kai 0 rezultatų):
- Jei paieška ar UI filtrai grąžina 0 skelbimų — NEPALIK vartotojo be veiksmo ir NETYLĖK.
- Pirmiausia pasiūlyk alternatyvas: kitą kategoriją, panašias prekes, platesnę paiešką.
- Pavyzdys: „Kosminių laivų neturime, bet Jolantos spintoje yra puikių technikos prekių, o Kaune parduodamas iPhone. Galbūt jus domina elektronika?"
- Tada pasiūlyk noro fiksavimą: „Leisk man užfiksuoti tavo norą fone — pranešiu, kai atsiras!"
- Iškviesti createUserRequirement su query, category, city, size, maxPrice, wardrobeMode; papildomai searchListings su alternatyviu query jei tinka.
- Po sėkmės — trumpas šiltas patvirtinimas lietuviškai.`;

export const SMART_BARGAINING_HINT = `SPINTOS DERYBŲ TARPININKAS (proposeSmartBargaining):
- Jei elgsena rodo listing_dwell (15+ sek Spintoje) arba negotiate_click — PRIVALOMA proposeSmartBargaining.
- Įvertink kainos rėžius (Spintoje tipiškai 5–10% nuolaida).
- Pavyzdys: „Ši prekė sulaukė daug peržiūrų. Nori, padėsiu suderinti 5–10% nuolaidą tiesiogiai su pardavėju?"`;

export function buildSmartBargainingProposal(input: {
  listingPrice: number;
  listingTitle?: string;
  category?: string;
  wardrobeMode?: boolean;
}): {
  discountPercentMin: number;
  discountPercentMax: number;
  suggestedOfferMin: number;
  suggestedOfferMax: number;
  message: string;
  openerMessage: string;
  quickReplies: string[];
} {
  const price = Math.max(1, Math.round(input.listingPrice));
  const wardrobe =
    Boolean(input.wardrobeMode) || input.category === "clothing";
  const discountPercentMin = wardrobe ? 5 : 3;
  const discountPercentMax = wardrobe ? 10 : 8;
  const suggestedOfferMin = Math.max(1, Math.round(price * (1 - discountPercentMax / 100)));
  const suggestedOfferMax = Math.max(
    suggestedOfferMin,
    Math.round(price * (1 - discountPercentMin / 100))
  );
  const title = input.listingTitle?.trim() || "ši prekė";
  const openerMessage = wardrobe
    ? `Ši prekė sulaukė daug peržiūrų tavo spintoje. Nori, padėsiu suderinti ${discountPercentMin}–${discountPercentMax}% nuolaidą tiesiogiai su pardavėju?`
    : `Ši prekė sulaukė daug susidomėjimo. Nori, padėsiu suderinti ${discountPercentMin}–${discountPercentMax}% nuolaidą su pardavėju?`;
  const message = `${openerMessage} Siūlomas rėžis: ${suggestedOfferMin}–${suggestedOfferMax} € (dabartinė ${price} €).`;

  return {
    discountPercentMin,
    discountPercentMax,
    suggestedOfferMin,
    suggestedOfferMax,
    message,
    openerMessage,
    quickReplies: ["Taip, derėtis", "Ne, ačiū", "Parodyti panašius"],
  };
}

export function buildNoMatchLeadPrompt(query?: string): string {
  const q = query?.trim() || "ieškoma prekė";
  return `Matau, kad šiuo metu „${q}" neturime. Leisk man užfiksuoti tavo norą fone — pranešiu, kai atsiras!`;
}

/** P7c-agent — proactive refinement when results are overwhelming (24+). */
export const SEARCH_REFINE_HINT = `SEARCH REFINEMENT — per daug rezultatų (PRIVALOMA):
- Vartotojas mato per daug skelbimų — TU inicijuoji patikslinimą šiltu klausimu.
- PRIVALOMA naudoti updateUIFilters kai vartotojas patikslina: maxPrice, minPrice, city, subcategory, size, categoryAttributes.
- Pavyzdžiai:
  • „tik iki 500 €" → maxPrice: 500 (išlaikyk query)
  • „tik Kaune" / „mano mieste" → city normalizuotas
  • „tik iPhone 15" → query patikslintas + category electronics
  • „38 dydis" → size 38, category clothing
- Jei vartotojas atsako quick reply „Iki 500 €" — iškart updateUIFilters su maxPrice.
- Po filtro — trumpas label lietuviškai, ne ilgas sąrašas.
- Jei po patikslinimo vis dar per daug — paklausk dar vieno kriterijaus.`;
