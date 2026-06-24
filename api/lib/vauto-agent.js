const { resolveGeminiApiKey } = require("./gemini-config");

const SYSTEM_INSTRUCTION = `Tu esi VAUTO – proaktyvus Lietuvos skelbimų turgaus AI vedlys (wizard).
Vesk vartotoją pokalbiu lietuviškai. Pardavimui — postNewListing + analyzeMarketPrice, klausk trūkstamų duomenų.
Automobiliams — paklausk VIN. Prieš publikavimą — privatus ar įmonė. Neprisijungusiam — pasiūlyk paskyrą.
Paieškai — searchListings; jei 0 rezultatų — registerWanted.
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
        city: { type: "STRING" },
        limit: { type: "INTEGER" },
      },
    },
  },
  {
    name: "postNewListing",
    description: "Paruošia naują skelbimo juodraštį patvirtinimui.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        price: { type: "NUMBER" },
        city: { type: "STRING" },
        category: { type: "STRING" },
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
  return String(loc).toLowerCase().trim().split(/[,\s]/)[0] ?? loc;
}

function executeAgentTool(name, args, ctx) {
  const listings = ctx.listingsSnapshot ?? [];

  if (name === "searchListings") {
    const query = String(args.query ?? "").toLowerCase();
    const category = args.category ? String(args.category) : undefined;
    const maxPrice = args.maxPrice != null ? Number(args.maxPrice) : undefined;
    const minPrice = args.minPrice != null ? Number(args.minPrice) : undefined;
    const city = args.city ? normCity(String(args.city)) : undefined;
    const limit = Math.min(Number(args.limit) || 12, 24);

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
      filtered = filtered.filter(
        (l) =>
          l.title.toLowerCase().includes(query) ||
          (l.description?.toLowerCase().includes(query) ?? false)
      );
    }
    const results = filtered.slice(0, limit);
    const searchQuery = [query, category, city].filter(Boolean).join(" ").trim();
    return {
      result: { count: results.length, listings: results },
      sideEffect:
        results.length > 0
          ? {
              type: "search",
              searchQuery: searchQuery || results[0].title,
              listingIds: results.map((r) => r.id),
            }
          : { type: "empty_search", searchQuery: searchQuery || query || "paieška" },
    };
  }

  if (name === "postNewListing") {
    const draft = {
      title: String(args.title ?? "Skelbimas"),
      description: String(args.description ?? ""),
      price: Number(args.price) || 0,
      location: String(args.city ?? ctx.userCity),
      contact: ctx.contact,
      category: String(args.category ?? "other"),
      confidence: 0.9,
      attributes: args.attributes && typeof args.attributes === "object" ? args.attributes : {},
    };
    const imageUrls = Array.isArray(args.imageUrls) ? args.imageUrls.map(String) : [];
    return {
      result: { ok: true, draft },
      sideEffect: { type: "listing_draft", listingDraft: draft, imageUrl: imageUrls[0] },
    };
  }

  if (name === "analyzeMarketPrice") {
    const brand = String(args.brand ?? "").toLowerCase();
    const model = String(args.model ?? "").toLowerCase();
    const year = args.year != null ? String(args.year) : "";
    let peers = listings.filter((l) => l.price > 0);
    if (args.category) peers = peers.filter((l) => l.category === String(args.category));
    if (args.city) {
      const city = normCity(String(args.city));
      peers = peers.filter(
        (l) => normCity(l.location) === city || l.location.toLowerCase().includes(city)
      );
    }
    const hay = `${brand} ${model} ${year}`.trim();
    if (hay) {
      peers = peers.filter((l) => {
        const t = `${l.title} ${l.description ?? ""}`.toLowerCase();
        if (brand && !t.includes(brand)) return false;
        if (model && !t.includes(model)) return false;
        if (year && !t.includes(year)) return false;
        return true;
      });
    }
    if (peers.length < 2) {
      return {
        result: {
          sampleSize: peers.length,
          message: "Nepakanka panašių skelbimų rinkos analizei.",
          medianPrice: peers[0]?.price ?? null,
        },
      };
    }
    const prices = peers.map((p) => p.price).sort((a, b) => a - b);
    const medianPrice = prices[Math.floor(prices.length / 2)];
    return {
      result: {
        sampleSize: peers.length,
        minPrice: prices[0],
        maxPrice: prices[prices.length - 1],
        medianPrice,
        message: `Vidutinė kaina ~${medianPrice} € (${peers.length} skelbimai).`,
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
    userCity: req.context?.userCity?.trim() || "Lietuva",
    userRole: req.context?.userRole ?? "buyer",
    contact: req.context?.contact?.trim() || "+370 612 34567",
    listingsSnapshot: req.context?.listings ?? [],
  };

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

  const toolCalls = [];
  let sideEffect;
  let navigateEffect;
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
          if (fx.type === "navigate") navigateEffect = fx;
          else if (!sideEffect) sideEffect = fx;
        }
        responseParts.push({ functionResponse: { name, response: result } });
      }
      contents.push({ role: "user", parts: responseParts });
      if (text) finalText = text;
    }
  }

  if (!finalText) {
    throw agentError(
      "agent_unavailable",
      "Gemini agentas negalėjo sugeneruoti atsakymo. Patikrinkite GEMINI_API_KEY.",
      503
    );
  }

  if (!finalText?.trim()) {
    throw agentError(
      "agent_unavailable",
      "AI agentas negalėjo sugeneruoti atsakymo. Bandykite dar kartą.",
      503
    );
  }

  return {
    ok: true,
    reply: finalText,
    toolCalls,
    actions: navigateEffect ?? sideEffect ?? { type: "none" },
  };
}

function hasAgentKey() {
  return Boolean(resolveGeminiApiKey());
}

module.exports = { runVautoAgent, hasAgentKey };
