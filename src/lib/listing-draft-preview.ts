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
  return "";
}

function formatLocation(location?: string): string | null {
  const t = location?.trim();
  if (!t || t.toLowerCase() === "miestas" || t.toLowerCase() === "lietuva") return null;
  return t;
}

function truncateDescription(text: string, max = 420): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  if (lastStop > 120) return cut.slice(0, lastStop + 1);
  return `${cut.trimEnd()}…`;
}

/** Internal gap keys — never dump as „Trūksta X, Y“ to the user. */
export function analyzeMissingDraftFields(
  draft: ListingDraftPreviewInput
): string[] {
  const missing: string[] = [];
  const attrs = draft.attributes ?? {};
  const category = draft.category ?? "other";

  if (!draft.price || draft.price <= 0) missing.push("price");
  if (!formatLocation(draft.location)) missing.push("city");

  if (category === "clothing") {
    if (!attr(attrs, "size", "clothingSize")) missing.push("size");
    if (!attr(attrs, "brand")) missing.push("brand");
    if (!attr(attrs, "condition")) missing.push("condition");
  } else if (category === "vehicles") {
    if (!attr(attrs, "make")) missing.push("make");
    if (!attr(attrs, "model")) missing.push("model");
    if (!attr(attrs, "year")) missing.push("year");
    if (!attr(attrs, "mileage", "mileageKm", "rida")) missing.push("mileage");
  } else if (category === "electronics") {
    if (!attr(attrs, "model")) missing.push("model");
    if (!attr(attrs, "memory", "storage", "capacity", "color")) missing.push("config");
    if (!attr(attrs, "condition")) missing.push("condition");
  } else if (category === "real_estate") {
    if (!attr(attrs, "area", "plotas", "areaSqm")) missing.push("area");
    if (!attr(attrs, "rooms", "kambariai")) missing.push("rooms");
  } else if (category === "services") {
    if (!attr(attrs, "specialty", "specialtyLabel")) missing.push("specialty");
  } else if (category === "jobs") {
    if (!attr(attrs, "jobType", "position")) missing.push("position");
  }

  if (!draft.description?.trim() || draft.description.trim().length < 24) {
    missing.push("description");
  }

  return missing;
}

export function buildDraftPreviewBlock(draft: ListingDraftPreviewInput): string {
  const title = draft.title?.trim() || "naujas skelbimas";
  const price = formatPrice(draft.price);
  const city = formatLocation(draft.location);
  const desc = draft.description?.trim();

  const headerBits = [`✨ ${title}`];
  if (price) headerBits.push(price);
  if (city) headerBits.push(city);

  if (desc && desc.length >= 24) {
    return `${headerBits.join(" · ")}\n\n${truncateDescription(desc)}`;
  }

  return `Paruošiau skelbimo pagrindą: «${title}»${price ? ` · ${price}` : ""}${
    city ? ` · ${city}` : ""
  }. Dabar sudėliosiu patrauklų aprašymą — patikslinkite unikalias detales.`;
}

export function buildConsultantFollowUpQuestion(
  draft: ListingDraftPreviewInput
): string | null {
  const missing = analyzeMissingDraftFields(draft);
  const category = draft.category ?? "other";
  const title = (draft.title ?? "").toLowerCase();
  const attrs = draft.attributes ?? {};
  const isPhone = /iphone|samsung|pixel|xiaomi|telefon|mobil/.test(title);

  if (category === "electronics" || isPhone) {
    if (
      missing.includes("config") ||
      (!attr(attrs, "memory", "storage", "capacity") && !attr(attrs, "color"))
    ) {
      return isPhone
        ? "Kokia jūsų telefono spalva ir vidinė atmintis — 128, 256 ar 512 GB?"
        : "Kokia tiksli konfigūracija — atmintis / talpa ir spalva?";
    }
    if (!attr(attrs, "charger", "box", "accessories") && isPhone) {
      return "Ar pridedate originalų įkroviklį ir dėžutę? Tai stipriai kelia pirkėjų pasitikėjimą.";
    }
    if (missing.includes("condition")) {
      return "Kaip apibūdintumėte būklę — kaip naujas, su lengvais naudojimo ženklais, ar yra įbrėžimų ekrane?";
    }
  }

  if (category === "vehicles") {
    if (missing.includes("year") || missing.includes("mileage")) {
      return "Kokiais metais automobilis ir kokia rida kilometrais?";
    }
    if (missing.includes("make") || missing.includes("model")) {
      return "Patikslinkite markę ir modelį — taip pirkėjai greičiau suras skelbimą filtruose.";
    }
  }

  if (category === "clothing") {
    if (missing.includes("size") || missing.includes("brand")) {
      return "Koks dydis ir prekės ženklas? Jei žinote, pridėkite ir būklę (nešiotas / kaip naujas).";
    }
  }

  if (category === "real_estate") {
    if (missing.includes("area") || missing.includes("rooms")) {
      return "Koks plotas (m²) ir kiek kambarių? Tai pirmos eilės filtrai pirkėjams.";
    }
  }

  if (missing.includes("price")) {
    return "Kokią kainą norėtumėte matyti skelbime — greitam pardavimui ar maksimaliai vertei? Parašykite sumą eurais.";
  }

  if (missing.includes("description")) {
    return "Papasakokite vieną unikalią detalę (komplektacija, defektai, kodėl parduodate) — įpyniu į aprašymą.";
  }

  if (missing.includes("city")) {
    return "Kurioje vietoje skelbiame — kokį miestą rodyti pirkėjams?";
  }

  return "Ar šis aprašymas skamba gerai, ar dar ką nors patikslinsime prieš nuotraukas?";
}

export function buildDraftGapAnalysis(draft: ListingDraftPreviewInput): string | null {
  return buildConsultantFollowUpQuestion(draft);
}

export function buildDraftSalesTip(draft: ListingDraftPreviewInput): string | null {
  const category = draft.category ?? "other";
  const title = (draft.title ?? "").toLowerCase();

  if (category === "electronics" || /iphone|samsung|telefon/.test(title)) {
    return "Patarimas: pirkėjai pirmiausia žiūri baterijos būklę, atmintį ir ar yra dėžutė — tai dažnai nulemia greitesnį sandorį.";
  }
  if (category === "clothing") {
    return "Patarimas: natūralioje šviesoje nufotografuota prekė sulaukia iki 3× daugiau peržiūrų — parodykite dydžio etiketę.";
  }
  if (category === "vehicles") {
    return "Patarimas: metai + rida + serviso istorija kelia pasitikėjimą labiau nei ilgas tekstas be faktų.";
  }
  if (category === "real_estate") {
    return "Patarimas: dienos šviesos nuotrauka ir aiškus plotas/kambariai — pirmos sekundės sprendimas pirkėjui.";
  }
  if (/keln|sukn|mar|bat|stri|megz/.test(title)) {
    return "Patarimas: šio tipo drabužiams svarbiausia gera nuotrauka ir tikslus dydis.";
  }
  return "Patarimas: skelbimai su konkrečiu aprašymu ir bent 2–3 nuotraukomis parduoda pastebimai greičiau.";
}

export function buildListingDraftUpdateReply(
  draft: ListingDraftPreviewInput,
  opts?: {
    intro?: string;
    readiness?: Pick<
      PrePublishReadiness,
      | "ok"
      | "missingAuth"
      | "missingPhoto"
      | "missingCity"
      | "missingPrice"
      | "missingPhone"
    >;
  }
): string {
  const intro = opts?.intro?.trim();
  const readiness = opts?.readiness;

  if (readiness && !readiness.ok) {
    // Prefer product consulting — photos are never a hard pre-draft block.
    if (readiness.missingPrice) {
      const ask = buildConversationalMissingPrompt(readiness);
      return intro ? `${intro}\n\n${ask}` : ask;
    }
    const productQ = buildConsultantFollowUpQuestion(draft);
    if (productQ && !readiness.missingCity && !readiness.missingPhone) {
      return [intro, buildDraftPreviewBlock(draft), buildDraftSalesTip(draft), productQ]
        .filter(Boolean)
        .join("\n\n");
    }
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
  const question = buildConsultantFollowUpQuestion(draft);
  const parts = [intro, confirmation, tip, question].filter(Boolean);
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
