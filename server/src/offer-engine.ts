/** Offer Engine — no-match leads & smart bargaining (server-side). */

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

export const NO_MATCH_LEAD_HINT = `NO-MATCH LEAD (createUserRequirement — PRIVALOMA kai 0 rezultatų):
- Jei paieška ar UI filtrai grąžina 0 skelbimų — NEPALIK vartotojo be veiksmo.
- Pasiūlyk: „Matau, kad šiuo metu tokios prekės neturime. Leisk man užfiksuoti tavo norą fone!"
- Iškviesti createUserRequirement su query, category, city, size, maxPrice, wardrobeMode.
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
    ? `Ši prekė sulaukė daug peržiūrų Jolantos spintoje. Nori, padėsiu suderinti ${discountPercentMin}–${discountPercentMax}% nuolaidą tiesiogiai su pardavėju?`
    : `Ši prekė sulaukė daug susidomėjimo. Nori, padėsiu suderinti ${discountPercentMin}–${discountPercentMax}% nuolaidą su pardavėju?`;
  const message = `${openerMessage} Siūlomas rėžis: ${suggestedOfferMin}–${suggestedOfferMax} € (dabartinė ${price} €).`;

  return {
    discountPercentMin,
    discountPercentMax,
    suggestedOfferMin,
    suggestedOfferMax,
    message,
    openerMessage,
  };
}

export function buildNoMatchLeadPrompt(query?: string): string {
  const q = query?.trim() || "ieškoma prekė";
  return `Matau, kad šiuo metu „${q}" neturime. Leisk man užfiksuoti tavo norą fone — pranešiu, kai atsiras!`;
}
