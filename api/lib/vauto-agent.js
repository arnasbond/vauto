const SYSTEM_INSTRUCTION = `Tu esi VAUTO – proaktyvus Lietuvos skelbimų turgaus AI vedlys (wizard).
Vesk vartotoją pokalbiu lietuviškai. Pardavimui — postNewListing + analyzeMarketPrice, klausk trūkstamų duomenų.
Automobiliams — paklausk VIN. Prieš publikavimą — privatus ar įmonė. Neprisijungusiam — pasiūlyk paskyrą.
Paieškai — searchListings; jei 0 rezultatų — registerWanted ir pasiūlyk pageidavimų sąrašą.
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
];

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

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

  return { result: { error: `Unknown tool: ${name}` } };
}

async function geminiAgentTurn(contents, model) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        tools: [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        generationConfig: { temperature: 0.35 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => p.text)
    .map((p) => p.text)
    .join("\n")
    .trim();
  return { parts, text };
}

async function openaiAgentFallback(messages, toolSummary) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("No AI key");
  const history = messages
    .map((m) => `${m.role === "user" ? "Vartotojas" : "VAUTO"}: ${m.text}`)
    .join("\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        {
          role: "user",
          content: `${history}\n\n${toolSummary}\n\nAtsakyk lietuviškai.`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "Supratau.";
}

async function runVautoAgent(req) {
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
  if (wizardBits.length) {
    contents.unshift({
      role: "user",
      parts: [{ text: `[Vedlio kontekstas: ${wizardBits.join("; ")}]` }],
    });
  }

  const toolCalls = [];
  let sideEffect;
  let finalText = "";

  if (process.env.GEMINI_API_KEY?.trim()) {
    for (let round = 0; round < 5; round++) {
      let parts = [];
      let text = "";
      for (const model of GEMINI_MODELS) {
        try {
          const turn = await geminiAgentTurn(contents, model);
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
        if (fx && !sideEffect) sideEffect = fx;
        responseParts.push({ functionResponse: { name, response: result } });
      }
      contents.push({ role: "user", parts: responseParts });
      if (text) finalText = text;
    }
  }

  if (!finalText) {
    const toolSummary = toolCalls.map((t) => `${t.name}: ${JSON.stringify(t.result)}`).join("\n");
    finalText = await openaiAgentFallback(req.messages ?? [], toolSummary);
  }

  return {
    ok: true,
    reply: finalText,
    toolCalls,
    actions: sideEffect ?? { type: "none" },
  };
}

function hasAgentKey() {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
  );
}

module.exports = { runVautoAgent, hasAgentKey };
