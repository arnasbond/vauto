const { resolveGeminiApiKey } = require("./gemini-config");
const {
  mergeVehicleToolArgs,
  enrichVehicleListingDraftFromArgs,
} = require("./vehicle-attribute-extract");
const { buildSellerContextualVoiceFollowUp } = require("./seller-voice-prompt");
const {
  resolveLtCityNominative,
  normCityForFilter,
  LT_LOCATION_AGENT_HINT,
} = require("./lithuanian-location-normalize");
const {
  AGENT_MEMORY_SYSTEM_HINT,
  buildAgentMemoryContextBlock,
} = require("./agent-memory-context");
const { resolveAgentDefaultCity } = require("./zero-ui-defaults");
const { runMarketPriceAnalysis } = require("./market-price-analysis");
const { scheduleDeferredListingMarketAnalysis } = require("./background-market-analysis");
const {
  buildProactivePricingMessage,
  buildProactiveSearchResetMessage,
} = require("./proactive-agent");
const {
  resolveMonetizationState,
  inferMicroPaymentProduct,
  defaultPriceForProduct,
  shouldOfferSmartBoost,
  buildSmartBoostProactiveMessage,
  buildMicroPaymentVoiceReply,
  buildBusinessProUpsellMessage,
  requiresBusinessProForRegionStats,
  SMART_BOOST_C2C,
  SMART_BOOST_B2B,
  B2B_LEAD_PRICE,
  BUSINESS_MONTHLY_PRO,
} = require("./monetization-engine");
const { DEMO_LISTINGS_SNAPSHOT } = require("./demo-listings-snapshot.js");

const BUDDY_REPEAT_PROMPT =
  "Atsiprašau, ne viską aiškiai išgirdau. Ar galėtumėte pakartoti komandą?";

const STATE_SEARCH_REPLY = "Atidarau skelbimus ekrane.";
const STATE_EMPTY_SEARCH_REPLY = "Rezultatų nerasta.";

const SYSTEM_INSTRUCTION = `Tu esi VAUTO – proaktyvus Lietuvos skelbimų turgaus AI vedlys (wizard).
Vesk vartotoją pokalbiu lietuviškai. Pardavimui — postNewListing + analyzeMarketPrice, klausk trūkstamų duomenų.
${LT_LOCATION_AGENT_HINT}
${AGENT_MEMORY_SYSTEM_HINT}
AUTOMOBILIAMS: iš balso/teksto VISADA ištrauk make, model, year (atskirais laukais arba attributes) ir perduok postNewListing su category=vehicles.
Kai postNewListing grąžina voiceFollowUp — ištark VERBATIM kaip TTS atsakymą.
Automobiliams — paklausk VIN. Prieš publikavimą — privatus ar įmonė. Neprisijungusiam — pasiūlyk paskyrą.
Paieškai — searchListings + showZeroUiScreen(marketplace). NIEKADA neišvardink skelbimų tekstu — tik „Atidarau skelbimus ekrane." arba „Rezultatų nerasta."; registerWanted kviesk TIK kai užklausa visiškai nesusieta su katalogu (pvz. „kosminis laivas“).
triggerMicroPayment — C2C Smart Boost ${SMART_BOOST_C2C} €, B2B Smart Boost ${SMART_BOOST_B2B} €, Lead Gen ${B2B_LEAD_PRICE} €. B2B nemokamam verslui gili regiono paklausa — siūlyk Business Pro ${BUSINESS_MONTHLY_PRO} €/mėn (showZeroUiScreen business_dashboard), ne triggerMicroPayment.
Navigacijai — navigate_view (home, discover, search_results, add_listing, seller_wizard, chats, profile, admin_ai).
KETINIMO ATPAŽINIMAS: „noriu kelti skelbimą“ / parduoti → navigate_view(add_listing) arba postNewListing. NIEKADA searchListings. Paieškai → search_results.
Klaidoms — trackUserError. Admin — blockListing. Būk glaustas, be emoji.`;

const AGENT_FUNCTION_DECLARATIONS = [
  {
    name: "searchListings",
    description: "Ieško skelbimų pagal kategoriją, kainą, miestą arba raktažodžius.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING" },
        category: { type: "STRING" },
        maxPrice: { type: "NUMBER" },
        minPrice: { type: "NUMBER" },
        city: {
          type: "STRING",
          description:
            "Lietuvos miestas vardininku — normalizuok iš bet kurio linksnio (Panevėžyje → Panevėžys)",
        },
        limit: { type: "INTEGER" },
      },
    },
  },
  {
    name: "postNewListing",
    description:
      "Paruošia skelbimo juodraštį. Automobiliams (vehicles) PRIVALOMA ištraukti make, model, year iš balso/teksto.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        price: { type: "NUMBER" },
        city: { type: "STRING" },
        category: { type: "STRING" },
        make: { type: "STRING", description: "Automobilio markė (vehicles)" },
        model: { type: "STRING", description: "Automobilio modelis (vehicles)" },
        year: { type: "INTEGER", description: "Metai (vehicles)" },
        imageUrls: { type: "ARRAY", items: { type: "STRING" } },
        attributes: { type: "OBJECT" },
      },
      required: ["title", "description", "category", "city"],
    },
  },
  {
    name: "analyzeMarketPrice",
    description: "Rinkos kainų analizė pagal markę, modelį, metus.",
    parameters: {
      type: "OBJECT",
      properties: {
        brand: { type: "STRING" },
        model: { type: "STRING" },
        year: { type: "INTEGER" },
        category: { type: "STRING" },
        city: { type: "STRING" },
      },
    },
  },
  {
    name: "trackUserError",
    description: "Proaktyvus atsakymas į sistemos klaidą.",
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
    description: "Admin — pažymi skelbimą moderavimui.",
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
    description: "Registruoja pageidavimą, kai paieška grąžina 0 rezultatų.",
    parameters: {
      type: "OBJECT",
      properties: { query: { type: "STRING" } },
      required: ["query"],
    },
  },
  {
    name: "triggerMicroPayment",
    description:
      "Zero-UI mikro-mokėjimas. C2C boost 2.99 €, B2B boost 29.99 €, lead 14.99 €. Regiono statistika — tik Business Pro 199 €/mėn.",
    parameters: {
      type: "OBJECT",
      properties: {
        reason: { type: "STRING" },
        price: { type: "NUMBER" },
      },
      required: ["reason", "price"],
    },
  },
  {
    name: "showZeroUiScreen",
    description:
      "Zero-UI ekranas: marketplace | listing_preview | business_dashboard | admin_panel",
    parameters: {
      type: "OBJECT",
      properties: {
        screen: { type: "STRING" },
      },
      required: ["screen"],
    },
  },
  {
    name: "navigate_view",
    description:
      "Perjungia programėlės vaizdą be puslapio perkrovimo (Zero-UI).",
    parameters: {
      type: "OBJECT",
      properties: {
        view: {
          type: "STRING",
          description:
            "home | discover | search_results | add_listing | seller_wizard | chats | profile | admin_ai",
        },
        params: { type: "OBJECT" },
      },
      required: ["view"],
    },
  },
];

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const VALID_ZERO_UI_SCREENS = [
  "marketplace",
  "listing_preview",
  "business_dashboard",
  "admin_panel",
];
const VALID_APP_VIEWS = [
  "home",
  "discover",
  "search_results",
  "add_listing",
  "seller_wizard",
  "chats",
  "profile",
  "admin_ai",
];
const MAX_ADMIN_PROJECT_CONTEXT_CHARS = 80_000;
const GEMINI_AGENT_TIMEOUT_MS = 28_000;

function agentError(code, message, status = 503) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildAgentSystemInstruction(baseInstruction, adminProjectContext) {
  const trimmed = adminProjectContext?.trim();
  if (!trimmed) return baseInstruction;
  const capped = trimmed.slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
  return `${baseInstruction}\n\nTu privalai atsižvelgti į šią istorinę projekto vystymo medžiagą: ${capped}`;
}

function normCity(loc) {
  return normCityForFilter(loc);
}

function resolveAgentListings(ctx) {
  const fromClient = Array.isArray(ctx.listingsSnapshot) ? ctx.listingsSnapshot : [];
  const byId = new Map(DEMO_LISTINGS_SNAPSHOT.map((listing) => [listing.id, listing]));
  for (const item of fromClient) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : item);
  }
  return Array.from(byId.values());
}

function executeAgentTool(name, args, ctx) {
  const listings = resolveAgentListings(ctx);

  if (name === "searchListings") {
    const query = String(args.query ?? "").toLowerCase();
    const category = args.category ? String(args.category) : undefined;
    const maxPrice = args.maxPrice != null ? Number(args.maxPrice) : undefined;
    const minPrice = args.minPrice != null ? Number(args.minPrice) : undefined;
    const cityRaw = args.city ? String(args.city).trim() : "";
    const cityNominative = cityRaw ? resolveLtCityNominative(cityRaw) : "";
    const city = cityNominative ? normCity(cityNominative) : "";

    let filtered = listings.filter((l) => l.price > 0);
    if (category) filtered = filtered.filter((l) => l.category === category);
    if (maxPrice != null && !Number.isNaN(maxPrice)) filtered = filtered.filter((l) => l.price <= maxPrice);
    if (minPrice != null && !Number.isNaN(minPrice)) filtered = filtered.filter((l) => l.price >= minPrice);
    if (city) {
      filtered = filtered.filter(
        (l) => normCity(l.location) === city || l.location.toLowerCase().includes(city)
      );
    }
    if (query) {
      const tokens = query.split(/[\s,.;:!?]+/).filter((t) => t.length >= 2);
      filtered = filtered.filter((l) => {
        const haystack = `${l.title} ${l.description ?? ""} ${l.category}`.toLowerCase();
        if (!tokens.length) return haystack.includes(query);
        const hits = tokens.filter((t) => haystack.includes(t)).length;
        return hits >= Math.max(1, Math.ceil(tokens.length * 0.34));
      });
    }
    const limitRaw = Number(args.limit);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : filtered.length;
    const results = filtered.slice(0, limit);
    const searchQuery = [query, category, cityNominative].filter(Boolean).join(" ").trim();
    const searchFilters = {
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
          results.length > 0 ? undefined : "Rezultatų su naujais kriterijais nerasta.",
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
              searchQuery: searchQuery || results[0].title,
              listingIds: results.map((r) => r.id),
              filters: searchFilters,
              filtersReset: Boolean(ctx.searchSessionReset),
              proactiveMessage,
            }
          : { type: "empty_search", searchQuery: searchQuery || query || "paieška" },
    };
  }

  if (name === "postNewListing") {
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
    const mergedAttrs = mergeVehicleToolArgs(args);
    const enriched = enrichVehicleListingDraftFromArgs(
      title,
      description,
      String(args.category ?? "other"),
      mergedAttrs
    );
    const attributes = enriched.attributes;
    const missingFields = [];
    if (!normalizedCity?.trim() || normalizedCity.toLowerCase() === "miestas") {
      missingFields.push("city");
    }
    if (price <= 0) missingFields.push("price");
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
    };
    const voiceFollowUp = buildSellerContextualVoiceFollowUp(
      enriched.category,
      attributes,
      missingFields
    );
    const imageUrls = Array.isArray(args.imageUrls) ? args.imageUrls.map(String) : [];
    let marketAnalysis = null;
    let proactivePricingMessage = null;
    const monState =
      ctx.monetization ?? resolveMonetizationState({ userRole: ctx.userRole });
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
        draft,
        missingFields,
        voiceFollowUp,
        marketAnalysis,
        proactivePricingMessage,
        marketAnalysisDeferred,
      },
      sideEffect: { type: "listing_draft", listingDraft: draft, imageUrl: imageUrls[0] },
    };
  }

  if (name === "analyzeMarketPrice") {
    const brand = String(args.brand ?? "").toLowerCase();
    const model = String(args.model ?? "").toLowerCase();
    const year = args.year != null ? String(args.year) : "";
    const category = args.category ? String(args.category) : undefined;
    const cityRaw = args.city ? String(args.city).trim() : "";
    const cityNominative = cityRaw ? resolveLtCityNominative(cityRaw) : "";

    const analysis = runMarketPriceAnalysis(listings, {
      title: `${brand} ${model} ${year}`.trim(),
      category,
      city: cityNominative || undefined,
      make: brand,
      model,
      year,
    });

    return {
      result: {
        sampleSize: analysis.sampleSize,
        minPrice: analysis.minPrice,
        maxPrice: analysis.maxPrice,
        medianPrice: analysis.medianPrice,
        message: analysis.message,
      },
    };
  }

  if (name === "triggerMicroPayment") {
    const reason = String(args.reason ?? "").trim();
    const product = inferMicroPaymentProduct(reason);
    const monState =
      ctx.monetization ?? resolveMonetizationState({ userRole: ctx.userRole });
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
        sideEffect: { type: "zero_ui_screen", screen: "business_dashboard" },
      };
    }
    if (product === "region_stats" && monState.tier !== "business_pro") {
      return {
        result: { ok: false, message: buildBusinessProUpsellMessage() },
      };
    }
    if (product === "smart_boost" && monState.activeBoost) {
      return {
        result: { ok: true, alreadyActive: true, message: "Smart Boost jau aktyvus." },
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

  if (name === "trackUserError") {
    const code = String(args.errorCode ?? "unknown");
    const suggestions = {
      upload_too_large: "Nuotrauka per didelė — bandykite dar kartą, sistema ją suspaus.",
      cloudinary_failed: "Įkėlimas nepavyko — galite tęsti su vietine nuotrauka.",
      ai_timeout: "AI užtruko — bandykite trumpesnį aprašymą.",
    };
    return {
      result: {
        suggestion: suggestions[code] ?? `Klaida ${code}: ${String(args.context ?? "")}`,
      },
    };
  }

  if (name === "blockListing") {
    if (ctx.userRole !== "admin") {
      return { result: { ok: false, message: "Tik administratoriui." } };
    }
    const listingId = String(args.listingId ?? "").trim();
    const reason = String(args.reason ?? "").trim();
    if (!listingId) {
      return { result: { ok: false, message: "Nenurodytas skelbimo ID." } };
    }
    return {
      result: {
        ok: true,
        listingId,
        reason,
        message: "Skelbimas pažymėtas moderavimui.",
      },
      sideEffect: { type: "block_listing", listingId, reason },
    };
  }

  if (name === "registerWanted") {
    const query = String(args.query ?? "").trim();
    return {
      result: {
        ok: query.length >= 3,
        query,
        message:
          query.length >= 3
            ? `Pageidavimas „${query}" paruoštas.`
            : "Per trumpa paieška.",
      },
      sideEffect: query.length >= 3 ? { type: "register_wanted", query } : undefined,
    };
  }

  if (name === "showZeroUiScreen") {
    const screen = String(args.screen ?? "").trim();
    if (!VALID_ZERO_UI_SCREENS.includes(screen)) {
      return {
        result: { ok: false, message: `Nežinomas Zero-UI ekranas: ${screen}` },
      };
    }
    return {
      result: { ok: true, screen },
      sideEffect: { type: "zero_ui_screen", screen },
    };
  }

  if (name === "navigate_view") {
    const view = String(args.view ?? "").trim();
    if (!VALID_APP_VIEWS.includes(view)) {
      return {
        result: {
          ok: false,
          message: `Nežinomas vaizdas: ${view}`,
        },
      };
    }
    if (view === "admin_ai" && ctx.userRole !== "admin") {
      return {
        result: { ok: false, message: "Admin AI zona tik administratoriui." },
      };
    }
    const params = {};
    if (args.params && typeof args.params === "object" && !Array.isArray(args.params)) {
      for (const [key, value] of Object.entries(args.params)) {
        if (value != null && String(value).trim()) params[key] = String(value).trim();
      }
    }
    return {
      result: { ok: true, view, params, message: `Naviguojama į ${view}.` },
      sideEffect: { type: "navigate", view, params },
    };
  }

  return { result: { error: `Unknown tool: ${name}` } };
}

async function geminiAgentTurn(contents, model, systemInstruction) {
  const key = resolveGeminiApiKey();
  if (!key) throw agentError("agent_unavailable", "GEMINI_API_KEY not set", 503);

  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          tools: [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          generationConfig: { temperature: 0.35 },
        }),
      },
      GEMINI_AGENT_TIMEOUT_MS
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw agentError(
        "gemini_error",
        `Gemini ${model} ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        res.status >= 500 ? 502 : 503
      );
    }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("\n")
      .trim();
    return { parts, text };
  } catch (e) {
    if (e.code) throw e;
    if (e.name === "AbortError") {
      throw agentError(
        "timeout",
        "Gemini API užklausa užtruko. Sumažinkite admin kontekstą arba bandykite vėliau.",
        504
      );
    }
    throw agentError("gemini_error", e.message || "Gemini API klaida", 502);
  }
}

const SEARCH_PREFIX_FAST =
  /^(?:ieškau|ieskau|i\s*eškau|i\s*eskau|rask|surask|parodyk(?:\s+visus)?|norėčiau|noreciau|ieškoti|ieskoti|find|search|show)\s+/i;

function tryFastAgentSearchPath(text, ctx) {
  const t = String(text ?? "").trim();
  if (!t || t.length > 140) return null;
  if (/\b(parduod|įdėti\s+skelb|noriu\s+parduot)\b/i.test(t)) return null;
  if (/\b(admin|moderuoti|boost|apmokėti|iškel)\b/i.test(t)) return null;

  let working = t;
  let cityNominative;
  const cityPatterns = [
    [/vilniuje|vilnius/i, "Vilnius"],
    [/kaune|kaunas/i, "Kaunas"],
    [/klaip[eė]doje|klaip[eė]da/i, "Klaipėda"],
  ];
  for (const [pattern, city] of cityPatterns) {
    if (pattern.test(working)) {
      cityNominative = city;
      working = working.replace(pattern, " ");
    }
  }

  let query = working.replace(SEARCH_PREFIX_FAST, "").replace(/\b(skelbimus?|visus)\b/gi, " ").trim();
  if (query.length < 2) return null;
  query = query.toLowerCase();

  let category;
  if (/\b(volvo|bmw|audi|vw|toyota|mercedes|auto|automob)\b/i.test(query)) {
    category = "vehicles";
  }

  const { result, sideEffect } = executeAgentTool(
    "searchListings",
    { query, category, city: cityNominative },
    ctx
  );
  const count = result?.count ?? 0;
  return {
    ok: true,
    reply: count > 0 ? STATE_SEARCH_REPLY : STATE_EMPTY_SEARCH_REPLY,
    toolCalls: [{ name: "searchListings", result: { ...result, fastPath: true } }],
    actions: sideEffect ?? { type: "none" },
  };
}

async function runVautoAgent(req) {
  try {
    return await runVautoAgentInner(req);
  } catch (e) {
    if (e.code) throw e;
    throw agentError("agent_unavailable", e.message || "AI agentas laikinai nepasiekiamas", 503);
  }
}

async function runVautoAgentInner(req) {
  const systemInstruction = buildAgentSystemInstruction(
    SYSTEM_INSTRUCTION,
    req.adminProjectContext
  );

  const ctx = {
    userCity: resolveAgentDefaultCity(req.context?.userCity),
    userRole: req.context?.userRole ?? "buyer",
    contact: req.context?.contact?.trim() || "+370 612 34567",
    listingsSnapshot: req.context?.listings ?? [],
    searchSessionReset: Boolean(req.context?.searchSessionReset),
    monetization: resolveMonetizationState({
      userRole: req.context?.userRole,
      billingPlan: req.context?.monetization?.billingPlan,
      activeBoost: req.context?.monetization?.activeBoost,
      walletBalance: req.context?.monetization?.walletBalance,
    }),
  };

  const memoryBlock = buildAgentMemoryContextBlock({
    defaultRegion: req.context?.defaultRegion ?? ctx.userCity,
    primaryVehicle: req.context?.primaryVehicle,
    activeSearchFilters: req.context?.activeSearchFilters ?? null,
  });

  const lastUser = [...(req.messages ?? [])].reverse().find((m) => m.role === "user");
  if (lastUser) {
    const fast = tryFastAgentSearchPath(lastUser.text, ctx);
    if (fast) return fast;
  }

  const contents = (req.messages ?? []).map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  if (req.context?.lastError?.code) {
    contents.unshift({
      role: "user",
      parts: [
        {
          text: `[Klaida: ${req.context.lastError.code}] ${req.context.lastError.message ?? ""}`,
        },
      ],
    });
  }

  const wizardBits = [];
  if (req.context?.wizardMode) wizardBits.push(`wizardMode=${req.context.wizardMode}`);
  if (req.context?.isAuthenticated === false) wizardBits.push("isAuthenticated=false");
  if (req.context?.missingFields?.length) {
    wizardBits.push(`missingFields=${req.context.missingFields.join(",")}`);
  }
  if (req.context?.listingDraft) {
    wizardBits.push(`listingDraft=${JSON.stringify(req.context.listingDraft)}`);
  }
  if (req.context?.searchResultCount === 0 && req.context?.lastSearchQuery) {
    wizardBits.push(`emptySearchQuery=${req.context.lastSearchQuery}`);
  }
  if (req.context?.currentView) {
    wizardBits.push(`currentView=${req.context.currentView}`);
  }
  if (wizardBits.length) {
    contents.unshift({
      role: "user",
      parts: [{ text: `[Vedlio kontekstas: ${wizardBits.join("; ")}]` }],
    });
  }

  if (memoryBlock) {
    contents.unshift({
      role: "user",
      parts: [{ text: memoryBlock }],
    });
  }

  const toolCalls = [];
  let sideEffect;
  let navigateEffect;
  let microPaymentEffect;
  let finalText = "";

  if (resolveGeminiApiKey()) {
    for (let round = 0; round < 5; round++) {
      let parts = [];
      let text = "";
      for (const model of GEMINI_MODELS) {
        try {
          const turn = await geminiAgentTurn(contents, model, systemInstruction);
          parts = turn.parts;
          text = turn.text;
          break;
        } catch (e) {
          console.warn(`[vauto-agent] ${model}:`, e.message);
        }
      }
      if (!parts.length) break;

      const functionCalls = parts.filter((p) => p.functionCall);
      if (!functionCalls.length) {
        finalText = text || "Supratau.";
        break;
      }

      contents.push({ role: "model", parts: functionCalls });
      const responseParts = [];
      for (const fc of functionCalls) {
        const { name, args } = fc.functionCall;
        const { result, sideEffect: fx } = executeAgentTool(name, args ?? {}, ctx);
        toolCalls.push({ name, result });
        if (fx) {
          if (fx.type === "micro_payment") microPaymentEffect = fx;
          else if (fx.type === "navigate") navigateEffect = fx;
          else if (!sideEffect) sideEffect = fx;
        }
        responseParts.push({ functionResponse: { name, response: result } });
      }
      contents.push({ role: "user", parts: responseParts });
      if (text) finalText = text;
    }
  }

  if (!finalText) {
    const listingCall = [...toolCalls].reverse().find((t) => t.name === "postNewListing");
    const listingResult = listingCall?.result;
    if (listingResult?.marketAnalysisDeferred && listingResult?.voiceFollowUp) {
      finalText = listingResult.voiceFollowUp;
    } else if (listingResult?.proactivePricingMessage) {
      finalText = listingResult.proactivePricingMessage;
    } else if (listingResult?.voiceFollowUp) {
      finalText = listingResult.voiceFollowUp;
    }
  }

  const paymentCall = toolCalls.find((t) => t.name === "triggerMicroPayment");
  if (
    paymentCall?.result?.message &&
    (paymentCall.result.ok || String(paymentCall.result.message).includes("Business Pro"))
  ) {
    finalText = paymentCall.result.message;
  }

  const searchSideEffect = sideEffect?.type === "search" ? sideEffect : undefined;
  const emptySearchSideEffect =
    sideEffect?.type === "empty_search" ? sideEffect : undefined;
  const searchToolCall = toolCalls.find((t) => t.name === "searchListings");
  const searchToolCount =
    searchToolCall?.result &&
    typeof searchToolCall.result === "object" &&
    "count" in searchToolCall.result
      ? Number(searchToolCall.result.count)
      : searchSideEffect?.listingIds?.length ?? 0;

  if (searchToolCall || searchSideEffect || emptySearchSideEffect) {
    finalText =
      searchToolCount > 0 || searchSideEffect
        ? STATE_SEARCH_REPLY
        : STATE_EMPTY_SEARCH_REPLY;
  }

  if (!finalText || !finalText.trim()) {
    finalText = BUDDY_REPEAT_PROMPT;
  }

  const listingCall = toolCalls.find((t) => t.name === "postNewListing");
  if (listingCall?.result?.proactivePricingMessage) {
    finalText = listingCall.result.proactivePricingMessage;
  } else if (
    listingCall?.result?.voiceFollowUp &&
    listingCall.result.missingFields?.length &&
    !finalText.includes(String(listingCall.result.voiceFollowUp).slice(0, 24))
  ) {
    finalText = listingCall.result.voiceFollowUp;
  }

  return {
    ok: true,
    reply: finalText,
    toolCalls,
    actions: sideEffect ?? microPaymentEffect ?? navigateEffect ?? { type: "none" },
  };
}

function hasAgentKey() {
  return Boolean(resolveGeminiApiKey());
}

module.exports = { runVautoAgent, hasAgentKey };
