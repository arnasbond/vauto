/** Strip workflow/UI / agent-clarification phrases from user-facing listing title and description. */

import type {
  AiExtractedListing,
  CategoryAttributes,
  ListingCategory,
} from "@/lib/types";

/**
 * Car sales boilerplate that must never land on non-automotive listings.
 * Phrase-level only — NEVER treat rich general copy as thin just because a
 * stray auto word appears; strip the phrase and keep the rest.
 */
const AUTOMOTIVE_BOILERPLATE_RES: RegExp[] = [
  /automobilis\s+paruoštas\s+apžiūrai[^.!?\n]*/gi,
  /jei\s+turite\s+klausimų\s+apie\s+servisą,?\s*dokumentus[^.!?\n]*/gi,
  /servisą,?\s*dokumentus[^.!?\n]*/gi,
  /ar\s+automobilis\s+atitinka[^.!?\n]*/gi,
  /\bkėbulas\s*:[^.!?\n]*/gi,
  /\bkuras\s*:[^.!?\n]*/gi,
  /\brida\s*:[^.!?\n]*/gi,
  /technin[eė]\s+apžiūr[^.!?\n]*/gi,
  /\bvariklis\s*:[^.!?\n]*/gi,
  /vilkimo\s+kablys[^.!?\n]*/gi,
  /\bautomobilio\s+detali[^.!?\n]*/gi,
];

const AUTOMOTIVE_BOILERPLATE_RE =
  /automobilis\s+paruoštas\s+apžiūrai|servisą,?\s*dokumentus|ar\s+automobilis\s+atitinka|kėbulas\s*:|kuras\s*:|rida\s*:|technin[eė]\s+apžiūr|variklis\s*:|vilkimo\s+kablys/i;

const INSTRUMENT_TEXT_RE =
  /\b(gitar|guitar|hohner|muzik|pianin|būgn|bugn|drum|smuik|akustin|bosin|ukulel|sintezator|mušam)/i;

const SYSTEM_PHRASE_PATTERNS: RegExp[] = [
  /📷\s*/gi,
  /➕\s*/gi,
  /🔍\s*/gi,
  /įkelti?\s*nuotrauk[aąų]?/gi,
  /ikelti?\s*nuotrauk[aąų]?/gi,
  /įkelti?\s*skelbim[aą]/gi,
  /ikelti?\s*skelbim[aą]/gi,
  /publikuok(?:ti)?/gi,
  /viskas\s+tinka/gi,
  /suvesti\s+tr[uū]kstamus\s+duomenis/gi,
  /telefono\s+numeris/gi,
  /^miestas$/gi,
  /reikia\s+pataisyti/gi,
  /redaguoti\s+duomenis/gi,
];

/** Conversational filler that must never land in listing description / PrePublish. */
const CONVERSATIONAL_FILLER_LINE_RE =
  /^(labas\b|sveiki\b|labas,?\s+\w+|patarimas\s*:|vilnius\s+patarimas|kaunas\s+patarimas|vauto\s+duomenimis|kaip\s+brokeris|rinkos\s+vidurkis|vidutin[ėe]\s+kaina|market\s+average|kokią\s+kainą|greitam\s+pardavimui)/i;

/** Agent clarification / multi-object prompts — never publish as "Apie skelbimą". */
const AGENT_CLARIFICATION_PATTERNS: RegExp[] = [
  /nuotraukoje\s+matau/i,
  /kelis\s+objektus/i,
  /ar\s+teisingai\s+suprantu/i,
  /ruošiame\s+skelbimą/i,
  /ruosiame\s+skelbima/i,
  /pasirinkite\s+objektą/i,
  /pasirinkite\s+objekta/i,
  /ką\s+iš\s+nuotraukos\s+norite\s+parduoti/i,
  /ka\s+is\s+nuotraukos\s+norite\s+parduoti/i,
  /pasirinkite\s+žemiau/i,
  /pasirinkite\s+zemiau/i,
  /judame\s+prie\s+prepublish/i,
  /clarification/i,
];

export function isAgentClarificationText(raw: string | undefined | null): boolean {
  const t = String(raw ?? "").trim();
  if (!t) return false;
  return AGENT_CLARIFICATION_PATTERNS.some((re) => re.test(t));
}

export function sanitizeListingUserText(raw: string | undefined | null): string {
  let t = String(raw ?? "").trim();
  if (!t) return "";
  for (const re of SYSTEM_PHRASE_PATTERNS) {
    t = t.replace(re, " ");
  }
  // Never publish / store literal markdown heading markers in listing copy.
  t = t
    .replace(/([^\n#])[ \t]*#{1,6}[ \t]+/g, "$1 ")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  // Drop whole lines that are agent clarification prompts.
  t = t
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isAgentClarificationText(line))
    .join("\n");
  for (const re of AGENT_CLARIFICATION_PATTERNS) {
    t = t.replace(re, " ");
  }
  return t.replace(/\s+/g, " ").trim();
}

export function sanitizeListingTitle(raw: string | undefined | null): string {
  const cleaned = sanitizeListingUserText(raw);
  if (!cleaned) return "Naujas skelbimas";
  return cleaned.slice(0, 96);
}

/**
 * Preserve marketplace sales formatting: newlines, **bold**, and •/- bullets.
 * Strip conversational filler — never flatten rich Vision copy into one line.
 */
export function sanitizeListingDescription(raw: string | undefined | null): string {
  let t = String(raw ?? "").trim();
  if (!t) return "";
  for (const re of SYSTEM_PHRASE_PATTERNS) {
    t = t.replace(re, " ");
  }
  t = t
    .replace(/([^\n#])[ \t]*#{1,6}[ \t]+/g, "$1 ")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  t = t
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (isAgentClarificationText(trimmed)) return false;
      if (CONVERSATIONAL_FILLER_LINE_RE.test(trimmed)) return false;
      return true;
    })
    .join("\n");
  for (const re of AGENT_CLARIFICATION_PATTERNS) {
    t = t.replace(re, " ");
  }
  // Drop only exact duplicate paragraphs — never collapse distinct rich sections.
  const paras = t
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const deduped: string[] = [];
  for (const p of paras) {
    if (deduped.some((d) => d === p)) continue;
    deduped.push(p);
  }
  return deduped
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4000);
}

/** Plain-text description for PrePublish <textarea> — no raw ** artifacts. */
export function toPlainListingDescription(raw: string | undefined | null): string {
  return sanitizeListingDescription(raw)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^[ \t]*[-*•]\s+/gm, "• ")
    .trim();
}

/** Minimum length before a description is treated as thin / summary-only. */
export const MIN_RICH_LISTING_DESCRIPTION_CHARS = 120;

function pickAttr(attrs: CategoryAttributes, ...keys: string[]): string {
  for (const key of keys) {
    const v = attrs[key];
    const s = Array.isArray(v) ? v.filter(Boolean).join(", ") : String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/** True for bare “Title. Make Model · year” style strings that should be expanded. */
export function isThinListingDescription(raw: string | undefined | null): boolean {
  const t = String(raw ?? "").trim();
  if (!t) return true;
  if (t.length < MIN_RICH_LISTING_DESCRIPTION_CHARS) return true;
  const sentences = t.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 2 && /·|\u00b7/.test(t)) return true;
  if (/^parduodamas?\s+/i.test(t) && sentences.length <= 2 && t.length < 180) {
    return true;
  }
  return false;
}

export interface BuildListingDescriptionOptions {
  location?: string;
  price?: number;
  /** Listing category — automotive boilerplate is vehicles/transport only. */
  category?: ListingCategory | string;
  /** Thin seed text to weave into the sales copy when useful. */
  seedDescription?: string;
}

export function descriptionHasAutomotiveBoilerplate(
  text: string | undefined | null
): boolean {
  return AUTOMOTIVE_BOILERPLATE_RE.test(String(text ?? ""));
}

/** Strip car-only phrases from non-auto copy while keeping rich structure. */
export function stripAutomotiveBoilerplateFromText(
  text: string | undefined | null
): string {
  let t = String(text ?? "");
  if (!t.trim()) return "";
  for (const re of AUTOMOTIVE_BOILERPLATE_RES) {
    t = t.replace(re, " ");
  }
  return sanitizeListingDescription(t);
}

function looksLikeInstrumentListing(
  title: string,
  attributes?: CategoryAttributes,
  seed?: string
): boolean {
  const blob = [
    title,
    seed ?? "",
    pickAttr(attributes ?? {}, "brand", "make", "model", "title"),
  ]
    .join(" ")
    .toLowerCase();
  return INSTRUMENT_TEXT_RE.test(blob);
}

/**
 * True only for real automotive listings. Explicit non-vehicle categories never
 * get car copy — even if leftover make/model keys exist from a bad OCR pass.
 */
export function shouldUseAutomotiveListingCopy(
  category: string | undefined,
  attributes?: CategoryAttributes,
  title?: string,
  seed?: string
): boolean {
  const cat = String(category ?? "").trim().toLowerCase();
  if (looksLikeInstrumentListing(title ?? "", attributes, seed)) return false;
  if (cat === "vehicles" || cat === "transport") return true;
  if (cat && cat !== "other" && cat !== "unknown") return false;

  const attrs = attributes ?? {};
  const hasHardVehicleSignals = Boolean(
    pickAttr(attrs, "mileage", "rida", "odometer") ||
      pickAttr(attrs, "vin") ||
      pickAttr(attrs, "fuelType", "fuel", "kuroTipas", "kuras") ||
      pickAttr(attrs, "bodyType", "body", "kebuloTipas") ||
      pickAttr(attrs, "licensePlate", "plate") ||
      pickAttr(attrs, "powerKw")
  );
  return hasHardVehicleSignals;
}

function appendSeedAndClose(
  sentences: string[],
  opts: BuildListingDescriptionOptions | undefined,
  seed: string,
  productNoun: string,
  multiline = false
): string {
  if (seed && seed.length >= 40 && !isAgentClarificationText(seed)) {
    const cleanedSeed = multiline
      ? stripAutomotiveBoilerplateFromText(seed)
      : seed.endsWith(".")
        ? seed
        : `${seed}.`;
    if (
      cleanedSeed &&
      !descriptionHasAutomotiveBoilerplate(cleanedSeed) &&
      !sentences.some((s) => s.includes(cleanedSeed.slice(0, 40)))
    ) {
      sentences.push(cleanedSeed);
    }
  }

  const loc = String(opts?.location ?? "").trim();
  if (loc) {
    sentences.push(
      `Galima apžiūra / atsiėmimas: ${loc}. Susisiekite ir sutarsime patogų laiką — greiti ir aiškūs atsakymai garantuoti.`
    );
  } else {
    sentences.push(
      `Susisiekite dėl ${productNoun} detalių — atsakome greitai ir padedame priimti sprendimą be spaudimo.`
    );
  }

  if (typeof opts?.price === "number" && opts.price > 0) {
    sentences.push(
      `Kaina ${opts.price.toLocaleString("lt-LT")} € — realistiškas pasiūlymas greitam sandoriui rimtam pirkėjui.`
    );
  }

  if (multiline) {
    return sentences
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 4000);
  }

  return sentences.join(" ").replace(/\s+/g, " ").trim().slice(0, 4000);
}

function buildAutomotiveListingDescription(
  title: string,
  attributes: CategoryAttributes,
  opts?: BuildListingDescriptionOptions
): string {
  const cleanTitle = sanitizeListingTitle(title);
  const attrs = attributes;
  const make = pickAttr(attrs, "make", "brand", "markė", "marke");
  const model = pickAttr(attrs, "model", "modelis");
  const year = pickAttr(attrs, "year", "metai");
  const fuel = pickAttr(attrs, "fuelType", "fuel", "kuroTipas", "kuras");
  const body = pickAttr(attrs, "bodyType", "body", "kebuloTipas", "kėbulo tipas");
  const condition = pickAttr(
    attrs,
    "condition",
    "būklė",
    "bukle",
    "defects",
    "defektai"
  );
  const mileage = pickAttr(attrs, "mileage", "rida", "odometer");
  const color = pickAttr(attrs, "color", "spalva");
  const engine = pickAttr(attrs, "engine", "engineCapacity", "variklis", "engineCc");
  const vehicleLabel = [make, model].filter(Boolean).join(" ") || cleanTitle;
  const seed = sanitizeListingDescription(opts?.seedDescription ?? "");

  const sentences: string[] = [];
  sentences.push(
    `Parduodamas ${vehicleLabel}${year ? `, ${year} m.` : ""} — patrauklus pasirinkimas pirkėjui, kuris ieško praktinio ir patikimo varianto.`
  );

  const highlightBits = [
    fuel ? `kuras: ${fuel}` : "",
    body ? `kėbulas: ${body}` : "",
    engine ? `variklis: ${engine}` : "",
    color ? `spalva: ${color}` : "",
    mileage ? `rida: ${mileage}` : "",
  ].filter(Boolean);
  if (highlightBits.length) {
    sentences.push(
      `Pagrindiniai akcentai: ${highlightBits.join(", ")}. Tai padeda greitai įvertinti, ar automobilis atitinka jūsų poreikius.`
    );
  } else if (make || model || year) {
    sentences.push(
      `Modelis žinomas rinkoje — ${[make, model, year ? `${year} m.` : ""]
        .filter(Boolean)
        .join(" ")}. Detales ir komplektaciją patikslinsime apžiūros metu.`
    );
  }

  if (condition) {
    sentences.push(
      `Būklė: ${condition}. Skelbime siekiame aiškumo — kviečiame apžiūrėti ir patiems įsitikinti.`
    );
  } else {
    sentences.push(
      "Automobilis paruoštas apžiūrai; jei turite klausimų apie servisą, dokumentus ar komplektaciją — mielai atsakysime."
    );
  }

  return appendSeedAndClose(sentences, opts, seed, "automobilio");
}

function buildGeneralProductListingDescription(
  title: string,
  attributes: CategoryAttributes,
  opts?: BuildListingDescriptionOptions
): string {
  const cleanTitle = sanitizeListingTitle(title);
  const attrs = attributes;
  const brand = pickAttr(attrs, "brand", "make", "markė", "marke", "manufacturer");
  const model = pickAttr(attrs, "model", "modelis");
  const condition = pickAttr(
    attrs,
    "condition",
    "būklė",
    "bukle",
    "defects",
    "defektai",
    "Būklė"
  );
  const color = pickAttr(attrs, "color", "spalva", "Spalvos");
  const material = pickAttr(attrs, "material", "medžiaga", "Atlikimas", "wood", "body");
  const purpose = pickAttr(attrs, "purpose", "Paskirtis", "paskirtis");
  const instrumentType = pickAttr(attrs, "instrumentType", "type", "tipas");
  const productLabel = [brand, model].filter(Boolean).join(" ") || cleanTitle;
  const rawSeed = sanitizeListingDescription(opts?.seedDescription ?? "");
  const seed = stripAutomotiveBoilerplateFromText(rawSeed);
  const instrument = looksLikeInstrumentListing(cleanTitle, attrs, seed);

  const sections: string[] = [];

  // 1) Antraštė / hook — rich opening, never a bare title echo.
  if (instrument) {
    sections.push(
      `Parduodamas ${productLabel}${
        instrumentType ? ` (${instrumentType})` : ""
      } — muzikos instrumentas su maloniu skambesiu ir paruoštas groti. Tinka tiek pradžiai, tiek kasdienėms repeticijoms ar namų muzikavimui.`
    );
  } else {
    sections.push(
      `Parduodamas ${productLabel} — kokybiškas ir praktiškas pasirinkimas pirkėjui, kuris ieško aiškios vertės, geros būklės ir greito sandorio.`
    );
  }

  // 2) Pagrindiniai privalumai / savybės
  const featureBullets: string[] = [];
  if (brand) featureBullets.push(`• **Prekės ženklas:** ${brand}`);
  if (model && model !== brand) featureBullets.push(`• **Modelis:** ${model}`);
  if (color) featureBullets.push(`• **Spalva / išvaizda:** ${color}`);
  if (material) {
    featureBullets.push(
      instrument
        ? `• **Korpusas / medžiaga:** ${material}`
        : `• **Atlikimas / medžiaga:** ${material}`
    );
  }
  if (instrumentType) featureBullets.push(`• **Tipas:** ${instrumentType}`);
  if (instrument) {
    featureBullets.push(
      "• **Skambesys:** šiltas, aiškus tonas — patogu mokytis ir groti namuose"
    );
    featureBullets.push(
      "• **Technika:** grifas ir stygos paruošti grojimui; detales patikslinsime apžiūros metu"
    );
  }
  if (featureBullets.length === 0) {
    featureBullets.push(
      instrument
        ? "• **Savybės:** tvarkingas instrumentas, patogus kasdieniam grojimui"
        : "• **Savybės:** praktinė prekė kasdieniam naudojimui, aiški vertė už kainą"
    );
  }
  sections.push(`**Pagrindiniai privalumai / savybės:**\n${featureBullets.join("\n")}`);

  // 3) Būklė ir komplektacija
  if (condition) {
    sections.push(
      `**Būklė ir komplektacija:**\n${condition}. Skelbime siekiame aiškumo — kviečiame apžiūrėti ar susisiekti dėl detalių.`
    );
  } else if (instrument) {
    sections.push(
      "**Būklė ir komplektacija:**\nInstrumentas paruoštas perdavimui. Jei turite klausimų apie būklę, stygas, grifą ar komplektaciją — mielai atsakysime."
    );
  } else {
    sections.push(
      "**Būklė ir komplektacija:**\nPrekė paruošta perdavimui. Jei turite klausimų apie būklę ar komplektaciją — mielai atsakysime."
    );
  }

  // 4) Paskirtis pirkėjui
  if (purpose) {
    sections.push(`**Paskirtis pirkėjui:**\n${purpose}.`);
  } else if (instrument) {
    sections.push(
      "**Paskirtis pirkėjui:**\nTinka pradedantiesiems ir mėgėjams, taip pat kaip antras / kelioninis instrumentas. Patogu mokytis, groti namuose ar dovanoti muzikos entuziastui."
    );
  } else {
    sections.push(
      "**Paskirtis pirkėjui:**\nPuikiai tiks kasdieniam naudojimui, dovanai ar kaip praktinis papildymas namams / darbui."
    );
  }

  // 5) Apžiūra / pristatymas (+ seed / kaina via append)
  const closeBits: string[] = [];
  return appendSeedAndClose(
    [...sections, ...closeBits],
    opts,
    seed,
    instrument ? "instrumento" : "prekės",
    true
  );
}

/**
 * Sales-focused marketplace description from title + attributes.
 * Used when agent/persona text is missing, clarification junk, or too thin.
 * Automotive boilerplate is emitted ONLY for vehicles/transport.
 */
export function buildListingDescriptionFromAttrs(
  title: string,
  attributes?: CategoryAttributes,
  opts?: BuildListingDescriptionOptions
): string {
  const attrs = attributes ?? {};
  const seed = opts?.seedDescription ?? "";
  if (
    shouldUseAutomotiveListingCopy(opts?.category, attrs, title, seed)
  ) {
    return buildAutomotiveListingDescription(title, attrs, opts);
  }
  return buildGeneralProductListingDescription(title, attrs, opts);
}

/**
 * Publish-ready description: persona summary > cleaned draft > rich attrs fallback.
 * Never publishes agent clarification / multi-object prompt strings or thin summaries.
 * Never keeps automotive boilerplate on non-vehicle listings.
 */
export function resolvePublishListingDescription(draft: AiExtractedListing): string {
  const personaKey = draft.selectedPersona;
  const personaText =
    personaKey && draft.descriptionVariants?.[personaKey]
      ? String(draft.descriptionVariants[personaKey]).trim()
      : "";

  const useAutoCopy = shouldUseAutomotiveListingCopy(
    draft.category,
    draft.attributes,
    draft.title,
    draft.description
  );

  const candidates = [personaText, draft.description ?? ""];
  let thinSeed = "";
  for (const raw of candidates) {
    if (!raw.trim() || isAgentClarificationText(raw)) continue;
    let cleaned = sanitizeListingDescription(raw);
    if (!cleaned || isAgentClarificationText(cleaned)) continue;

    // Non-auto: strip car phrases IN PLACE — keep the rich Vision copy.
    if (!useAutoCopy && descriptionHasAutomotiveBoilerplate(cleaned)) {
      cleaned = stripAutomotiveBoilerplateFromText(cleaned);
      if (!cleaned) continue;
    }

    if (!isThinListingDescription(cleaned)) {
      return cleaned;
    }
    if (!thinSeed) thinSeed = cleaned;
  }

  return buildListingDescriptionFromAttrs(draft.title, draft.attributes, {
    location: draft.location,
    price: typeof draft.price === "number" ? draft.price : undefined,
    category: draft.category,
    seedDescription: thinSeed,
  });
}

/** True when user text mentions uploading a photo but draft has no image yet. */
export function textClaimsPhotoUpload(text: string | undefined | null): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  return /įkelti?\s*nuotrauk|ikelti?\s*nuotrauk|📷/i.test(t);
}

export function draftTextImpliesMissingPhoto(input: {
  title?: string;
  description?: string;
  hasPhoto: boolean;
}): boolean {
  if (input.hasPhoto) return false;
  return (
    textClaimsPhotoUpload(input.title) ||
    textClaimsPhotoUpload(input.description)
  );
}
