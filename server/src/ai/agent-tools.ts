import { adminPatchListing, getListings, searchListingsFiltered, updateListing } from "../repository.js";
import {
  getDemoApiListings,
  toAgentListingSummary,
} from "../demo-catalog-api.js";
import {
  enrichVehicleListingDraftFromArgs,
  mergeVehicleToolArgs,
} from "./vehicle-attribute-extract.js";
import {
  LT_LOCATION_AGENT_HINT,
  normCityForFilter,
  resolveLtCityNominative,
} from "./lithuanian-location-normalize.js";
import { buildSellerContextualVoiceFollowUp, buildCreateListingDraftFollowUp } from "./seller-voice-prompt.js";
import { resolveAgentDefaultCity } from "./zero-ui-defaults.js";
import { runMarketPriceAnalysis, type MarketPriceAnalysisResult } from "./market-price-analysis.js";
import {
  buildProactivePricingMessage,
  buildProactiveSearchResetMessage,
} from "./proactive-agent.js";
import { scheduleDeferredListingMarketAnalysis } from "./background-market-analysis.js";
import { hasAiKey, visionExtractJson } from "./llm-provider.js";
import { analyzeChatShield } from "./chat-shield.js";
import type { MyListingForAgent } from "./user-agent-context.js";
import {
  buildBusinessProUpsellMessage,
  buildMicroPaymentVoiceReply,
  defaultPriceForProduct,
  inferMicroPaymentProduct,
  requiresBusinessProForRegionStats,
  resolveMonetizationState,
  type MonetizationState,
} from "./monetization-engine.js";

const ZERO_UI_SCREENS = [
  "marketplace",
  "listing_preview",
  "business_dashboard",
  "admin_panel",
] as const;

type ZeroUiScreen = (typeof ZERO_UI_SCREENS)[number];

function isZeroUiScreen(value: string): value is ZeroUiScreen {
  return (ZERO_UI_SCREENS as readonly string[]).includes(value);
}

const VALID_APP_VIEWS = [
  "home",
  "discover",
  "search_results",
  "add_listing",
  "seller_wizard",
  "chats",
  "profile",
  "admin_ai",
] as const;

type AppView = (typeof VALID_APP_VIEWS)[number];

function isAppView(value: string): value is AppView {
  return (VALID_APP_VIEWS as readonly string[]).includes(value);
}

function normalizeViewParams(args: Record<string, unknown>): Record<string, string> {
  const raw = args.params;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value != null && String(value).trim()) out[key] = String(value).trim();
  }
  return out;
}

export interface AgentListingSummary {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  description?: string;
}

export interface AgentToolContext {
  userCity: string;
  userRole: "buyer" | "seller" | "business" | "admin";
  contact: string;
  userName?: string;
  authUserId?: string;
  activeListingId?: string;
  activeListingTitle?: string;
  myListings?: MyListingForAgent[];
  listingsSnapshot?: AgentListingSummary[];
  searchSessionReset?: boolean;
  monetization?: MonetizationState;
  listingDraft?: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
    attributes?: Record<string, string>;
  };
}

const VISION_LISTING_SCHEMA = `{
  "title": "string",
  "price": "number",
  "location": "string",
  "description": "string",
  "category": "vehicles | electronics | real_estate | clothing | services | home | other",
  "confidence": "number 0-1",
  "attributes": {
    "color": "string — spalva",
    "bodyType": "string — kėbulo tipas (sedanas, hečbekas, SUV…)",
    "fuelType": "string",
    "make": "string",
    "model": "string",
    "year": "string",
    "mileage": "string",
    "condition": "string — nauja/naudota",
    "rooms": "string — kambarių skaičius",
    "area": "string — plotas m²",
    "equipment": "string — įrengimas/baldai/technika",
    "partType": "string"
  }
}`;

const VISION_FIELD_LABELS: Record<string, string> = {
  color: "spalva",
  bodyType: "kėbulo tipas",
  fuelType: "kuro tipas",
  make: "markė",
  model: "modelis",
  year: "metai",
  mileage: "rida",
  condition: "būklė",
  rooms: "kambarių skaičius",
  area: "plotas",
  equipment: "įrengimas",
  partType: "dalies tipas",
};

function parseVisionAttributes(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null || v === "") continue;
    out[k] = String(v).trim();
  }
  return out;
}

function collectFilledVisionLabels(attributes: Record<string, string>): string[] {
  return Object.keys(attributes)
    .filter((k) => attributes[k]?.trim())
    .map((k) => VISION_FIELD_LABELS[k] ?? k);
}

export function buildSmartPriceAdvisorMessage(
  userName: string | undefined,
  proposedPrice: number,
  analysis: MarketPriceAnalysisResult
): string {
  const firstName = (userName ?? "drauge").split(/\s+/)[0] || "drauge";

  if (proposedPrice <= 0) {
    return analysis.message;
  }

  if (!analysis.medianPrice || analysis.sampleSize < 1) {
    return `${firstName}, ${proposedPrice} € įrašiau — ${analysis.message.toLowerCase()}`;
  }

  const median = analysis.medianPrice;
  const ratio = proposedPrice / median;

  if (ratio <= 0.92) {
    return `${firstName}, ${proposedPrice} € — puiki kaina! VAUTO duomenimis panašūs skelbimai ~${median} € — esi konkurencingas.`;
  }
  if (ratio <= 1.08) {
    return `${firstName}, ${proposedPrice} € — kaip tik viduryje! Pagal ${analysis.sampleSize} panašius skelbimus vidurkis ~${median} €.`;
  }
  if (ratio <= 1.2) {
    return `${firstName}, ${proposedPrice} € šiek tiek virš vidurkio (~${median} €). Vis dar realu — jei nori greičiau parduoti, galime nusileisti 5–8 %.`;
  }
  return `${firstName}, ${proposedPrice} € žymiai aukščiau rinkos (~${median} €). Kaip brokeris patarsiu: apsvarstyk ${Math.round(median * 1.02)}–${Math.round(median * 1.05)} € greitesniam pardavimui.`;
}

function buildVisionScanAnnouncement(
  userName: string | undefined,
  labels: string[]
): string {
  const firstName = (userName ?? "drauge").split(/\s+/)[0] || "drauge";
  if (!labels.length) {
    return `${firstName}, nuotraukas peržiūrėjau — reikia dar kelių detalių. Kokią kainą planuoji?`;
  }
  if (labels.length === 1) {
    return `${firstName}, pagal nuotraukas jau užpildžiau ${labels[0]!} lauką!`;
  }
  const last = labels[labels.length - 1]!;
  const rest = labels.slice(0, -1).join(", ");
  return `${firstName}, pagal nuotraukas jau užpildžiau ${rest} ir ${last} laukus!`;
}

async function runVisionListingScan(
  imageUrls: string[],
  opts: {
    category?: string;
    city?: string;
    userCity: string;
    existingDraft?: AgentToolContext["listingDraft"];
  }
): Promise<{
  draft: {
    title: string;
    description?: string;
    price: number;
    location: string;
    contact: string;
    category: string;
    confidence: number;
    attributes?: Record<string, string>;
  };
  filledFieldLabels: string[];
  voiceAnnouncement: string;
}> {
  if (!hasAiKey()) {
    throw new Error("GEMINI_API_KEY not configured for vision scan");
  }

  const urls = imageUrls.filter(Boolean).slice(0, 6);
  if (!urls.length) {
    throw new Error("imageUrls are required for vision scan");
  }

  const city = opts.city?.trim()
    ? resolveAgentDefaultCity(opts.city)
    : opts.userCity;

  const raw = await visionExtractJson(
    `Nuskenuok prekės/objekto nuotraukas ir užpildyk techninius laukus lietuviškam skelbimui.
Automobiliui — make, model, year, color, bodyType, fuelType, mileage, condition.
NT — rooms, area, equipment. Elektronikai — condition, color.
JSON: ${VISION_LISTING_SCHEMA}. Miestas: ${city}. Kategorija hint: ${opts.category ?? "auto"}.`,
    urls
  );

  const visionAttrs = parseVisionAttributes(raw.attributes);
  const base = opts.existingDraft ?? {};
  const mergedAttrs = {
    ...(base.attributes ?? {}),
    ...visionAttrs,
  };

  const enriched = enrichVehicleListingDraftFromArgs(
    String(raw.title ?? base.title ?? "Skelbimas"),
    String(raw.description ?? base.description ?? ""),
    String(raw.category ?? base.category ?? opts.category ?? "other"),
    mergedAttrs
  );

  const filledFieldLabels = collectFilledVisionLabels(visionAttrs);

  const draft = {
    title: enriched.title,
    description: enriched.description,
    price: Number(raw.price) || base.price || 0,
    location: String(raw.location ?? base.location ?? city),
    contact: "",
    category: enriched.category,
    confidence: Number(raw.confidence) || 0.88,
    attributes: enriched.attributes,
  };

  return {
    draft,
    filledFieldLabels,
    voiceAnnouncement: "",
  };
}

export const AGENT_FUNCTION_DECLARATIONS = [
  {
    name: "markListingSold",
    description:
      'Pažymi vartotojo skelbimą kaip parduotą / archyvuoja. Naudok kai vartotojas sako „pardaviau“, „jau parduota“, „archyvuok“. Jei vienas aktyvus skelbimas — listingId galima praleisti.',
    parameters: {
      type: "OBJECT",
      properties: {
        listingId: { type: "STRING", description: "Skelbimo id iš [Vartotojo profilis]" },
        titleHint: {
          type: "STRING",
          description: "Dalis pavadinimo, jei vartotojas mini konkretų skelbimą",
        },
      },
    },
  },
  {
    name: "create_listing_draft",
    description:
      "Pradeda NAUJĄ skelbimo juodraštį kai vartotojas nori PARDUOTI, ĮKELTI ar PASKELBTI prekę. PRIVALOMA vietoj searchListings pardavimo intencijai. Pvz. „Padėk parduoti suknelę\" → category=clothing, title=Suknelė. NEreikalauja kainos ar miesto.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: {
          type: "STRING",
          description:
            "Pagrindinis objektas lietuviškai BE stop-žodžių: Suknelė, Kedai, BMW 320d, Sklypas",
        },
        category: {
          type: "STRING",
          description:
            "vehicles | electronics | real_estate | clothing | services | jobs | home | other",
        },
        description: { type: "STRING", description: "Trumpas aprašymas jei žinomas" },
        attributes: {
          type: "OBJECT",
          description: "color, size, make, model, year, propertyType, clothingSize…",
        },
      },
      required: ["title", "category"],
    },
  },
  {
    name: "updateListingDraft",
    description:
      "Atnaujina esamą skelbimo juodraštį (kaina, miestas, aprašymas). Naudok kai trūksta vieno lauko ir vartotojas jį pateikia.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        price: { type: "NUMBER" },
        city: { type: "STRING" },
        category: { type: "STRING" },
        attributes: { type: "OBJECT" },
      },
    },
  },
  {
    name: "searchListings",
    description:
      "Ieško aktyvių skelbimų. query PRIVALO turėti raktinius žodžius (pvz. Volvo, batai, namas). Kategoriją nustatyk semantiškai.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description: "Paieškos raktiniai žodžiai — pvz. Volvo, batai, namas",
        },
        category: {
          type: "STRING",
          description:
            "vehicles | electronics | real_estate | clothing | services | jobs | home | other",
        },
        maxPrice: { type: "NUMBER" },
        minPrice: { type: "NUMBER" },
        city: {
          type: "STRING",
          description:
            "Lietuvos miestas vardininku (Panevėžys, Biržai, Rokiškis) — normalizuok iš bet kurio linksnio (Panevėžyje, Biržuose, Rokiškio)",
        },
        limit: { type: "INTEGER" },
      },
    },
  },
  {
    name: "postNewListing",
    description:
      "Paruošia naują skelbimo juodraštį patvirtinimui. Naudok kai vartotojas nori parduoti / įdėti skelbimą. Sugeneruok profesionalų aprašymą lietuviškai. AUTOMOBILIAMS (category=vehicles): PRIVALOMA iš balso ar teksto ištraukti markę (make), modelį (model) ir metus (year) — per atskirus laukus arba attributes.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        price: { type: "NUMBER" },
        city: { type: "STRING" },
        category: {
          type: "STRING",
          description: "vehicles | electronics | real_estate | clothing | services | jobs | home | other",
        },
        make: {
          type: "STRING",
          description:
            "Automobilio markė (vehicles): BMW, Volkswagen, Toyota, Citroën, Mercedes-Benz ir pan.",
        },
        model: {
          type: "STRING",
          description: "Automobilio modelis (vehicles): Golf, 520, Corolla, DS5 ir pan.",
        },
        year: {
          type: "INTEGER",
          description: "Pirmos registracijos / pagaminimo metai (vehicles), pvz. 2018",
        },
        imageUrls: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Cloudinary arba HTTPS nuotraukų URL",
        },
        attributes: {
          type: "OBJECT",
          description:
            "Papildomi techniniai laukai. Automobiliams čia taip pat gali būti make, model, year, mileage, fuelType, vin.",
        },
      },
      required: ["title", "description", "category", "city"],
    },
  },
  {
    name: "analyzeMarketPrice",
    description:
      "Smart Price Advisor — lygina vartotojo kainą su VAUTO vidine DB pagal kategoriją, lokaciją, markę/modelį. PRIVALOMA kai vartotojas pasako kainą — perduok proposedPrice.",
    parameters: {
      type: "OBJECT",
      properties: {
        brand: { type: "STRING" },
        model: { type: "STRING" },
        year: { type: "INTEGER" },
        category: { type: "STRING" },
        city: { type: "STRING" },
        proposedPrice: {
          type: "NUMBER",
          description: "Vartotojo pasakyta ar įvesta kaina EUR — brokerio patarimui",
        },
        title: {
          type: "STRING",
          description: "Skelbimo pavadinimas jei nėra make/model",
        },
      },
    },
  },
  {
    name: "scanListingPhotos",
    description:
      "Gemini Vision — nuskenuoja įkeltas nuotraukas ir automatiškai užpildo techninius laukus (spalva, kėbulas, kambariai, įrengimas…). Naudok kai vartotojas įkėlė nuotraukas ar yra [Nuotraukos įkeltos] blokas.",
    parameters: {
      type: "OBJECT",
      properties: {
        imageUrls: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "HTTPS arba data: URL nuotraukų",
        },
        category: { type: "STRING" },
        city: { type: "STRING" },
      },
      required: ["imageUrls"],
    },
  },
  {
    name: "trackUserError",
    description:
      "Proaktyviai reaguoja į sistemos klaidą (pvz. per didelė nuotrauka, upload failed). Pasiūlyk sprendimą vartotojui.",
    parameters: {
      type: "OBJECT",
      properties: {
        errorCode: { type: "STRING" },
        context: { type: "STRING" },
        userMessage: { type: "STRING" },
      },
      required: ["errorCode", "context"],
    },
  },
  {
    name: "blockListing",
    description:
      "Administratoriaus įrankis — pažymi skelbimą kaip įtartiną moderavimui (sukčiai, nelegalūs daiktai).",
    parameters: {
      type: "OBJECT",
      properties: {
        listingId: { type: "STRING" },
        reason: { type: "STRING" },
      },
      required: ["listingId", "reason"],
    },
  },
  {
    name: "registerWanted",
    description:
      "Registruoja pirkėjo pageidavimą pageidavimų sąraše, kai paieška grąžina 0 rezultatų. Naudok kartu su tuščios paieškos atsakymu.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Paieškos užklausa lietuviškai" },
      },
      required: ["query"],
    },
  },
  {
    name: "triggerMicroPayment",
    description:
      "Zero-UI mikro-mokėjimas. Smart Boost: C2C 2.99 €, B2B 29.99 €. Lead Gen verslui: 14.99 €. Gili regiono statistika — tik Business Pro (199 €/mėn.), nemokamam B2B triggerMicroPayment NENAUDOK — siūlyk Pro planą.",
    parameters: {
      type: "OBJECT",
      properties: {
        reason: {
          type: "STRING",
          description: "Trumpas mokėjimo paskirties aprašymas lietuviškai",
        },
        price: {
          type: "NUMBER",
          description:
            "Suma EUR — palik 0 kad sistema pritaikytų: C2C boost 2.99, B2B boost 29.99, lead 14.99",
        },
      },
      required: ["reason", "price"],
    },
  },
  {
    name: "showZeroUiScreen",
    description:
      "Perjungia pagrindinį Zero-UI ekraną be tradicinės navigacijos. marketplace=paieška/srautas; listing_preview=skelbimo juodraštis; business_dashboard=verslo statistika; admin_panel=moderavimas.",
    parameters: {
      type: "OBJECT",
      properties: {
        screen: {
          type: "STRING",
          description:
            "marketplace | listing_preview | business_dashboard | admin_panel",
        },
      },
      required: ["screen"],
    },
  },
  {
    name: "navigate_view",
    description:
      "Perjungia programėlės vaizdą (Zero-UI). Pardavimui / skelbimo kėlimui → add_listing arba seller_wizard. Paieškai → search_results su params.query. Nenaudok search_results jei vartotojas nori kelti skelbimą.",
    parameters: {
      type: "OBJECT",
      properties: {
        view: {
          type: "STRING",
          description:
            "home | discover | search_results | add_listing | seller_wizard | chats | profile | admin_ai",
        },
        params: {
          type: "OBJECT",
          description:
            "Papildomi parametrai, pvz. { category: 'vehicles' }, { query: 'iPhone' }, { slug: 'listing-id' }",
        },
      },
      required: ["view"],
    },
  },
  {
    name: "addToFavorites",
    description:
      "Prideda aktyvu ar nurodyta skelbima i megstamiausius. Naudok kai vartotojas sako idiek i isimintus ar issaugok sita.",
    parameters: {
      type: "OBJECT",
      properties: {
        listingId: {
          type: "STRING",
          description: "Skelbimo id; jei praleista — naudok active_listing_id iš [UI kontekstas]",
        },
      },
    },
  },
  {
    name: "dismissActiveListing",
    description:
      "Atmeta aktyvu skelbima arba pereina prie kito sarase. Naudok atmesk sita, sekantis, kitas skelbimas.",
    parameters: {
      type: "OBJECT",
      properties: {
        mode: {
          type: "STRING",
          description: "next — sekantis skelbimas; close — uždaryti peržiūrą",
        },
      },
    },
  },
  {
    name: "applyBrowseFilter",
    description:
      "Voice-Driven UI — pritaiko narsymo filtra be pilnos paieskos. Pvz. parodyk tik mechanines -> gearbox Mechanine.",
    parameters: {
      type: "OBJECT",
      properties: {
        category: { type: "STRING" },
        gearbox: { type: "STRING", description: "Mechaninė | Automatinė" },
        fuelType: { type: "STRING" },
        bodyType: { type: "STRING" },
        label: { type: "STRING", description: "Trumpas filtro pavadinimas TTS" },
      },
    },
  },
  {
    name: "ghostCallerShield",
    description:
      "Ghost Caller Shield — analizuoja pirkėjo žinutę pokalbyje (per žemas pasiūlymas, agresija, perpardavinėtojas) ir grąžina mandagų auto-atsakymą pardavėjui.",
    parameters: {
      type: "OBJECT",
      properties: {
        message: { type: "STRING" },
        listingPrice: { type: "NUMBER" },
        listingTitle: { type: "STRING" },
        sellerName: { type: "STRING" },
      },
      required: ["message", "listingPrice", "listingTitle"],
    },
  },
];

async function resolveListings(ctx: AgentToolContext): Promise<AgentListingSummary[]> {
  if (ctx.listingsSnapshot?.length) return ctx.listingsSnapshot;
  try {
    const rows = await getListings();
    const summaries = rows
      .filter((l) => l.status !== "sold" && !l.banned)
      .map((l) => toAgentListingSummary(l));
    if (summaries.length > 0) return summaries;
  } catch {
    /* fall through to bundled demo */
  }
  return getDemoApiListings()
    .filter((l) => l.status !== "sold" && !l.banned)
    .map((l) => toAgentListingSummary(l));
}

function normCity(loc: string): string {
  return normCityForFilter(loc);
}

export { LT_LOCATION_AGENT_HINT };

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentToolContext
): Promise<{ result: unknown; sideEffect?: AgentSideEffect }> {
  const listings = await resolveListings(ctx);

  switch (name) {
    case "searchListings": {
      const query = String(args.query ?? "").trim();
      const category = args.category ? String(args.category) : undefined;

      if (!query) {
        const searchQuery = query || "paieška";
        return {
          result: {
            count: 0,
            listings: [],
            summary: "Paieškos query negali būti tuščias — perduok tik objektą (pvz. Volvo, namas, kedai).",
          },
          sideEffect: {
            type: "empty_search",
            searchQuery,
          },
        };
      }
      const maxPrice = args.maxPrice != null ? Number(args.maxPrice) : undefined;
      const minPrice = args.minPrice != null ? Number(args.minPrice) : undefined;
      const cityRaw = args.city ? String(args.city).trim() : "";
      const cityNominative = cityRaw ? resolveLtCityNominative(cityRaw) : "";
      const city = cityNominative ? normCity(cityNominative) : "";

      const limitRaw = Number(args.limit);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 500;

      const filteredRows = await searchListingsFiltered({
        query: query || undefined,
        category,
        city: city || undefined,
        minPrice,
        maxPrice,
        limit,
      });

      const results = filteredRows.map((l) => toAgentListingSummary(l));
      const searchQuery = [query, category, cityNominative].filter(Boolean).join(" ").trim();

      const searchFilters: AgentSearchFilters = {
        query: query || undefined,
        category,
        city: cityNominative || undefined,
        maxPrice: maxPrice != null && !Number.isNaN(maxPrice) ? maxPrice : undefined,
        minPrice: minPrice != null && !Number.isNaN(minPrice) ? minPrice : undefined,
      };

      const summary =
        results.length === 0
          ? "Nerasta atitinkančių skelbimų."
          : `Rasta ${results.length} skelbimų.`;

      const proactiveMessage = ctx.searchSessionReset
        ? buildProactiveSearchResetMessage(
            results.length > 0
              ? undefined
              : "Rezultatų su naujais kriterijais nerasta.",
            searchQuery || query || undefined
          )
        : undefined;

      return {
        result: {
          count: results.length,
          listings: results,
          summary,
          filtersReset: Boolean(ctx.searchSessionReset),
          proactiveMessage,
        },
        sideEffect:
          results.length > 0
            ? {
                type: "search",
                searchQuery: searchQuery || results[0]!.title,
                listingIds: results.map((r) => r.id),
                filters: searchFilters,
                filtersReset: Boolean(ctx.searchSessionReset),
                proactiveMessage,
              }
            : {
                type: "empty_search",
                searchQuery: searchQuery || query || "paieška",
              },
      };
    }

    case "create_listing_draft": {
      const title = String(args.title ?? "Skelbimas").trim();
      const category = String(args.category ?? "other");
      const description = args.description ? String(args.description) : "";
      const attributes =
        args.attributes && typeof args.attributes === "object"
          ? Object.fromEntries(
              Object.entries(args.attributes as Record<string, unknown>).map(([k, v]) => [
                k,
                String(v),
              ])
            )
          : {};

      const draft = {
        title,
        description,
        price: 0,
        location: ctx.userCity?.trim() || "",
        contact: ctx.contact,
        category,
        confidence: 0.85,
        attributes,
      };

      const voiceFollowUp = buildCreateListingDraftFollowUp(category, title, attributes);

      return {
        result: {
          ok: true,
          message: "Pradedamas skelbimo juodraštis.",
          draft,
          voiceFollowUp,
          suggestedQuestions: [voiceFollowUp],
        },
        sideEffect: {
          type: "listing_draft",
          listingDraft: draft,
        },
      };
    }

    case "postNewListing": {
      const title = String(args.title ?? "Skelbimas");
      const description = String(args.description ?? "");
      const price = Number(args.price) || 0;
      const cityArg = args.city ? String(args.city).trim() : "";
      const userCityArg = ctx.userCity?.trim() ?? "";
      const normalizedCity = cityArg
        ? resolveAgentDefaultCity(cityArg)
        : userCityArg
          ? resolveAgentDefaultCity(userCityArg)
          : "";
      const category = String(args.category ?? "other");
      const imageUrls = Array.isArray(args.imageUrls)
        ? args.imageUrls.map(String)
        : [];
      const mergedAttrs = mergeVehicleToolArgs(args);
      const enriched = enrichVehicleListingDraftFromArgs(
        title,
        description,
        category,
        mergedAttrs
      );

      const missingFields: string[] = [];
      if (!normalizedCity?.trim() || normalizedCity.toLowerCase() === "miestas") missingFields.push("city");
      if (price <= 0) missingFields.push("price");
      if (!description.trim()) missingFields.push("description");
      const attributes = enriched.attributes;
      const sellerType = String(attributes.sellerType ?? "").trim();
      if (!sellerType) missingFields.push("sellerType");
      if (enriched.category === "vehicles") {
        if (!String(attributes.make ?? "").trim()) missingFields.push("make");
        if (!String(attributes.model ?? "").trim()) missingFields.push("model");
        if (!String(attributes.year ?? "").trim()) missingFields.push("year");
        if (!String(attributes.vin ?? "").trim()) missingFields.push("vin");
      }

      const draft = {
        title: enriched.title,
        description: enriched.description,
        price,
        location: normalizedCity,
        contact: ctx.contact,
        category: enriched.category,
        confidence: 0.9,
        attributes,
      };

      const suggestedQuestions: string[] = [];
      if (missingFields.includes("city")) {
        suggestedQuestions.push(
          "Matau, kad nenurodėte miesto. Kuriame mieste skelbiate?"
        );
      }
      if (missingFields.includes("price")) {
        suggestedQuestions.push("Kokios kainos tikitės? Galiu patarti pagal rinką.");
      }
      if (enriched.category === "vehicles" && missingFields.includes("vin")) {
        suggestedQuestions.push(
          "Ar norėtumėte įvesti VIN kodą, kad Regitra duomenys užsipildytų automatiškai?"
        );
      }
      if (enriched.category === "vehicles" && missingFields.includes("make")) {
        suggestedQuestions.push("Kokia automobilio markė? Pvz. BMW, Volkswagen, Toyota.");
      }
      if (enriched.category === "vehicles" && missingFields.includes("model")) {
        suggestedQuestions.push("Koks modelis? Pvz. Golf, 520, Corolla.");
      }
      if (enriched.category === "vehicles" && missingFields.includes("year")) {
        suggestedQuestions.push("Kokie pagaminimo ar registracijos metai?");
      }
      if (missingFields.includes("sellerType")) {
        suggestedQuestions.push(
          "Ar keliate skelbimą kaip privatus asmuo, ar kaip įmonė/verslas?"
        );
      }

      const voiceFollowUp = buildSellerContextualVoiceFollowUp(
        enriched.category,
        attributes,
        missingFields
      );

      let marketAnalysis = null;
      let proactivePricingMessage: string | null = null;
      const monState =
        ctx.monetization ??
        resolveMonetizationState({ userRole: ctx.userRole });
      const marketAnalysisDeferred = price > 0;

      if (marketAnalysisDeferred) {
        void scheduleDeferredListingMarketAnalysis({
          listings,
          title: enriched.title,
          category: enriched.category,
          city: normalizedCity,
          make: String(attributes.make ?? ""),
          model: String(attributes.model ?? ""),
          year: String(attributes.year ?? ""),
          price,
          userRole: ctx.userRole,
          monetization: monState,
        });
      }

      return {
        result: {
          ok: true,
          message: "Skelbimo juodraštis paruoštas patvirtinimui.",
          draft,
          missingFields,
          suggestedQuestions,
          voiceFollowUp,
          marketAnalysis,
          proactivePricingMessage,
          marketAnalysisDeferred,
        },
        sideEffect: {
          type: "listing_draft",
          listingDraft: draft,
          imageUrl: imageUrls[0],
        },
      };
    }

    case "analyzeMarketPrice": {
      const brand = String(args.brand ?? "").toLowerCase();
      const model = String(args.model ?? "").toLowerCase();
      const year = args.year != null ? String(args.year) : "";
      const category = args.category ? String(args.category) : undefined;
      const titleHint = args.title ? String(args.title) : "";
      const cityRaw = args.city ? String(args.city).trim() : ctx.userCity;
      const cityNominative = cityRaw ? resolveLtCityNominative(cityRaw) : "";
      const proposedPrice =
        args.proposedPrice != null ? Number(args.proposedPrice) : 0;

      const analysis = runMarketPriceAnalysis(listings, {
        title: titleHint || `${brand} ${model} ${year}`.trim(),
        category,
        city: cityNominative,
        make: brand,
        model,
        year,
      });

      const smartPriceAdvice =
        proposedPrice > 0
          ? buildSmartPriceAdvisorMessage(ctx.userName, proposedPrice, analysis)
          : analysis.message;

      return {
        result: {
          sampleSize: analysis.sampleSize,
          minPrice: analysis.minPrice,
          maxPrice: analysis.maxPrice,
          medianPrice: analysis.medianPrice,
          proposedPrice: proposedPrice > 0 ? proposedPrice : undefined,
          message: analysis.message,
          smartPriceAdvice,
        },
      };
    }

    case "scanListingPhotos": {
      const imageUrls = Array.isArray(args.imageUrls)
        ? args.imageUrls.map(String).filter(Boolean)
        : [];
      const category = args.category ? String(args.category) : ctx.listingDraft?.category;
      const cityArg = args.city ? String(args.city) : ctx.listingDraft?.location ?? ctx.userCity;

      try {
        const scan = await runVisionListingScan(imageUrls, {
          category,
          city: cityArg,
          userCity: ctx.userCity,
          existingDraft: ctx.listingDraft,
        });

        const draft = {
          ...scan.draft,
          contact: ctx.contact,
        };
        const voiceAnnouncement = buildVisionScanAnnouncement(
          ctx.userName,
          scan.filledFieldLabels
        );

        return {
          result: {
            ok: true,
            filledFieldLabels: scan.filledFieldLabels,
            filledFields: scan.filledFieldLabels,
            draft,
            voiceAnnouncement,
            message: voiceAnnouncement,
          },
          sideEffect: {
            type: "listing_draft",
            listingDraft: draft,
            imageUrl: imageUrls[0],
          },
        };
      } catch (e) {
        return {
          result: {
            ok: false,
            message:
              e instanceof Error
                ? e.message
                : "Nepavyko nuskenuoti nuotraukų — bandykite dar kartą arba užpildykite ranka.",
          },
        };
      }
    }

    case "triggerMicroPayment": {
      const reason = String(args.reason ?? "").trim();
      const product = inferMicroPaymentProduct(reason);
      const monState =
        ctx.monetization ??
        resolveMonetizationState({ userRole: ctx.userRole });
      const price =
        Number(args.price) > 0
          ? Number(args.price)
          : defaultPriceForProduct(product, monState);

      if (product === "region_stats" && requiresBusinessProForRegionStats(monState)) {
        const upsellMessage = buildBusinessProUpsellMessage();
        return {
          result: {
            ok: false,
            upsell: "business_pro",
            message: upsellMessage,
          },
          sideEffect: {
            type: "zero_ui_screen",
            screen: "business_dashboard",
          },
        };
      }

      if (product === "region_stats" && monState.tier !== "business_pro") {
        return {
          result: {
            ok: false,
            message: buildBusinessProUpsellMessage(),
          },
        };
      }

      if (product === "smart_boost" && monState.activeBoost) {
        return {
          result: {
            ok: true,
            alreadyActive: true,
            message: "Smart Boost jau aktyvus šiam skelbimui.",
          },
        };
      }

      const voiceReply = buildMicroPaymentVoiceReply(product, price, monState);
      return {
        result: {
          ok: true,
          reason,
          price,
          product,
          voiceConfirmPhrase: "Taip, apmokėti",
          message: voiceReply,
        },
        sideEffect: {
          type: "micro_payment",
          reason,
          price,
          product,
          voiceConfirmPhrase: "Taip, apmokėti",
        },
      };
    }

    case "trackUserError": {
      const code = String(args.errorCode ?? "unknown");
      const context = String(args.context ?? "");
      const suggestions: Record<string, string> = {
        upload_too_large:
          "Nuotrauka per didelė — sistema ją automatiškai suspaudžia. Bandykite dar kartą arba pasirinkite mažesnę nuotrauką.",
        cloudinary_failed:
          "Nepavyko įkelti į debesį — skelbimas vis tiek gali būti publikuojamas su vietine nuotrauka.",
        ai_timeout:
          "AI analizė užtruko — bandykite trumpesnį aprašymą arba įkelkite mažesnę nuotrauką.",
        network_error: "Ryšio klaida — patikrinkite internetą ir bandykite dar kartą.",
      };
      return {
        result: {
          logged: true,
          errorCode: code,
          suggestion:
            suggestions[code] ??
            `Pastebėjau problemą (${code}): ${context}. Bandykite dar kartą arba aprašykite kitaip.`,
        },
      };
    }

    case "blockListing": {
      if (ctx.userRole !== "admin") {
        return {
          result: {
            ok: false,
            message: "Tik administratorius gali blokuoti skelbimus.",
          },
        };
      }
      const listingId = String(args.listingId ?? "").trim();
      const reason = String(args.reason ?? "").trim();
      if (!listingId) {
        return {
          result: { ok: false, message: "Nenurodytas skelbimo ID." },
        };
      }
      try {
        const updated = await adminPatchListing(listingId, { banned: true });
        if (!updated) {
          return {
            result: {
              ok: false,
              message: `Skelbimas ${listingId} nerastas.`,
            },
          };
        }
        return {
          result: {
            ok: true,
            listingId,
            reason,
            title: updated.title,
            message: `Skelbimas „${updated.title}" užblokuotas.`,
          },
          sideEffect: {
            type: "block_listing",
            listingId,
            reason,
            listingTitle: updated.title,
          },
        };
      } catch (e) {
        return {
          result: {
            ok: false,
            message:
              e instanceof Error ? e.message : "Nepavyko užblokuoti skelbimo.",
          },
        };
      }
    }

    case "registerWanted": {
      const query = String(args.query ?? "").trim();
      return {
        result: {
          ok: query.length >= 3,
          message:
            query.length >= 3
              ? `Pageidavimas „${query}" paruoštas registracijai.`
              : "Per trumpa paieška — reikia bent 3 simbolių.",
          query,
        },
        sideEffect:
          query.length >= 3
            ? { type: "register_wanted", query }
            : undefined,
      };
    }

    case "showZeroUiScreen": {
      const screenRaw = String(args.screen ?? "").trim();
      if (!isZeroUiScreen(screenRaw)) {
        return {
          result: {
            ok: false,
            message: `Nežinomas Zero-UI ekranas „${screenRaw}". Galimi: ${ZERO_UI_SCREENS.join(", ")}.`,
          },
        };
      }
      return {
        result: { ok: true, screen: screenRaw, message: `Zero-UI → ${screenRaw}` },
        sideEffect: { type: "zero_ui_screen", screen: screenRaw },
      };
    }

    case "markListingSold": {
      const listingId = String(args.listingId ?? "").trim();
      const titleHint = String(args.titleHint ?? "").trim().toLowerCase();
      const pageListingId = ctx.activeListingId?.trim();
      const mine = (ctx.myListings ?? []).filter((l) => l.status !== "sold");
      let target =
        mine.find((l) => l.id === listingId) ??
        (pageListingId ? mine.find((l) => l.id === pageListingId) : undefined) ??
        (titleHint
          ? mine.find((l) => l.title.toLowerCase().includes(titleHint))
          : undefined) ??
        (mine.length === 1 ? mine[0] : undefined);

      if (!target) {
        return {
          result: {
            ok: false,
            message:
              mine.length > 1
                ? "Turite kelis aktyvius skelbimus — patikslinkite kurį pardavėte (pavadinimą arba id)."
                : "Neradau aktyvaus skelbimo, kurį galėčiau archyvuoti.",
          },
        };
      }

      const firstName = (ctx.userName ?? "drauge").split(/\s+/)[0];

      if (ctx.authUserId) {
        try {
          const updated = await updateListing(target.id, ctx.authUserId, {
            status: "sold",
          });
          if (!updated) {
            return {
              result: {
                ok: false,
                message: "Nepavyko archyvuoti skelbimo — patikrinkite savininko teises.",
              },
            };
          }
          target = { ...target, status: "sold" };
        } catch (e) {
          return {
            result: {
              ok: false,
              message:
                e instanceof Error ? e.message : "Nepavyko pažymėti skelbimo parduotu.",
            },
          };
        }
      }

      return {
        result: {
          ok: true,
          listingId: target.id,
          title: target.title,
          message: `Puiku, ${firstName}, tavo skelbimą „${target.title}" archyvavau!`,
        },
        sideEffect: {
          type: "mark_listing_sold",
          listingId: target.id,
          title: target.title,
        },
      };
    }

    case "updateListingDraft": {
      const base = ctx.listingDraft ?? {};
      const patch: NonNullable<AgentToolContext["listingDraft"]> = { ...base };
      if (args.title != null) patch.title = String(args.title);
      if (args.description != null) patch.description = String(args.description);
      if (args.price != null) patch.price = Number(args.price);
      if (args.city != null) patch.location = resolveAgentDefaultCity(String(args.city));
      if (args.category != null) patch.category = String(args.category);
      if (args.attributes && typeof args.attributes === "object") {
        patch.attributes = {
          ...(base.attributes ?? {}),
          ...Object.fromEntries(
            Object.entries(args.attributes as Record<string, unknown>).map(([k, v]) => [
              k,
              String(v),
            ])
          ),
        };
      }

      const draft = {
        title: patch.title ?? "Skelbimas",
        description: patch.description ?? "",
        price: patch.price ?? 0,
        location: patch.location ?? ctx.userCity,
        contact: ctx.contact,
        category: patch.category ?? "other",
        confidence: 0.9,
        attributes: patch.attributes ?? {},
      };

      return {
        result: {
          ok: true,
          message: "Juodraštis atnaujintas.",
          draft,
        },
        sideEffect: {
          type: "listing_draft",
          listingDraft: draft,
        },
      };
    }

    case "navigate_view": {
      const viewRaw = String(args.view ?? "").trim();
      if (!isAppView(viewRaw)) {
        return {
          result: {
            ok: false,
            message: `Nežinomas vaizdas „${viewRaw}". Galimi: ${VALID_APP_VIEWS.join(", ")}.`,
          },
        };
      }
      if (viewRaw === "admin_ai" && ctx.userRole !== "admin") {
        return {
          result: {
            ok: false,
            message: "Admin AI zona prieinama tik administratoriui.",
          },
        };
      }
      const params = normalizeViewParams(args);
      return {
        result: {
          ok: true,
          view: viewRaw,
          params,
          message: `Naviguojama į „${viewRaw}".`,
        },
        sideEffect: {
          type: "navigate",
          view: viewRaw,
          params,
        },
      };
    }

    case "addToFavorites": {
      const listingId = String(args.listingId ?? ctx.activeListingId ?? "").trim();
      if (!listingId) {
        return {
          result: { ok: false, message: "Nėra active_listing_id — atidarykite skelbimą." },
        };
      }
      return {
        result: { ok: true, listingId, message: "Pridėta į mėgstamiausius." },
        sideEffect: { type: "toggle_favorite", listingId, added: true },
      };
    }

    case "dismissActiveListing": {
      const modeRaw = String(args.mode ?? "next").toLowerCase();
      const mode: "next" | "close" = modeRaw === "close" ? "close" : "next";
      return {
        result: {
          ok: true,
          mode,
          message: mode === "next" ? "Einame prie kito." : "Uždarau peržiūrą.",
        },
        sideEffect: { type: "dismiss_listing", mode },
      };
    }

    case "applyBrowseFilter": {
      const category = args.category ? String(args.category) : undefined;
      const categoryAttributes: Record<string, string> = {};
      if (args.gearbox) categoryAttributes.gearbox = String(args.gearbox);
      if (args.fuelType) categoryAttributes.fuelType = String(args.fuelType);
      if (args.bodyType) categoryAttributes.bodyType = String(args.bodyType);
      const label = String(args.label ?? "Filtras pritaikytas").trim();
      const filters: AgentSearchFilters = {
        category,
        categoryAttributes: Object.keys(categoryAttributes).length ? categoryAttributes : undefined,
      };
      return {
        result: { ok: true, filters, label },
        sideEffect: {
          type: "apply_ui_filters",
          filters,
          categoryAttributes,
          label,
        },
      };
    }

    case "ghostCallerShield": {
      const message = String(args.message ?? "").trim();
      const listingPrice = Number(args.listingPrice) || 0;
      const listingTitle = String(args.listingTitle ?? "Skelbimas").trim();
      const sellerName = String(args.sellerName ?? ctx.userName ?? "Pardavėjas").trim();
      const shield = await analyzeChatShield({
        message,
        listingPrice,
        listingTitle,
        sellerName,
      });
      return {
        result: {
          ok: true,
          ...shield,
        },
      };
    }

    default:
      return { result: { error: `Unknown tool: ${name}` } };
  }
}

export interface AgentSearchFilters {
  query?: string;
  category?: string;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
  refinements?: string[];
  categoryAttributes?: Record<string, string>;
}

export type AgentSideEffect =
  | {
      type: "search";
      searchQuery: string;
      listingIds: string[];
      filters?: AgentSearchFilters;
      filtersReset?: boolean;
      proactiveMessage?: string;
    }
  | {
      type: "listing_draft";
      listingDraft: {
        title: string;
        description?: string;
        price: number;
        location: string;
        contact: string;
        category: string;
        confidence: number;
        attributes?: Record<string, string>;
      };
      imageUrl?: string;
    }
  | {
      type: "block_listing";
      listingId: string;
      reason: string;
      listingTitle?: string;
    }
  | {
      type: "empty_search";
      searchQuery: string;
    }
  | {
      type: "register_wanted";
      query: string;
    }
  | {
      type: "mark_listing_sold";
      listingId: string;
      title: string;
    }
  | {
      type: "navigate";
      view: AppView;
      params?: Record<string, string>;
    }
  | {
      type: "zero_ui_screen";
      screen: ZeroUiScreen;
    }
  | {
      type: "micro_payment";
      reason: string;
      price: number;
      product: "smart_boost" | "region_stats" | "b2b_lead" | "generic";
      voiceConfirmPhrase?: string;
    }
  | {
      type: "toggle_favorite";
      listingId: string;
      added: boolean;
    }
  | {
      type: "dismiss_listing";
      mode: "next" | "close";
    }
  | {
      type: "apply_ui_filters";
      filters?: AgentSearchFilters;
      categoryAttributes?: Record<string, string>;
      label?: string;
    };
