const PLACEHOLDER_CITY =
  /^(miestas|city|unknown|n\/?a|—|-+|\.*|xxx|placeholder|location|vieta)$/i;

/**
 * Dense LT localities (aligned with client src/lib/lt-cities.ts).
 * Nearest-neighbor / sanitize must not collapse municipalities into 9 hubs.
 */
const LT_CITIES = [
  "Vilnius",
  "Kaunas",
  "Panevėžys",
  "Klaipėda",
  "Šiauliai",
  "Alytus",
  "Marijampolė",
  "Mažeikiai",
  "Jonava",
  "Utena",
  "Telšiai",
  "Tauragė",
  "Ukmergė",
  "Plungė",
  "Kėdainiai",
  "Raseiniai",
  "Druskininkai",
  "Palanga",
  "Biržai",
  "Pasvalys",
  "Rokiškis",
  "Kupiškis",
  "Kretinga",
  "Gargždai",
  "Visaginas",
  "Neringa",
  "Šalčininkai",
  "Varėna",
  "Lazdijai",
  "Prienai",
  "Kaišiadorys",
  "Elektrėnai",
  "Molėtai",
  "Ignalina",
  "Zarasai",
  "Širvintos",
  "Anykščiai",
  "Pakruojis",
  "Radviliškis",
  "Kelmė",
  "Jurbarkas",
  "Šilutė",
  "Pagėgiai",
  "Šakiai",
  "Vilkaviškis",
  "Kalvarija",
  "Kazlų Rūda",
  "Birštonas",
  "Rietavas",
  "Skuodas",
  "Nida",
  "Trakai",
  "Švenčionys",
];

/** Inflected forms only — never bare stems ("kaun" ⊆ "kaina"). */
const LT_CITY_TEXT_FORMS: Record<string, string[]> = {
  Vilnius: ["vilnius", "vilniuje", "vilniaus", "vilniui", "vilnių"],
  Kaunas: ["kaunas", "kaune", "kauno", "kaunui", "kauną"],
  Klaipėda: [
    "klaipėda",
    "klaipeda",
    "klaipėdoje",
    "klaipedoje",
    "klaipėdos",
    "klaipedos",
  ],
  Šiauliai: [
    "šiauliai",
    "siauliai",
    "šiauliuose",
    "siauliuose",
    "šiaulių",
    "siauliu",
  ],
  Panevėžys: [
    "panevėžys",
    "panevezys",
    "panevėžyje",
    "panevezyje",
    "panevėžio",
    "panevezio",
  ],
  Alytus: ["alytus", "alyte", "alytoje", "alytaus"],
  Marijampolė: [
    "marijampolė",
    "marijampole",
    "marijampolėje",
    "marijampoleje",
    "marijampolės",
  ],
  Utena: ["utena", "utenoje", "utenos"],
  Palanga: ["palanga", "palangoje", "palangos"],
  Kaišiadorys: [
    "kaišiadorys",
    "kaisiadorys",
    "kaišiadoryse",
    "kaisiadoryse",
    "kaišiadorių",
    "kaisiadoriu",
  ],
  Elektrėnai: [
    "elektrėnai",
    "elektrenai",
    "elektrėnuose",
    "elektrenuose",
    "elektrėnų",
  ],
  Jonava: ["jonava", "jonavoje", "jonavos"],
  Prienai: ["prienai", "prienuose", "prienų", "prienu"],
  Trakai: ["trakai", "trakuose", "trakų", "traku"],
  Kėdainiai: ["kėdainiai", "kedainiai", "kėdainiuose", "kedainiuose"],
  Mažeikiai: ["mažeikiai", "mazeikiai", "mažeikiuose", "mazeikiuose"],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/** True only when user text mentions the city as a word (not a substring of "kaina"). */
export function textMentionsLtCity(userText: string, city: string): boolean {
  const text = String(userText ?? "").toLowerCase();
  if (!text.trim()) return false;
  const canonical = normalizeCityCandidate(city);
  if (!canonical) return false;
  const forms = LT_CITY_TEXT_FORMS[canonical] ?? [canonical.toLowerCase()];
  return forms.some((form) =>
    new RegExp(`\\b${escapeRegExp(form)}\\b`, "i").test(text)
  );
}

export function isPlaceholderCity(value: string | undefined | null): boolean {
  const v = String(value ?? "").trim();
  if (!v) return true;
  if (PLACEHOLDER_CITY.test(v)) return true;
  return v.toLowerCase() === "miestas";
}

function normalizeCityCandidate(raw: string): string {
  const val = String(raw ?? "").trim();
  if (!val || isPlaceholderCity(val)) return "";
  if (val.toLowerCase() === "lietuva" || val.toLowerCase() === "visa lietuva") {
    return "";
  }
  const match = LT_CITIES.find((c) => normKey(c) === normKey(val));
  return match ?? val;
}

/**
 * Resolve listing/user city from raw input with optional verified fallback.
 * Never invents Vilnius/Kaunas — returns "" when unknown so chat/PrePublish can ask.
 */
export function resolveListingCity(
  raw: string | undefined | null,
  fallback = ""
): string {
  const fromRaw = normalizeCityCandidate(String(raw ?? ""));
  if (fromRaw) return fromRaw;
  return normalizeCityCandidate(String(fallback ?? ""));
}

/**
 * Keep LLM city ONLY when grounded in profile, geo, or user text.
 * Prefers GPS municipality (geoCityHint) over ungrounded hub invent —
 * but never overwrites an explicit draft city the seller already set.
 */
export function sanitizeListingCity(
  llmCity: string | undefined | null,
  opts: {
    profileCity?: string | null;
    geoCityHint?: string | null;
    userText?: string | null;
    /** Existing draft.location — manual/AI value already on the card. */
    draftCity?: string | null;
  } = {}
): string {
  const candidate = resolveListingCity(llmCity);
  const profile = resolveListingCity(opts.profileCity);
  const geo = resolveListingCity(opts.geoCityHint);
  const draft = resolveListingCity(opts.draftCity);
  const userText = String(opts.userText ?? "");

  // Explicit user mention always wins.
  if (candidate && textMentionsLtCity(userText, candidate)) {
    return candidate;
  }

  // Seller already set a draft city (PrePublish / prior turn) — keep it.
  if (draft) {
    return draft;
  }

  // GPS municipality before LLM/schema hub invent (Kaišiadorys ≠ Kaunas).
  if (geo) {
    if (!candidate || candidate.toLowerCase() === geo.toLowerCase()) {
      return geo;
    }
    // LLM picked a different city without text grounding — keep geo.
    return geo;
  }

  if (
    candidate &&
    profile &&
    profile.toLowerCase() === candidate.toLowerCase()
  ) {
    return profile;
  }

  return "";
}

/** Known dense LT city names (for tests / callers). */
export function listKnownLtCities(): readonly string[] {
  return LT_CITIES;
}
