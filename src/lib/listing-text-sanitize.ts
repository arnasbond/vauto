/** Strip workflow/UI / agent-clarification phrases from user-facing listing title and description. */

import type { AiExtractedListing, CategoryAttributes } from "@/lib/types";

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

export function sanitizeListingDescription(raw: string | undefined | null): string {
  return sanitizeListingUserText(raw).slice(0, 4000);
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
  /** Thin seed text to weave into the sales copy when useful. */
  seedDescription?: string;
}

/**
 * Sales-focused marketplace description from title + attributes.
 * Used when agent/persona text is missing, clarification junk, or too thin.
 */
export function buildListingDescriptionFromAttrs(
  title: string,
  attributes?: CategoryAttributes,
  opts?: BuildListingDescriptionOptions
): string {
  const cleanTitle = sanitizeListingTitle(title);
  const attrs = attributes ?? {};
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
  const loc = String(opts?.location ?? "").trim();
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

  if (seed && seed.length >= 40 && !isAgentClarificationText(seed)) {
    const seedSentence = seed.endsWith(".") ? seed : `${seed}.`;
    if (!sentences.some((s) => s.includes(seed.slice(0, 40)))) {
      sentences.push(seedSentence);
    }
  }

  if (loc) {
    sentences.push(
      `Galima apžiūra: ${loc}. Susisiekite ir sutarsime patogų laiką — greiti ir aiškūs atsakymai garantuoti.`
    );
  } else {
    sentences.push(
      "Susisiekite dėl apžiūros ir detalių — atsakome greitai ir padedame priimti sprendimą be spaudimo."
    );
  }

  if (typeof opts?.price === "number" && opts.price > 0) {
    sentences.push(
      `Kaina ${opts.price.toLocaleString("lt-LT")} € — realistiškas pasiūlymas greitam sandoriui rimtam pirkėjui.`
    );
  }

  return sentences.join(" ").replace(/\s+/g, " ").trim().slice(0, 4000);
}

/**
 * Publish-ready description: persona summary > cleaned draft > rich attrs fallback.
 * Never publishes agent clarification / multi-object prompt strings or thin summaries.
 */
export function resolvePublishListingDescription(draft: AiExtractedListing): string {
  const personaKey = draft.selectedPersona;
  const personaText =
    personaKey && draft.descriptionVariants?.[personaKey]
      ? String(draft.descriptionVariants[personaKey]).trim()
      : "";

  const candidates = [personaText, draft.description ?? ""];
  let thinSeed = "";
  for (const raw of candidates) {
    if (!raw.trim() || isAgentClarificationText(raw)) continue;
    const cleaned = sanitizeListingDescription(raw);
    if (!cleaned || isAgentClarificationText(cleaned)) continue;
    if (!isThinListingDescription(cleaned)) {
      return cleaned;
    }
    if (!thinSeed) thinSeed = cleaned;
  }

  return buildListingDescriptionFromAttrs(draft.title, draft.attributes, {
    location: draft.location,
    price: typeof draft.price === "number" ? draft.price : undefined,
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
