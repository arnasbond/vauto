import { adminPatchListing, getListings, searchListingsFiltered, updateListing } from "../repository.js";
import { buildBrowseAllReply, isBrowseAllIntent, resolveBrowseAllIntent } from "../lib/browse-all-intent.js";
import { normalizeProductSearchQuery, inferSearchCategory } from "./product-search-query.js";
import {
  buildJobSearchConversationalReply,
  isJobSearchQuery,
} from "./universal-search-intent.js";
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
import { buildListingDraftUpdateReply } from "./listing-draft-preview.js";
import { buildDraftingCompletePhotosPrompt } from "./listing-conversational-flow.js";
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
import {
  normalizeUpdateUIFiltersArgs,
  resolveNavigateScreen,
} from "./agent-ui-tools.js";
import {
  buildSmartBargainingProposal,
  normalizeUserRequirementArgs,
} from "../offer-engine.js";
import { insertUserRequirement } from "../repository.js";
import { parseListingImagesForAgent } from "./vauto-unified.js";
import {
  buildPostValidationReportMessage,
  POST_VALIDATION_QUICK_REPLIES,
} from "./structured-input-pipeline.js";
import { analyzeWardrobePhoto } from "./wardrobe-vision.js";
import { importWardrobeProfile } from "./wardrobe-profile-importer.js";
import { analyzeMagicMirrorFit } from "./magic-mirror.js";
import { runAutoNegotiation } from "./bargain-twin.js";
import { buildSellerTrustSummary } from "./seller-trust-score.js";
import {
  buildBusinessInsightsSummary,
  fetchServiceLeadStats,
  formatServiceLeadsMessage,
} from "./business-agent-tools.js";
import { detectServerSellIntent } from "./sell-intent-fallback.js";
import {
  evaluateOmnivaPastomatasGatekeeper,
  OMNIVA_OVERSIZE_BLOCK_MESSAGE,
} from "../shipping/omniva-gatekeeper.js";

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
  /** Latest user utterance — used when Gemini omits query in searchListings. */
  lastUserQuery?: string;
  searchSessionReset?: boolean;
  monetization?: MonetizationState;
  listingDraft?: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
    attributes?: Record<string, string>;
    allowPastomatas?: boolean;
  };
  sellerMetrics?: {
    views: number;
    callClicks: number;
    chatStarts: number;
    saves: number;
    interestScore: number;
    buyerIntentCount?: number;
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
    console.error("[vision] scanListingPhotos: GEMINI_API_KEY missing");
    throw new Error("GEMINI_API_KEY not configured for vision scan");
  }

  const urls = imageUrls.filter(Boolean).slice(0, 6);
  console.log("[vision] scanListingPhotos enter", {
    urlCount: urls.length,
    kinds: urls.map((u) =>
      u.startsWith("data:") ? `data(${u.length})` : u.startsWith("http") ? "http" : "other"
    ),
    categoryHint: opts.category ?? null,
    city: opts.city ?? opts.userCity ?? null,
  });
  if (!urls.length) {
    console.error("[vision] scanListingPhotos: empty urls");
    throw new Error("imageUrls are required for vision scan");
  }

  const city = opts.city?.trim()
    ? resolveAgentDefaultCity(opts.city)
    : opts.userCity;

  const visionPrompt = `Nuskenuok AUTOMOBILIO / prekės nuotraukas lietuviškam skelbimui.
DĖMESYS TIK PREKEI: markė, modelis, metai, variklis (cm³/kW), kuras, rida, spalva, vietų skaičius, VIN/valst. nr. jei matosi dokumente, komplektacija, būklė.
DRAUDŽIAMA aprašyti foną (trinkeles, namą, medžius, kiemą, dangų, orą) — ignoruok aplinką.
Automobiliui — make, model, year, color, bodyType, fuelType, mileage, engine, powerKw, seats, vin, plate, condition.
NT — rooms, area, equipment. Elektronikai — condition, color.
JSON: ${VISION_LISTING_SCHEMA}. Miestas: ${city}. Kategorija hint: ${opts.category ?? "auto"}.`;
  console.log("[vision] scanListingPhotos calling visionExtractJson", {
    promptChars: visionPrompt.length,
  });
  let raw: Record<string, unknown>;
  try {
    raw = await visionExtractJson(visionPrompt, urls);
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[vision] scanListingPhotos visionExtractJson FAILED ${JSON.stringify({
        errMessage,
        stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined,
      })}`
    );
    throw err;
  }
  console.log("[vision] scanListingPhotos raw ok", {
    keys: Object.keys(raw ?? {}),
    title: String(raw.title ?? "").slice(0, 80),
    descriptionChars: String(raw.description ?? "").length,
  });

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
    name: "clearAllFilters",
    description:
      "Išvalo visus UI filtrus ir parodo visą katalogą. Kviesti kai vartotojas nori matyti viską: parodyk visus, rodyk viską, be filtrų, visas turgus, show all.",
    parameters: {
      type: "OBJECT",
      properties: {
        label: {
          type: "STRING",
          description: "Trumpas lietuviškas patvirtinimas vartotojui",
        },
      },
    },
  },
  {
    name: "applyFilter",
    description:
      "Pritaiko vieną filtrą pagal pokalbio prasmę. category: query | category | city | maxPrice | minPrice | subcategory | size | condition. value — filtro reikšmė.",
    parameters: {
      type: "OBJECT",
      properties: {
        category: {
          type: "STRING",
          description:
            "query | category | city | maxPrice | minPrice | subcategory | size | condition",
        },
        value: {
          type: "STRING",
          description: "Filtruojama reikšmė (tekstas ar skaičius kaip string)",
        },
        label: {
          type: "STRING",
          description: "Trumpas lietuviškas patvirtinimas",
        },
      },
      required: ["category", "value"],
    },
  },
  {
    name: "openListingForm",
    description:
      "Atidaro skelbimo kūrimo formą. TIK kai vartotojas AIŠKIAI nori parduoti ar įkelti skelbimą (parduodu, įdėti skelbimą, noriu parduoti). NIEKADA paieškos ar naršymo komandoms.",
    parameters: {
      type: "OBJECT",
      properties: {
        explicitSellConfirm: {
          type: "BOOLEAN",
          description:
            "true tik jei vartotojas aiškiai išsakė pardavimo intenciją šiame ar ankstesniame sakinyje",
        },
        label: {
          type: "STRING",
          description: "Trumpas lietuviškas patvirtinimas",
        },
      },
    },
  },
  {
    name: "navigateTo",
    description:
      "Perkelia vartotoją į puslapį ar ekraną. path: /, /add, /fashion, /profile, /chats arba alias: marketplace, spinta, add_listing, profile.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: {
          type: "STRING",
          description: "Kelias (/add) arba ekrano alias (marketplace, fashion, add_listing)",
        },
        label: {
          type: "STRING",
          description: "Trumpas lietuviškas patvirtinimas",
        },
      },
      required: ["path"],
    },
  },
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
      "Pradeda NAUJĄ skelbimo juodraštį kai vartotojas nori PARDUOTI. PRIVALOMA pateikti turtingą description (4–8 sakiniai): akcentai, būklė, nauda pirkėjui ir CTA — ne tuščią anketą ar 1 sakinio santrauką. Po to klausk 1 kontekstinį klausimą (ne „Trūksta miesto, kainos“).",
    parameters: {
      type: "OBJECT",
      properties: {
        title: {
          type: "STRING",
          description:
            "Profesionalus pavadinimas: iPhone 16, Suknelė Zara, BMW 320d, Sklypas Vilniuje",
        },
        category: {
          type: "STRING",
          description:
            "vehicles | electronics | real_estate | clothing | services | jobs | home | other",
        },
        description: {
          type: "STRING",
          description:
            "PRIVALOMAS turtingas marketplace aprašymas lietuviškai (4–8 sakiniai): pagrindiniai akcentai, būklė, nauda pirkėjui, kvietimas apžiūrėti/susisiekti. DRAUDŽIAMA 1 sakinio „Parduodu X“ ar „… automobilis.“",
        },
        attributes: {
          type: "OBJECT",
          description: "color, size, make, model, year, memory, storage, propertyType, clothingSize…",
        },
      },
      required: ["title", "category", "description"],
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
      "Ieško aktyvių skelbimų ARBA atidaro visą katalogą. Jei vartotojas nori matyti visus skelbimus (parodyk/rodyk/atidaryk visus|viską, show all) — perduok tą frazę query; sistema išvalys filtrus. Produktų paieškai query turi objektą (Volvo, batai, namas).",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description:
            "Produkto raktiniai žodžiai (Volvo, batai) ARBA naršymo komanda (parodyk visus, rodyk viską, show all)",
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
    name: "updateUIFilters",
    description:
      'AI-Driven UI — tiesiogiai nustato paieškos tinklelio filtrus (kategorija, subkategorija, lokacija, dydis, būklė). PRIVALOMA VAUTO Spintos režime klaidingai ištartai balso įvestiai vietoj searchListings. Pvz. rozni kedai → category clothing, subcategory shoes.',
    parameters: {
      type: "OBJECT",
      properties: {
        filters: {
          type: "OBJECT",
          description:
            "JSON filtrai: category, subcategory, query, city, size, condition, minPrice, maxPrice, categoryAttributes",
        },
        category: { type: "STRING" },
        subcategory: {
          type: "STRING",
          description: "shoes | dresses | jackets | bateliai | kedai | suknele …",
        },
        query: { type: "STRING" },
        city: { type: "STRING" },
        location: { type: "STRING" },
        size: { type: "STRING" },
        condition: { type: "STRING", description: "new | used | naudota" },
        minPrice: { type: "NUMBER" },
        maxPrice: { type: "NUMBER" },
        label: {
          type: "STRING",
          description:
            "Trumpas šiltas lietuviškas TTS atsakymas, pvz. Supratau, filtruoju batelius tavo spintoje!",
        },
        activateWardrobe: { type: "BOOLEAN" },
        wardrobeMode: { type: "BOOLEAN" },
        categoryAttributes: { type: "OBJECT" },
      },
    },
  },
  {
    name: "navigateToScreen",
    description:
      "Programiškai perjungia vartotoją tarp ekranų: fashion/spinta/wardrobe → VAUTO Spinta; add_listing/upload → skelbimo kėlimas; marketplace → paieška.",
    parameters: {
      type: "OBJECT",
      properties: {
        screen: {
          type: "STRING",
          description:
            "fashion | spinta | wardrobe | vauto_spinta | add_listing | upload | marketplace | profile | chats | seller_wizard",
        },
        filters: {
          type: "OBJECT",
          description: "Optional filtrai pritaikyti po navigacijos",
        },
        label: { type: "STRING", description: "Trumpas lietuviškas TTS patvirtinimas" },
      },
      required: ["screen"],
    },
  },
  {
    name: "createUserRequirement",
    description:
      'No-Match Lead — sukuria pirkėjo pageidavimą DB, kai paieška/filtrai grąžina 0 rezultatų. Pasiūlyk: Matau, kad šiuo metu tokios prekės neturime. Leisk man užfiksuoti tavo norą fone! PRIVALOMA prieš leidžiant vartotojui išeiti.',
    parameters: {
      type: "OBJECT",
      properties: {
        requirementData: {
          type: "OBJECT",
          description:
            "JSON: query, category, city, maxPrice, minPrice, size, subcategory, wardrobeMode, filters",
        },
        query: { type: "STRING", description: "Ko ieško vartotojas lietuviškai" },
        category: { type: "STRING" },
        city: { type: "STRING" },
        maxPrice: { type: "NUMBER" },
        size: { type: "STRING" },
        subcategory: { type: "STRING" },
        wardrobeMode: { type: "BOOLEAN" },
        label: { type: "STRING", description: "Trumpas TTS patvirtinimas po registracijos" },
      },
    },
  },
  {
    name: "proposeSmartBargaining",
    description:
      "Spintos derybų tarpininkas — įvertina kainos rėžius ir siūlo proaktyvų derybų žingsnį (5–10% nuolaida mados režime). Naudok kai listing_dwell 15+ sek arba negotiate_click.",
    parameters: {
      type: "OBJECT",
      properties: {
        listingId: { type: "STRING" },
        listingTitle: { type: "STRING" },
        listingPrice: { type: "NUMBER" },
        category: { type: "STRING" },
        wardrobeMode: { type: "BOOLEAN" },
        label: { type: "STRING", description: "Trumpas proaktyvus TTS pasiūlymas" },
      },
      required: ["listingId", "listingPrice"],
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
  {
    name: "analyzeWardrobePhoto",
    description:
      "Smart Wardrobe Vision — viena drabužių nuotrauka su keliais objektais. Aptinka kiekvieną drabužį ir paruošia atskirus skelbimus. Naudok Spintoje (/fashion) kai vartotojas įkelia nuotrauką.",
    parameters: {
      type: "OBJECT",
      properties: {
        imageUrl: { type: "STRING", description: "Nuotraukos URL arba data: URL" },
      },
      required: ["imageUrl"],
    },
  },
  {
    name: "importWardrobeProfile",
    description:
      "Spintos perkėlimas — importuoja prekes iš portalo profilio URL (Vinted ir kt.) į VAUTO skelbimus vienu žingsniu.",
    parameters: {
      type: "OBJECT",
      properties: {
        profileUrl: { type: "STRING", description: "Portalo profilio nuoroda" },
      },
      required: ["profileUrl"],
    },
  },
  {
    name: "analyzeMagicMirrorFit",
    description:
      "Magic Mirror — palygina drabužio dydį su pirkėjo figūra ir rekomenduoja ar tiks.",
    parameters: {
      type: "OBJECT",
      properties: {
        listingTitle: { type: "STRING" },
        buyerUsualSize: { type: "STRING", description: "Pirkėjo įprastas dydis, pvz. M" },
        garmentSize: { type: "STRING", description: "Drabužio dydis iš skelbimo" },
        listingDescription: { type: "STRING" },
      },
      required: ["listingTitle"],
    },
  },
  {
    name: "getSellerTrustScore",
    description:
      "AI pasitikėjimo pasas — rekomendacija pirkėjui apie pardavėjo patikimumą pagal atsiliepimus.",
    parameters: {
      type: "OBJECT",
      properties: {
        sellerId: { type: "STRING" },
        sellerName: { type: "STRING" },
      },
    },
  },
  {
    name: "analyzeNegotiationTwin",
    description:
      "Derybų dvynys — analizuoja pirkėjo pasiūlymą; jei >= minPrice, paruošia sandorį ir auto-atsakymą.",
    parameters: {
      type: "OBJECT",
      properties: {
        buyerMessage: { type: "STRING" },
        listingId: { type: "STRING" },
        listingTitle: { type: "STRING" },
        listingPrice: { type: "NUMBER" },
        minPrice: { type: "NUMBER" },
      },
      required: ["buyerMessage", "listingPrice", "minPrice"],
    },
  },
  {
    name: "getBusinessInsights",
    description:
      "Verslo partnerio apžvalga — aktyvūs skelbimai, peržiūros, kontaktai, pirkėjų norai, paslaugų leadai. Naudok kai verslas klausia statistikos, apžvalgos, patarimų ar „kaip sekasi\".",
    parameters: {
      type: "OBJECT",
      properties: {
        focus: {
          type: "STRING",
          description: "optional: overview | visibility | leads | pricing",
        },
      },
    },
  },
  {
    name: "listServiceLeads",
    description:
      "Paslaugų leadų dėžutė — rodo naujausias paslaugų užklausas verslo paskyrai. Naudok kai vartotojas klausia apie leadus, užklausas, klientus.",
    parameters: {
      type: "OBJECT",
      properties: {
        limit: { type: "INTEGER", description: "Maks. leadų skaičius (default 8)" },
      },
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
    case "clearAllFilters": {
      const limit = 500;
      const filteredRows = await searchListingsFiltered({ limit });
      const results = filteredRows.map((l) => toAgentListingSummary(l));
      const replyMessage =
        String(args.label ?? "").trim() || buildBrowseAllReply(results.length);

      return {
        result: {
          ok: true,
          count: results.length,
          message: replyMessage,
          browseAll: true,
        },
        sideEffect: {
          type: "browse_all",
          replyMessage,
          listingCount: results.length,
        },
      };
    }

    case "applyFilter": {
      const categoryKey = String(args.category ?? "")
        .trim()
        .toLowerCase();
      const valueRaw = args.value != null ? String(args.value).trim() : "";
      const filterArgs: Record<string, unknown> = {
        label: args.label,
      };

      if (!categoryKey || !valueRaw) {
        return {
          result: {
            ok: false,
            message: "applyFilter reikalauja category ir value.",
          },
        };
      }

      switch (categoryKey) {
        case "query":
        case "paieska":
        case "search":
          filterArgs.query = normalizeProductSearchQuery(valueRaw);
          break;
        case "category":
        case "kategorija":
          filterArgs.category = valueRaw;
          break;
        case "city":
        case "miestas":
        case "location":
          filterArgs.city = valueRaw;
          break;
        case "maxprice":
        case "kaina_max":
        case "iki":
          filterArgs.maxPrice = Number(valueRaw);
          break;
        case "minprice":
        case "kaina_min":
        case "nuo":
          filterArgs.minPrice = Number(valueRaw);
          break;
        case "subcategory":
        case "subkategorija":
          filterArgs.subcategory = valueRaw;
          break;
        case "size":
        case "dydis":
          filterArgs.size = valueRaw;
          break;
        case "condition":
        case "bukle":
          filterArgs.condition = valueRaw;
          break;
        default:
          filterArgs.category = categoryKey;
          filterArgs.query = valueRaw;
      }

      const normalized = normalizeUpdateUIFiltersArgs(filterArgs);
      const queryText =
        normalized.query?.trim() || normalized.filters.query?.trim() || "";

      const baseResult = {
        ok: true,
        filters: normalized.filters,
        categoryAttributes: normalized.categoryAttributes,
        label: normalized.label,
        activateWardrobe: normalized.activateWardrobe,
        query: queryText || normalized.query,
      };

      const uiSideEffect = {
        type: "apply_ui_filters" as const,
        filters: normalized.filters,
        categoryAttributes: normalized.categoryAttributes,
        label: normalized.label,
        activateWardrobe: normalized.activateWardrobe,
        query: queryText || normalized.query,
      };

      if (!queryText) {
        return { result: baseResult, sideEffect: uiSideEffect };
      }

      const maxPrice =
        normalized.filters.maxPrice != null
          ? Number(normalized.filters.maxPrice)
          : undefined;
      const minPrice =
        normalized.filters.minPrice != null
          ? Number(normalized.filters.minPrice)
          : undefined;
      const cityRaw = normalized.filters.city?.trim() ?? "";
      const cityNominative = cityRaw ? resolveLtCityNominative(cityRaw) : "";
      const city = cityNominative ? normCity(cityNominative) : "";

      const filteredRows = await searchListingsFiltered({
        query: queryText,
        category: normalized.filters.category,
        city: city || undefined,
        minPrice,
        maxPrice,
        limit: 500,
      });
      const results = filteredRows.map((l) => toAgentListingSummary(l));
      const searchFilters = {
        ...normalized.filters,
        query: queryText,
      };

      if (results.length > 0) {
        return {
          result: {
            ...baseResult,
            count: results.length,
            listingIds: results.map((r) => r.id),
          },
          sideEffect: {
            type: "search",
            searchQuery: queryText,
            listingIds: results.map((r) => r.id),
            filters: searchFilters,
          },
        };
      }

      return {
        result: { ...baseResult, count: 0 },
        sideEffect: {
          type: "empty_search",
          searchQuery: queryText,
          filters: searchFilters,
        },
      };
    }

    case "openListingForm": {
      const explicitConfirm = Boolean(args.explicitSellConfirm);
      const lastQuery = ctx.lastUserQuery?.trim() ?? "";
      if (!explicitConfirm && !detectServerSellIntent(lastQuery)) {
        return {
          result: {
            ok: false,
            message:
              "Skelbimo forma atidaroma tik kai vartotojas aiškiai nori parduoti ar įkelti skelbimą. Paklausk patvirtinimo.",
          },
        };
      }

      const nav = resolveNavigateScreen("add_listing");
      const label =
        String(args.label ?? "").trim() ||
        "Paruošiu skelbimą — pradėkime nuo pagrindų.";

      return {
        result: {
          ok: true,
          path: nav.path,
          screen: "add_listing",
          message: label,
        },
        sideEffect: {
          type: "navigate_to_screen",
          screen: "add_listing",
          path: nav.path,
          view: nav.view as AppView | undefined,
          label,
        },
      };
    }

    case "navigateTo": {
      const pathRaw = String(args.path ?? "").trim();
      if (!pathRaw) {
        return {
          result: { ok: false, message: "navigateTo reikalauja path." },
        };
      }

      const aliasKey = pathRaw.replace(/^\//, "");
      const nav = resolveNavigateScreen(aliasKey);
      const label =
        String(args.label ?? "").trim() || nav.message || `Perkeliu į ${pathRaw}.`;

      if (nav.ok) {
        return {
          result: {
            ok: true,
            path: nav.path,
            screen: nav.screen,
            message: label,
          },
          sideEffect: {
            type: "navigate_to_screen",
            screen: nav.screen,
            path: nav.path,
            view: nav.view as AppView | undefined,
            zeroUi: nav.zeroUi as ZeroUiScreen | undefined,
            activateWardrobe: nav.activateWardrobe,
            label,
          },
        };
      }

      const normalizedPath = pathRaw.startsWith("/") ? pathRaw : `/${pathRaw}`;
      return {
        result: {
          ok: true,
          path: normalizedPath,
          message: label,
        },
        sideEffect: {
          type: "navigate_to_screen",
          screen: normalizedPath,
          path: normalizedPath,
          label,
        },
      };
    }

    case "searchListings": {
      const rawQuery = String(args.query ?? "").trim();
      const fallbackQuery = ctx.lastUserQuery?.trim() ?? "";
      const rawForIntent = (rawQuery || fallbackQuery).trim();
      const jobIntent = isJobSearchQuery(rawForIntent);
      const query = normalizeProductSearchQuery(rawQuery || fallbackQuery);
      const category = args.category
        ? String(args.category)
        : inferSearchCategory(rawForIntent);

      if (resolveBrowseAllIntent(rawQuery, fallbackQuery, query)) {
        const limitRaw = Number(args.limit);
        const limit =
          Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 500;
        const filteredRows = await searchListingsFiltered({ limit });
        const results = filteredRows.map((l) => toAgentListingSummary(l));
        const replyMessage = buildBrowseAllReply(results.length);

        return {
          result: {
            count: results.length,
            listings: results,
            summary: replyMessage,
            browseAll: true,
          },
          sideEffect: {
            type: "browse_all",
            replyMessage,
            listingCount: results.length,
          },
        };
      }

      if (!query && !category) {
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

      if (
        results.length === 0 &&
        resolveBrowseAllIntent(rawQuery, fallbackQuery, query)
      ) {
        const allRows = await searchListingsFiltered({ limit });
        const allResults = allRows.map((l) => toAgentListingSummary(l));
        const replyMessage = buildBrowseAllReply(allResults.length);
        return {
          result: {
            count: allResults.length,
            listings: allResults,
            summary: replyMessage,
            browseAll: true,
          },
          sideEffect: {
            type: "browse_all",
            replyMessage,
            listingCount: allResults.length,
          },
        };
      }

      /** UI search bar — raw user/Gemini query only; category lives in filters, never appended. */
      const searchQuery = query.trim();

      const searchFilters: AgentSearchFilters = {
        query: query || undefined,
        category,
        city: cityNominative || undefined,
        maxPrice: maxPrice != null && !Number.isNaN(maxPrice) ? maxPrice : undefined,
        minPrice: minPrice != null && !Number.isNaN(minPrice) ? minPrice : undefined,
      };

      const summary = jobIntent
        ? buildJobSearchConversationalReply(rawForIntent, results.length, ctx.userName)
        : results.length === 0
          ? "Šiuo metu atitikmenų neradau — galiu užfiksuoti norą arba padėti patikslinti paiešką."
          : `Rasta ${results.length} skelbimų.`;

      const proactiveMessage = ctx.searchSessionReset
        ? buildProactiveSearchResetMessage(
            results.length > 0
              ? undefined
              : "Kol kas su naujais kriterijais nieko neradau — galime patikslinti ar užregistruoti norą.",
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
                searchQuery,
                listingIds: results.map((r) => r.id),
                filters: searchFilters,
                filtersReset: Boolean(ctx.searchSessionReset),
                proactiveMessage,
              }
            : {
                type: "empty_search",
                searchQuery,
                filters: searchFilters,
              },
      };
    }

    case "create_listing_draft": {
      const title = String(args.title ?? "Skelbimas").trim();
      const category = String(args.category ?? "other");
      const description = args.description ? String(args.description) : "";
      const priceArg =
        args.price != null && Number(args.price) > 0 ? Number(args.price) : 0;
      const locationArg = args.city
        ? String(args.city).trim()
        : args.location
          ? String(args.location).trim()
          : "";
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
        price: priceArg,
        location: locationArg || ctx.userCity?.trim() || "",
        contact: ctx.contact,
        category,
        confidence: 0.85,
        attributes,
        allowPastomatas: true,
        listingFlowState: "DRAFT_READY" as const,
      };

      const photosPrompt = buildDraftingCompletePhotosPrompt(draft);
      const gate = evaluateOmnivaPastomatasGatekeeper({
        title,
        description,
        category,
        attributes,
      });
      if (gate.oversized) {
        draft.allowPastomatas = false;
      }

      return {
        result: {
          ok: true,
          message: photosPrompt,
          draft,
          voiceFollowUp: gate.oversized
            ? `${photosPrompt}\n\n${OMNIVA_OVERSIZE_BLOCK_MESSAGE}`
            : photosPrompt,
          suggestedQuestions: [
            gate.oversized
              ? `${photosPrompt}\n\n${OMNIVA_OVERSIZE_BLOCK_MESSAGE}`
              : photosPrompt,
          ],
          listingFlowState: "DRAFT_READY",
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
      if (!normalizedCity?.trim() || normalizedCity.toLowerCase() === "miestas") {
        missingFields.push("city");
      }
      if (price <= 0) missingFields.push("price");
      const attributes = enriched.attributes;
      const sellerType = String(attributes.sellerType ?? "").trim();
      if (!sellerType) missingFields.push("sellerType");
      if (enriched.category === "vehicles") {
        if (!String(attributes.make ?? "").trim()) missingFields.push("make");
        if (!String(attributes.model ?? "").trim()) missingFields.push("model");
        if (!String(attributes.year ?? "").trim()) missingFields.push("year");
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
        allowPastomatas: true,
      };

      const gate = evaluateOmnivaPastomatasGatekeeper({
        title: draft.title,
        description: draft.description,
        category: draft.category,
        attributes: draft.attributes,
      });
      if (gate.oversized) {
        draft.allowPastomatas = false;
      }

      const suggestedQuestions: string[] = [];
      if (enriched.category === "electronics" || /iphone|telefon|mobil/i.test(enriched.title)) {
        suggestedQuestions.push(
          "Kokia jūsų telefono spalva ir vidinė atmintis — 128 ar 256 GB?"
        );
        suggestedQuestions.push("Ar pridedate originalų įkroviklį ir dėžutę?");
      }
      if (missingFields.includes("price")) {
        suggestedQuestions.push(
          "Kokią kainą norėtumėte — greitam pardavimui ar maksimaliai vertei?"
        );
      }
      if (enriched.category === "vehicles" && missingFields.includes("make")) {
        suggestedQuestions.push("Kokia automobilio markė? Pvz. BMW, Volkswagen, Toyota.");
      }
      if (enriched.category === "vehicles" && missingFields.includes("model")) {
        suggestedQuestions.push("Koks modelis? Pvz. Golf, 520, Corolla.");
      }
      if (enriched.category === "vehicles" && missingFields.includes("year")) {
        suggestedQuestions.push("Kokie pagaminimo ar registracijos metai ir kokia rida?");
      }
      if (missingFields.includes("sellerType")) {
        suggestedQuestions.push(
          "Ar keliate skelbimą kaip privatus asmuo, ar kaip įmonė/verslas?"
        );
      }
      // City last — only if truly missing (profile sync may fill later).
      if (missingFields.includes("city") && suggestedQuestions.length < 3) {
        suggestedQuestions.push("Kurį miestą rodyti pirkėjams skelbime?");
      }

      const voiceFollowUp = buildSellerContextualVoiceFollowUp(
        enriched.category,
        attributes,
        missingFields
      );
      const voiceFollowUpWithGate = gate.oversized
        ? `${voiceFollowUp}\n\n${OMNIVA_OVERSIZE_BLOCK_MESSAGE}`
        : voiceFollowUp;

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
          voiceFollowUp: voiceFollowUpWithGate,
          marketAnalysis,
          proactivePricingMessage,
          marketAnalysisDeferred,
        },
        sideEffect: {
          type: "listing_draft",
          listingDraft: draft,
          imageUrl: imageUrls[0],
          imageUrls: imageUrls.slice(0, 6),
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
        ? args.imageUrls.map(String).filter(Boolean).slice(0, 6)
        : [];
      const categoryHint = args.category ? String(args.category) : ctx.listingDraft?.category;
      const prior = ctx.listingDraft;

      try {
        const parsed = await parseListingImagesForAgent({
          imageDataUrls: imageUrls,
          userCity: ctx.userCity,
          contact: ctx.contact,
          extraContext: [
            categoryHint ? `category hint: ${categoryHint}` : "",
            "Vision: enrich listing description with color, condition, equipment, and visible defects from ALL photos.",
          ]
            .filter(Boolean)
            .join("; "),
        });

        const listingAttrs = Object.fromEntries(
          Object.entries(parsed.listing.attributes).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.join(", ") : String(v),
          ])
        );

        const priorDesc = String(prior?.description ?? "").trim();
        const visionDesc = String(parsed.listing.description ?? "").trim();
        let mergedDescription = visionDesc || priorDesc;
        if (priorDesc && visionDesc && !priorDesc.includes(visionDesc) && !visionDesc.includes(priorDesc)) {
          mergedDescription = `${priorDesc}\n\n${visionDesc}`;
        } else if (priorDesc && visionDesc) {
          mergedDescription = priorDesc.length >= visionDesc.length ? priorDesc : visionDesc;
        }

        const draft = {
          title: parsed.listing.title || prior?.title || "",
          description: mergedDescription,
          price: parsed.listing.price || prior?.price || 0,
          location: parsed.listing.location || prior?.location || ctx.userCity || "",
          contact: ctx.contact || "",
          category: parsed.listing.category || prior?.category || "other",
          confidence: parsed.listing.confidence,
          attributes: {
            ...(prior?.attributes ?? {}),
            ...listingAttrs,
          },
          listingFlowState: "AWAITING_CONFIRMATION" as const,
        };

        if (parsed.needsClarification) {
          const message =
            parsed.clarificationPrompt ||
            "Matau kelis objektus nuotraukoje — kurį norite parduoti? Pasirinkite žemiau.";
          const quickReplies = parsed.choiceChips.slice(0, 4);
          return {
            result: {
              ok: true,
              needsClarification: true,
              choiceChips: quickReplies,
              quickReplies,
              message,
              voiceAnnouncement: message,
            },
          };
        }

        const message = buildPostValidationReportMessage({
          category: draft.category,
          title: draft.title,
          description: draft.description,
          price: draft.price,
          location: draft.location,
          attributes: draft.attributes,
        });
        const quickReplies = [...POST_VALIDATION_QUICK_REPLIES];

        return {
          result: {
            ok: true,
            needsClarification: false,
            draft,
            voiceAnnouncement: message,
            message,
            quickReplies,
            imageUrls,
          },
          sideEffect: {
            type: "listing_draft",
            listingDraft: draft,
            imageUrl: imageUrls[0],
            imageUrls,
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

      const message = buildListingDraftUpdateReply({
        category: draft.category,
        title: draft.title,
        description: draft.description,
        price: draft.price,
        location: draft.location,
        attributes: draft.attributes,
      });

      return {
        result: {
          ok: true,
          message,
          draft,
          quickReplies: [...POST_VALIDATION_QUICK_REPLIES],
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

    case "updateUIFilters": {
      const normalized = normalizeUpdateUIFiltersArgs(args);
      const queryText =
        normalized.query?.trim() || normalized.filters.query?.trim() || "";

      const baseResult = {
        ok: true,
        filters: normalized.filters,
        categoryAttributes: normalized.categoryAttributes,
        label: normalized.label,
        activateWardrobe: normalized.activateWardrobe,
        query: queryText || normalized.query,
      };

      const uiOnlySideEffect = {
        type: "apply_ui_filters" as const,
        filters: normalized.filters,
        categoryAttributes: normalized.categoryAttributes,
        label: normalized.label,
        activateWardrobe: normalized.activateWardrobe,
        query: queryText || normalized.query,
      };

      if (!queryText) {
        return { result: baseResult, sideEffect: uiOnlySideEffect };
      }

      const filteredRows = await searchListingsFiltered({
        query: queryText,
        category: normalized.filters.category,
        city: normalized.filters.city,
        minPrice: normalized.filters.minPrice,
        maxPrice: normalized.filters.maxPrice,
        limit: 500,
      });

      const searchFilters: AgentSearchFilters = {
        ...normalized.filters,
        query: queryText,
      };

      if (filteredRows.length > 0) {
        return {
          result: { ...baseResult, matchCount: filteredRows.length },
          sideEffect: {
            type: "search",
            searchQuery: queryText,
            listingIds: filteredRows.map((l) => l.id),
            filters: searchFilters,
          },
        };
      }

      return {
        result: { ...baseResult, matchCount: 0 },
        sideEffect: {
          type: "empty_search",
          searchQuery: queryText,
          filters: searchFilters,
        },
      };
    }

    case "navigateToScreen": {
      const screen = String(args.screen ?? "").trim();
      const nav = resolveNavigateScreen(screen);
      if (!nav.ok) {
        return { result: { ok: false, message: nav.message } };
      }
      const filterPayload =
        args.filters && typeof args.filters === "object" && !Array.isArray(args.filters)
          ? normalizeUpdateUIFiltersArgs(args.filters as Record<string, unknown>)
          : undefined;
      const label =
        String(args.label ?? "").trim() ||
        filterPayload?.label ||
        nav.message;
      return {
        result: {
          ok: true,
          screen: nav.screen,
          path: nav.path,
          activateWardrobe: nav.activateWardrobe,
          label,
        },
        sideEffect: {
          type: "navigate_to_screen",
          screen: nav.screen,
          path: nav.path,
          activateWardrobe: nav.activateWardrobe,
          zeroUi: nav.zeroUi as ZeroUiScreen | undefined,
          view: nav.view as AppView | undefined,
          filters: filterPayload?.filters,
          categoryAttributes: filterPayload?.categoryAttributes,
          label,
          query: filterPayload?.query,
        },
      };
    }

    case "createUserRequirement": {
      const normalized = normalizeUserRequirementArgs(args);
      const label =
        String(args.label ?? "").trim() ||
        `Puiku! Užfiksavau tavo norą „${normalized.query}" — pranešiu, kai atsiras!`;

      if (!normalized.query || normalized.query.length < 3) {
        return {
          result: {
            ok: false,
            message: "Per trumpa pageidavimo užklausa — reikia bent 3 simbolių.",
          },
        };
      }

      if (!ctx.authUserId) {
        return {
          result: {
            ok: false,
            needsAuth: true,
            message:
              "Kad galėčiau fone stebėti rinką, prisijunk — tada iškart užfiksuosiu tavo norą.",
            requirement: normalized,
          },
          sideEffect: {
            type: "create_user_requirement",
            query: normalized.query,
            requirement: normalized,
            label,
            needsAuth: true,
          },
        };
      }

      try {
        const created = await insertUserRequirement(ctx.authUserId, {
          ...normalized,
          source: "agent",
        });
        if (!created) {
          return {
            result: { ok: false, message: "Nepavyko išsaugoti pageidavimo." },
          };
        }
        return {
          result: {
            ok: true,
            requirementId: created.id,
            query: normalized.query,
            message: label,
          },
          sideEffect: {
            type: "create_user_requirement",
            requirementId: created.id,
            query: normalized.query,
            requirement: normalized,
            label,
          },
        };
      } catch (e) {
        return {
          result: {
            ok: false,
            message:
              e instanceof Error ? e.message : "Nepavyko išsaugoti pageidavimo DB.",
          },
        };
      }
    }

    case "proposeSmartBargaining": {
      const listingId = String(args.listingId ?? ctx.activeListingId ?? "").trim();
      const listingTitle = String(
        args.listingTitle ?? ctx.activeListingTitle ?? "Skelbimas"
      ).trim();
      const listingPrice = Number(args.listingPrice) || 0;
      const category = args.category ? String(args.category) : undefined;
      const wardrobeMode = Boolean(args.wardrobeMode) || category === "clothing";

      if (!listingId || listingPrice <= 0) {
        return {
          result: {
            ok: false,
            message: "Reikia listingId ir listingPrice derybų pasiūlymui.",
          },
        };
      }

      const proposal = buildSmartBargainingProposal({
        listingPrice,
        listingTitle,
        category,
        wardrobeMode,
      });
      const label = String(args.label ?? "").trim() || proposal.openerMessage;

      return {
        result: {
          ok: true,
          ...proposal,
          listingId,
          listingTitle,
          listingPrice,
          message: label,
          quickReplies: proposal.quickReplies,
        },
        sideEffect: {
          type: "propose_bargaining",
          listingId,
          listingTitle,
          listingPrice,
          discountPercentMin: proposal.discountPercentMin,
          discountPercentMax: proposal.discountPercentMax,
          suggestedOfferMin: proposal.suggestedOfferMin,
          suggestedOfferMax: proposal.suggestedOfferMax,
          label,
          wardrobeMode,
          openChat: true,
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

    case "analyzeWardrobePhoto": {
      const imageUrl = String(args.imageUrl ?? "").trim();
      if (!imageUrl) {
        return { result: { ok: false, message: "Reikalinga nuotraukos nuoroda." } };
      }
      try {
        const result = await analyzeWardrobePhoto({
          imageDataUrl: imageUrl,
          userName: ctx.userName,
        });
        const count = result.items.length;
        const quickReplies =
          count > 0
            ? ["Patvirtinti visus skelbimus", "Redaguoti po vieną", "Įkelti kitą nuotrauką"]
            : ["Įkelti kitą nuotrauką", "Rankinis įvedimas"];
        return {
          result: {
            ok: count > 0,
            itemCount: count,
            items: result.items,
            message: result.voiceAnnouncement,
            quickReplies: quickReplies.slice(0, 4),
          },
          ...(count > 0
            ? {
                sideEffect: {
                  type: "wardrobe_bulk" as const,
                  items: result.items,
                  imageUrl,
                  voiceAnnouncement: result.voiceAnnouncement,
                },
              }
            : {}),
        };
      } catch (e) {
        return {
          result: {
            ok: false,
            message: e instanceof Error ? e.message : "Nepavyko analizuoti drabužių nuotraukos.",
          },
        };
      }
    }

    case "importWardrobeProfile": {
      const profileUrl = String(args.profileUrl ?? "").trim();
      if (!profileUrl) {
        return { result: { ok: false, message: "Įveskite portalo profilio nuorodą." } };
      }
      try {
        const result = await importWardrobeProfile({
          profileUrl,
          userName: ctx.userName,
          defaultLocation: ctx.userCity,
        });
        const importItems = result.items.map((item, idx) => ({
          id: item.id || `import-${idx + 1}`,
          title: item.title,
          categoryGroup: "Moterims",
          categorySub: item.category,
          size: item.size,
          color: item.color,
          brand: item.brand,
          condition: item.condition,
          suggestedPrice: item.price,
          description: item.description,
        }));
        return {
          result: {
            ok: result.items.length > 0,
            itemCount: result.itemCount,
            wardrobeValueTotal: result.wardrobeValueTotal,
            message: result.voiceAnnouncement,
            quickReplies:
              result.items.length > 0
                ? ["Peržiūrėti importą", "Patvirtinti visus", "Atidaryti Spintą"]
                : ["Bandyti kitą nuorodą"],
          },
          ...(importItems.length > 0
            ? {
                sideEffect: {
                  type: "wardrobe_bulk" as const,
                  items: importItems,
                  voiceAnnouncement: result.voiceAnnouncement,
                },
              }
            : {}),
        };
      } catch (e) {
        return {
          result: {
            ok: false,
            message: e instanceof Error ? e.message : "Nepavyko importuoti profilio.",
          },
        };
      }
    }

    case "analyzeMagicMirrorFit": {
      const listingTitle = String(args.listingTitle ?? ctx.activeListingTitle ?? "Drabužis").trim();
      const buyerFirst = (ctx.userName ?? "drauge").split(/\s+/)[0] || "drauge";
      try {
        const fit = await analyzeMagicMirrorFit({
          buyerName: buyerFirst,
          listingTitle,
          buyerMeasurements: {
            usualSize: args.buyerUsualSize ? String(args.buyerUsualSize) : undefined,
          },
          garmentMeasurements: {
            sizeLabel: args.garmentSize ? String(args.garmentSize) : undefined,
          },
          listingDescription: args.listingDescription
            ? String(args.listingDescription)
            : undefined,
        });
        return {
          result: {
            ok: true,
            fitScore: fit.fitScore,
            verdict: fit.verdict,
            message: fit.recommendation,
            sellerTip: fit.sellerTip,
          },
        };
      } catch (e) {
        return {
          result: {
            ok: false,
            message: e instanceof Error ? e.message : "Nepavyko įvertinti dydžio.",
          },
        };
      }
    }

    case "getSellerTrustScore": {
      const sellerId = String(args.sellerId ?? "").trim();
      if (!sellerId) {
        return { result: { ok: false, message: "Nenurodytas pardavėjo ID." } };
      }
      try {
        const trust = await buildSellerTrustSummary({
          sellerId,
          sellerName: args.sellerName ? String(args.sellerName) : undefined,
          buyerName: ctx.userName,
        });
        return {
          result: {
            ok: true,
            score: trust.score,
            reviewCount: trust.reviewCount,
            message: trust.recommendation,
          },
        };
      } catch (e) {
        return {
          result: {
            ok: false,
            message: e instanceof Error ? e.message : "Nepavyko apskaičiuoti pasitikėjimo balo.",
          },
        };
      }
    }

    case "analyzeNegotiationTwin": {
      const buyerMessage = String(args.buyerMessage ?? "").trim();
      const listingPrice = Number(args.listingPrice) || 0;
      const minPrice = Number(args.minPrice) || 0;
      const listingTitle = String(args.listingTitle ?? ctx.activeListingTitle ?? "Skelbimas").trim();
      const sellerName = ctx.userName ?? "Pardavėjas";
      if (!buyerMessage || listingPrice <= 0 || minPrice <= 0) {
        return {
          result: {
            ok: false,
            message: "Reikia pirkėjo žinutės, skelbimo ir minimalios kainos.",
          },
        };
      }
      try {
        const twin = await runAutoNegotiation({
          buyerMessage,
          listingPrice,
          minPrice,
          listingTitle,
          sellerName,
        });
        return {
          result: {
            ok: true,
            dealReady: twin.dealReady,
            offeredPrice: twin.offeredPrice,
            counterPrice: twin.counterPrice,
            message: twin.autoReply || twin.sellerNotification,
            sellerNotification: twin.sellerNotification,
          },
        };
      } catch (e) {
        return {
          result: {
            ok: false,
            message: e instanceof Error ? e.message : "Nepavyko analizuoti derybų.",
          },
        };
      }
    }

    case "getBusinessInsights": {
      if (ctx.userRole !== "business" && ctx.userRole !== "admin") {
        return {
          result: {
            ok: false,
            message: "Verslo apžvalga prieinama Business Pro paskyroms.",
          },
        };
      }
      const metrics = ctx.sellerMetrics ?? {
        views: 0,
        callClicks: 0,
        chatStarts: 0,
        saves: 0,
        interestScore: 0,
        buyerIntentCount: 0,
      };
      const { leads, unopened } = await fetchServiceLeadStats(ctx.authUserId);
      const insights = buildBusinessInsightsSummary({
        userName: ctx.userName,
        myListings: ctx.myListings ?? [],
        metrics,
        serviceLeadCount: leads.length,
        unopenedLeadCount: unopened,
      });
      return {
        result: {
          ok: true,
          ...insights,
          message: insights.message,
          quickReplies: insights.quickReplies,
        },
        sideEffect: {
          type: "zero_ui_screen",
          screen: "business_dashboard",
        },
      };
    }

    case "listServiceLeads": {
      if (ctx.userRole !== "business" && ctx.userRole !== "admin") {
        return {
          result: {
            ok: false,
            message: "Paslaugų leadai prieinami verslo paskyroms.",
          },
        };
      }
      const { leads } = await fetchServiceLeadStats(ctx.authUserId);
      const limit = Math.min(12, Math.max(1, Number(args.limit) || 8));
      const formatted = formatServiceLeadsMessage(ctx.userName, leads.slice(0, limit));
      return {
        result: {
          ok: true,
          leadCount: leads.length,
          leads: leads.slice(0, limit).map((l) => ({
            id: l.id,
            query: l.query,
            city: l.city,
            opened: l.opened,
          })),
          message: formatted.message,
          quickReplies: formatted.quickReplies,
        },
        sideEffect: {
          type: "zero_ui_screen",
          screen: "business_dashboard",
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
        allowPastomatas?: boolean;
        listingFlowState?:
          | "DRAFTING_TEXT"
          | "AWAITING_PHOTOS"
          | "DRAFT_READY"
          | "AWAITING_CONFIRMATION";
      };
      imageUrl?: string;
      /** All uploaded photos for this draft (multi-image, max 6). */
      imageUrls?: string[];
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
      filters?: AgentSearchFilters;
    }
  | {
      type: "browse_all";
      replyMessage: string;
      listingCount: number;
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
      activateWardrobe?: boolean;
      query?: string;
    }
  | {
      type: "navigate_to_screen";
      screen: string;
      path: string;
      activateWardrobe?: boolean;
      zeroUi?: ZeroUiScreen;
      view?: AppView;
      filters?: AgentSearchFilters;
      categoryAttributes?: Record<string, string>;
      label?: string;
      query?: string;
    }
  | {
      type: "create_user_requirement";
      requirementId?: string;
      query: string;
      requirement?: {
        query: string;
        category?: string;
        city?: string;
        maxPrice?: number;
        minPrice?: number;
        size?: string;
        subcategory?: string;
        wardrobeMode?: boolean;
        filters?: Record<string, unknown>;
      };
      label?: string;
      needsAuth?: boolean;
    }
  | {
      type: "propose_bargaining";
      listingId: string;
      listingTitle: string;
      listingPrice: number;
      discountPercentMin: number;
      discountPercentMax: number;
      suggestedOfferMin: number;
      suggestedOfferMax: number;
      label?: string;
      wardrobeMode?: boolean;
      openChat?: boolean;
    }
  | {
      type: "wardrobe_bulk";
      items: Array<{
        id: string;
        title: string;
        categoryGroup: string;
        categorySub: string;
        size: string;
        color: string;
        brand: string;
        condition: string;
        suggestedPrice: number;
        description: string;
        descriptionVariants?: Record<string, string>;
      }>;
      imageUrl?: string;
      voiceAnnouncement?: string;
    };
