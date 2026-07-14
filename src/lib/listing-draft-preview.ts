import type { AiExtractedListing } from "@/lib/types";
import {
  buildDraftConfirmationBubble,
  buildConversationalMissingPrompt,
} from "@/lib/listing-conversational-flow";
import type { PrePublishReadiness } from "@/lib/pre-publish-validation";

export interface ListingDraftPreviewInput {
  category?: string;
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  attributes?: Record<string, string | undefined>;
}


function attr(attrs: Record<string, string | undefined>, ...keys: string[]): string {
  for (const key of keys) {
    const value = attrs[key]?.trim();
    if (value) return value;
  }
  return "";
}

function formatPrice(price?: number): string {
  if (price != null && price > 0) return `${price} €`;
  return "nenurodyta";
}

function formatLocation(location?: string): string | null {
  const t = location?.trim();
  if (!t || t.toLowerCase() === "miestas" || t.toLowerCase() === "lietuva") return null;
  return t;
}

export function analyzeMissingDraftFields(
  draft: ListingDraftPreviewInput
): string[] {
  const missing: string[] = [];
  const attrs = draft.attributes ?? {};
  const category = draft.category ?? "other";

  if (!draft.price || draft.price <= 0) missing.push("kainos");
  if (!formatLocation(draft.location)) missing.push("miesto");

  if (category === "clothing") {
    if (!attr(attrs, "size", "clothingSize")) missing.push("dydžio");
    if (!attr(attrs, "brand")) missing.push("prekės ženklo");
    if (!attr(attrs, "condition")) missing.push("būklės");
  } else if (category === "vehicles") {
    if (!attr(attrs, "make")) missing.push("markės");
    if (!attr(attrs, "model")) missing.push("modelio");
    if (!attr(attrs, "year")) missing.push("metų");
    if (!attr(attrs, "mileage", "mileageKm", "rida")) missing.push("ridos");
  } else if (category === "electronics") {
    if (!attr(attrs, "model")) missing.push("modelio");
    if (!attr(attrs, "memory", "storage", "capacity")) missing.push("atminties / talpos");
    if (!attr(attrs, "condition")) missing.push("būklės");
  } else if (category === "real_estate") {
    if (!attr(attrs, "area", "plotas", "areaSqm")) missing.push("ploto");
    if (!attr(attrs, "rooms", "kambariai")) missing.push("kambarių skaičiaus");
  } else if (category === "services") {
    if (!attr(attrs, "specialty", "specialtyLabel")) missing.push("specializacijos");
  } else if (category === "jobs") {
    if (!attr(attrs, "jobType", "position")) missing.push("pareigų / specialybės");
  }

  if (!draft.description?.trim() || draft.description.trim().length < 24) {
    missing.push("detalaus aprašymo");
  }

  return missing;
}

export function buildDraftPreviewBlock(draft: ListingDraftPreviewInput): string {
  const title = draft.title?.trim() || "naujas skelbimas";
  const price = formatPrice(draft.price);
  const city = formatLocation(draft.location);
  const parts = [`Paruošiau juodraštį: «${title}»`];
  if (price !== "nenurodyta") parts.push(`kaina ${price}`);
  if (city) parts.push(`vieta ${city}`);
  return `${parts.join(", ")}.`;
}

export function buildDraftGapAnalysis(draft: ListingDraftPreviewInput): string | null {
  const missing = analyzeMissingDraftFields(draft);
  if (!missing.length) return null;
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} ir ${missing[missing.length - 1]}`;
  return `Dar trūksta ${list} — gal galite patikslinti?`;
}

export function buildDraftSalesTip(draft: ListingDraftPreviewInput): string | null {
  const category = draft.category ?? "other";
  const title = (draft.title ?? "").toLowerCase();

  if (category === "clothing") {
    return "💡 Patarimas: Drabužiams pirkėjai labiausiai atkreipia dėmesį į dydį, būklę ir aiškias nuotraukas prie natūralaus apšvietimo — taip sulauksite iki 3× daugiau peržiūrų.";
  }
  if (category === "vehicles") {
    return "💡 Patarimas: Automobiliams pirkėjai dažniausiai filtruoja pagal metus ir ridą — jei turite VIN arba serviso istoriją, verta ją paminėti aprašyme.";
  }
  if (category === "electronics") {
    return "💡 Patarimas: Technikai pirkėjai ieško tikslaus modelio ir atminties — pridėkite nuotrauką ekrano ir galinio dangtelio, kad pasitikėjimas augtų.";
  }
  if (category === "real_estate") {
    return "💡 Patarimas: NT skelbimams svarbiausias plotas, kambarių skaičius ir vieta — gera dienos nuotrauka padidina susidomėjimą akimirksniu.";
  }
  if (/keln|sukn|mar|bat|stri|megz/.test(title)) {
    return "💡 Patarimas: Šio tipo drabužiai dabar populiarūs — pridėkite nuotrauką prie gero apšvietimo, kad sulauktumėte daugiau dėmesio.";
  }
  return "💡 Patarimas: Skelbimai su aiškia nuotrauka ir konkrečiu aprašymu parduoda iki 2× greičiau — verta papildyti detales dabar.";
}

export function buildListingDraftUpdateReply(
  draft: ListingDraftPreviewInput,
  opts?: { intro?: string; readiness?: Pick<
    PrePublishReadiness,
    | "ok"
    | "missingAuth"
    | "missingPhoto"
    | "missingCity"
    | "missingPrice"
    | "missingPhone"
  > }
): string {
  const intro = opts?.intro?.trim();
  const readiness = opts?.readiness;

  if (readiness && !readiness.ok) {
    const ask = buildConversationalMissingPrompt(readiness);
    return intro ? `${intro}\n\n${ask}` : ask;
  }

  const confirmation = buildDraftConfirmationBubble({
    title: draft.title,
    description: draft.description,
    price: draft.price,
    location: draft.location,
  });
  const tip = buildDraftSalesTip(draft);
  const parts = [intro, confirmation, tip].filter(Boolean);
  return parts.join("\n\n");
}

export function draftToPreviewInput(draft: AiExtractedListing): ListingDraftPreviewInput {
  return {
    category: draft.category,
    title: draft.title,
    description: draft.description,
    price: draft.price,
    location: draft.location,
    attributes: draft.attributes as Record<string, string | undefined> | undefined,
  };
}
