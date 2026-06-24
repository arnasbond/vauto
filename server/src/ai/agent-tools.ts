import { adminPatchListing, getListings } from "../repository.js";

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
  listingsSnapshot?: AgentListingSummary[];
}

export const AGENT_FUNCTION_DECLARATIONS = [
  {
    name: "searchListings",
    description:
      "Ieško aktyvių skelbimų pagal raktažodžius, kategoriją, kainos intervalą ir miestą. Naudok kai vartotojas ieško prekės ar paslaugos.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Laisvas paieškos tekstas lietuviškai" },
        category: {
          type: "STRING",
          description:
            "vehicles | electronics | real_estate | clothing | services | jobs | home | other",
        },
        maxPrice: { type: "NUMBER" },
        minPrice: { type: "NUMBER" },
        city: { type: "STRING" },
        limit: { type: "INTEGER" },
      },
    },
  },
  {
    name: "postNewListing",
    description:
      "Paruošia naują skelbimo juodraštį patvirtinimui. Naudok kai vartotojas nori parduoti / įdėti skelbimą. Sugeneruok profesionalų aprašymą lietuviškai.",
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
        imageUrls: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Cloudinary arba HTTPS nuotraukų URL",
        },
        attributes: {
          type: "OBJECT",
          description: "Techniniai laukai: make, model, year, fuelType, mileage ir pan.",
        },
      },
      required: ["title", "description", "category", "city"],
    },
  },
  {
    name: "analyzeMarketPrice",
    description:
      "Grąžina rinkos kainų vidurkį ir patarimą verslui ar pardavėjui pagal markę, modelį, metus ar kategoriją.",
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
];

async function resolveListings(ctx: AgentToolContext): Promise<AgentListingSummary[]> {
  if (ctx.listingsSnapshot?.length) return ctx.listingsSnapshot;
  try {
    const rows = await getListings();
    return rows
      .filter((l) => l.status !== "sold" && !l.banned)
      .map((l) => ({
        id: l.id,
        title: l.title,
        price: l.price,
        category: l.category,
        location: l.location,
        description: l.description,
      }));
  } catch {
    return ctx.listingsSnapshot ?? [];
  }
}

function normCity(loc: string): string {
  return loc.toLowerCase().trim().split(/[,\s]/)[0] ?? loc;
}

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentToolContext
): Promise<{ result: unknown; sideEffect?: AgentSideEffect }> {
  const listings = await resolveListings(ctx);

  switch (name) {
    case "searchListings": {
      const query = String(args.query ?? "").toLowerCase();
      const category = args.category ? String(args.category) : undefined;
      const maxPrice = args.maxPrice != null ? Number(args.maxPrice) : undefined;
      const minPrice = args.minPrice != null ? Number(args.minPrice) : undefined;
      const city = args.city ? normCity(String(args.city)) : undefined;
      const limit = Math.min(Number(args.limit) || 12, 24);

      let filtered = listings.filter((l) => l.price > 0);
      if (category) filtered = filtered.filter((l) => l.category === category);
      if (maxPrice != null && !Number.isNaN(maxPrice)) {
        filtered = filtered.filter((l) => l.price <= maxPrice);
      }
      if (minPrice != null && !Number.isNaN(minPrice)) {
        filtered = filtered.filter((l) => l.price >= minPrice);
      }
      if (city) {
        filtered = filtered.filter(
          (l) =>
            normCity(l.location) === city ||
            l.location.toLowerCase().includes(city)
        );
      }
      if (query) {
        const tokens = query
          .split(/[\s,.;:!?]+/)
          .filter((t) => t.length >= 2);
        filtered = filtered.filter((l) => {
          const haystack = `${l.title} ${l.description ?? ""} ${l.category}`.toLowerCase();
          if (!tokens.length) return haystack.includes(query);
          const hits = tokens.filter((t) => haystack.includes(t)).length;
          return hits >= Math.max(1, Math.ceil(tokens.length * 0.34));
        });
      }

      const results = filtered.slice(0, limit);
      const searchQuery = [query, category, city].filter(Boolean).join(" ").trim();

      return {
        result: {
          count: results.length,
          listings: results,
          summary:
            results.length === 0
              ? "Nerasta atitinkančių skelbimų."
              : `Rasta ${results.length} skelbimų.`,
        },
        sideEffect:
          results.length > 0
            ? {
                type: "search",
                searchQuery: searchQuery || results[0]!.title,
                listingIds: results.map((r) => r.id),
              }
            : {
                type: "empty_search",
                searchQuery: searchQuery || query || "paieška",
              },
      };
    }

    case "postNewListing": {
      const title = String(args.title ?? "Skelbimas");
      const description = String(args.description ?? "");
      const price = Number(args.price) || 0;
      const city = String(args.city ?? ctx.userCity);
      const category = String(args.category ?? "other");
      const imageUrls = Array.isArray(args.imageUrls)
        ? args.imageUrls.map(String)
        : [];
      const attributes =
        args.attributes && typeof args.attributes === "object"
          ? (args.attributes as Record<string, string>)
          : {};

      const missingFields: string[] = [];
      if (!city?.trim() || city.toLowerCase() === "miestas") missingFields.push("city");
      if (price <= 0) missingFields.push("price");
      if (!description.trim()) missingFields.push("description");
      const sellerType = String(attributes.sellerType ?? "").trim();
      if (!sellerType) missingFields.push("sellerType");
      if (category === "vehicles" && !String(attributes.vin ?? "").trim()) {
        missingFields.push("vin");
      }

      const draft = {
        title,
        description,
        price,
        location: city,
        contact: ctx.contact,
        category,
        confidence: 0.9,
        attributes,
      };

      const suggestedQuestions: string[] = [];
      if (missingFields.includes("city")) {
        suggestedQuestions.push(
          `Matau, kad nenurodėte miesto. Ar skelbiame ${ctx.userCity}?`
        );
      }
      if (missingFields.includes("price")) {
        suggestedQuestions.push("Kokios kainos tikitės? Galiu patarti pagal rinką.");
      }
      if (category === "vehicles" && missingFields.includes("vin")) {
        suggestedQuestions.push(
          "Ar norėtumėte įvesti VIN kodą, kad Regitra duomenys užsipildytų automatiškai?"
        );
      }
      if (missingFields.includes("sellerType")) {
        suggestedQuestions.push(
          "Ar keliate skelbimą kaip privatus asmuo, ar kaip įmonė/verslas?"
        );
      }

      return {
        result: {
          ok: true,
          message: "Skelbimo juodraštis paruoštas patvirtinimui.",
          draft,
          missingFields,
          suggestedQuestions,
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
      const city = args.city ? normCity(String(args.city)) : undefined;

      let peers = listings.filter((l) => l.price > 0);
      if (category) peers = peers.filter((l) => l.category === category);
      if (city) {
        peers = peers.filter(
          (l) =>
            normCity(l.location) === city ||
            l.location.toLowerCase().includes(city)
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
            message:
              "Nepakanka panašių skelbimų rinkos analizei — stebėkite dominančią kainą rankiniu būdu.",
            medianPrice: peers[0]?.price ?? null,
          },
        };
      }

      const prices = peers.map((p) => p.price).sort((a, b) => a - b);
      const minPrice = prices[0]!;
      const maxPrice = prices[prices.length - 1]!;
      const medianPrice = prices[Math.floor(prices.length / 2)]!;

      return {
        result: {
          sampleSize: peers.length,
          minPrice,
          maxPrice,
          medianPrice,
          message: `Rinkoje rasta ${peers.length} panašių skelbimų: ${minPrice}–${maxPrice} €, vidurkis ~${medianPrice} €.`,
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

    default:
      return { result: { error: `Unknown tool: ${name}` } };
  }
}

export type AgentSideEffect =
  | {
      type: "search";
      searchQuery: string;
      listingIds: string[];
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
      type: "navigate";
      view: AppView;
      params?: Record<string, string>;
    };
