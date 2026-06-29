/** Normalized UI filter payload for marketplace grid (server-side). */
export interface UiFilterPayload {
  query?: string;
  category?: string;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
  refinements?: string[];
  categoryAttributes?: Record<string, string>;
}

/** Semantinis žodynas — klaidinga balso įvestis Spintos režime (Gemini, ne klientas). */
export const WARDROBE_VOICE_SEMANTIC_HINT = `SPINTOS KLAIDŲ TOLERAVIMAS (updateUIFilters — PRIVALOMA):
- Jei elgsena rodo /fashion, spinta_enter, wardrobe ar theme_change wardrobe — vartotojas VAUTO Spintoje.
- Klaidinga STT (pvz. „rozni kedai", „batai 42", „suknele") → updateUIFilters, NE searchListings su žodžiu „other".
- Pavyzdžiai:
  • „rozni kedai" / „raudoni kedai" → category clothing, subcategory shoes, atsakymas: „Supratau, filtruoju batelius tavo spintoje!"
  • „suknele" / „suknelė raudona" → category clothing, subcategory dresses
  • „striuke" → category clothing, subcategory jackets
- Po updateUIFilters — trumpas šiltas lietuviškas TTS atsakymas (label laukas).`;

const SUBCATEGORY_ALIASES: Record<
  string,
  { group: string; sub: string; clothingType?: string }
> = {
  shoes: { group: "Moterims", sub: "Bateliai", clothingType: "Bateliai" },
  bateliai: { group: "Moterims", sub: "Bateliai", clothingType: "Bateliai" },
  sneakers: { group: "Moterims", sub: "Sportbačiai", clothingType: "Sportbačiai" },
  kedai: { group: "Moterims", sub: "Sportbačiai", clothingType: "Sportbačiai" },
  sportbaciai: { group: "Moterims", sub: "Sportbačiai", clothingType: "Sportbačiai" },
  dresses: { group: "Moterims", sub: "Suknelės", clothingType: "Suknelės" },
  suknele: { group: "Moterims", sub: "Suknelės", clothingType: "Suknelės" },
  suknelės: { group: "Moterims", sub: "Suknelės", clothingType: "Suknelės" },
  jackets: { group: "Moterims", sub: "Striukės ir paltai", clothingType: "Striukės ir paltai" },
  striuke: { group: "Moterims", sub: "Striukės ir paltai", clothingType: "Striukės ir paltai" },
  pants: { group: "Moterims", sub: "Kelnės ir džinsai", clothingType: "Kelnės ir džinsai" },
  kelnes: { group: "Moterims", sub: "Kelnės ir džinsai", clothingType: "Kelnės ir džinsai" },
};

const SCREEN_ROUTES: Record<
  string,
  { path: string; activateWardrobe?: boolean; zeroUi?: string; view?: string }
> = {
  fashion: { path: "/fashion/", activateWardrobe: true, zeroUi: "marketplace" },
  spinta: { path: "/fashion/", activateWardrobe: true, zeroUi: "marketplace" },
  wardrobe: { path: "/fashion/", activateWardrobe: true, zeroUi: "marketplace" },
  vauto_spinta: { path: "/fashion/", activateWardrobe: true, zeroUi: "marketplace" },
  marketplace: { path: "/", zeroUi: "marketplace" },
  search: { path: "/", zeroUi: "marketplace" },
  home: { path: "/" },
  discover: { path: "/discover/" },
  add_listing: { path: "/add/", view: "add_listing" },
  upload: { path: "/add/", view: "add_listing" },
  seller: { path: "/add/", view: "seller_wizard" },
  seller_wizard: { path: "/add/", view: "seller_wizard" },
  listing_preview: { path: "/", zeroUi: "listing_preview" },
  business_dashboard: { path: "/profile/", zeroUi: "business_dashboard" },
  profile: { path: "/profile/", view: "profile" },
  admin_panel: { path: "/admin/ai/", zeroUi: "admin_panel" },
  chats: { path: "/chats/", view: "chats" },
};

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function resolveSubcategoryAttributes(
  subcategory?: string
): Record<string, string> | undefined {
  if (!subcategory?.trim()) return undefined;
  const key = normKey(subcategory);
  const hit = SUBCATEGORY_ALIASES[key];
  if (!hit) {
    return {
      clothingType: subcategory.trim(),
      fashionCategory: subcategory.trim(),
    };
  }
  const fashionCategory = `${hit.group} › ${hit.sub}`;
  const attrs: Record<string, string> = { fashionCategory };
  if (hit.clothingType) attrs.clothingType = hit.clothingType;
  return attrs;
}

export interface NormalizedUIFilters {
  filters: UiFilterPayload;
  categoryAttributes: Record<string, string>;
  label: string;
  activateWardrobe: boolean;
  query?: string;
}

export function normalizeUpdateUIFiltersArgs(
  args: Record<string, unknown>
): NormalizedUIFilters {
  const nested =
    args.filters && typeof args.filters === "object" && !Array.isArray(args.filters)
      ? (args.filters as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = { ...nested, ...args };
  delete merged.filters;

  const category = merged.category ? String(merged.category).trim() : undefined;
  const subcategory = merged.subcategory ? String(merged.subcategory).trim() : undefined;
  const query = merged.query ? String(merged.query).trim() : undefined;
  const city = merged.city
    ? String(merged.city).trim()
    : merged.location
      ? String(merged.location).trim()
      : undefined;
  const size = merged.size ? String(merged.size).trim() : undefined;
  const conditionRaw = merged.condition ? String(merged.condition).toLowerCase() : undefined;
  const minPrice = merged.minPrice != null ? Number(merged.minPrice) : undefined;
  const maxPrice = merged.maxPrice != null ? Number(merged.maxPrice) : undefined;
  const label =
    String(merged.label ?? "").trim() ||
    (category === "clothing" && subcategory
      ? "Supratau, filtruoju batelius tavo spintoje!"
      : "Filtrai atnaujinti.");

  const categoryAttributes: Record<string, string> = {};
  if (merged.categoryAttributes && typeof merged.categoryAttributes === "object") {
    Object.assign(
      categoryAttributes,
      Object.fromEntries(
        Object.entries(merged.categoryAttributes as Record<string, unknown>).map(([k, v]) => [
          k,
          String(v),
        ])
      )
    );
  }
  const subAttrs = resolveSubcategoryAttributes(subcategory);
  if (subAttrs) Object.assign(categoryAttributes, subAttrs);
  if (size) categoryAttributes.size = size;

  const refinements: string[] = [];
  if (conditionRaw === "new" || conditionRaw === "naudota" || conditionRaw === "used") {
    refinements.push(conditionRaw === "new" ? "new" : "used");
  }

  const filters: UiFilterPayload = {
    query: query || undefined,
    category,
    city: city || undefined,
    minPrice: minPrice != null && !Number.isNaN(minPrice) ? minPrice : undefined,
    maxPrice: maxPrice != null && !Number.isNaN(maxPrice) ? maxPrice : undefined,
    refinements: refinements.length ? refinements : undefined,
    categoryAttributes: Object.keys(categoryAttributes).length ? categoryAttributes : undefined,
  };

  const activateWardrobe =
    category === "clothing" ||
    Boolean(merged.activateWardrobe) ||
    Boolean(merged.wardrobeMode);

  return {
    filters,
    categoryAttributes,
    label,
    activateWardrobe,
    query,
  };
}

export function resolveNavigateScreen(screenRaw: string): {
  ok: boolean;
  screen: string;
  path: string;
  activateWardrobe?: boolean;
  zeroUi?: string;
  view?: string;
  message: string;
} {
  const key = normKey(screenRaw);
  const route = SCREEN_ROUTES[key];
  if (!route) {
    return {
      ok: false,
      screen: screenRaw,
      path: "/",
      message: `Nežinomas ekranas „${screenRaw}". Galimi: fashion, spinta, add_listing, marketplace, profile, chats.`,
    };
  }
  return {
    ok: true,
    screen: screenRaw,
    path: route.path,
    activateWardrobe: route.activateWardrobe,
    zeroUi: route.zeroUi,
    view: route.view,
    message: `Atidaromas ekranas: ${screenRaw}.`,
  };
}
