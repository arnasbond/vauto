/** Opening follow-up after create_listing_draft — warm wizard tone, not empty-search. */
function clothingWarmOpener(title: string): string {
  const lower = title.toLowerCase();
  if (/bat|aul|bas|ked|sukn|mar|keln|pal|stri|megz|kost/.test(lower)) {
    return "Puiku, atlaisvinam vietą spintoje! Padėsiu paruošti skelbimą";
  }
  return "Puiku! Padėsiu paruošti skelbimą";
}

export function buildCreateListingDraftFollowUp(
  category: string,
  title: string,
  attributes: Record<string, string> = {}
): string {
  const item = title.trim() || "skelbimo";
  const genitive = item.endsWith("ė")
    ? item.slice(0, -1) + "ės"
    : item.endsWith("as")
      ? item.slice(0, -2) + "o"
      : item.endsWith("is")
        ? item.slice(0, -2) + "io"
        : item;

  if (category === "clothing") {
    const opener = clothingWarmOpener(item);
    const hasColor = Boolean(attributes.color?.trim());
    const hasSize = Boolean(attributes.size?.trim() || attributes.clothingSize?.trim());
    if (hasColor && hasSize) {
      return `${opener} — kokia būtų kaina?`;
    }
    return `${opener} — kokios spalvos ar dydžio?`;
  }

  if (category === "vehicles") {
    return `Supratau, pradedam ${genitive} skelbimo kūrimą! Kokia markė, modelis ir metai?`;
  }

  if (category === "real_estate") {
    return `Supratau, pradedam ${genitive} skelbimo kūrimą! Koks plotas ir kurioje vietoje?`;
  }

  if (category === "electronics") {
    return `Supratau, pradedam ${genitive} skelbimo kūrimą! Kokia būklė ir kaina?`;
  }

  return `Supratau, pradedam ${genitive} skelbimo kūrimą! Papasakokite daugiau — kaina, vieta, būklė?`;
}

export function buildSellerContextualVoiceFollowUp(  category: string,
  attributes: Record<string, string>,
  missingFields: string[]
): string | null {
  if (!missingFields.length) return null;

  if (category === "vehicles") {
    const filled: string[] = [];
    if (!missingFields.includes("make")) filled.push("markę");
    if (!missingFields.includes("model")) filled.push("modelį");

    const filledPhrase =
      filled.length === 2
        ? "markę ir modelį"
        : filled.length === 1
          ? filled[0]
          : null;

    const questions: string[] = [];
    if (missingFields.includes("year")) {
      questions.push("kokiais metais pagamintas jūsų automobilis");
    }
    if (missingFields.includes("price")) {
      questions.push("kokia būtų kaina");
    }
    if (missingFields.includes("make") && !filledPhrase?.includes("markę")) {
      questions.push("kokia automobilio markė");
    }
    if (missingFields.includes("model") && !filledPhrase?.includes("modelį")) {
      questions.push("koks modelis");
    }
    if (missingFields.includes("city")) {
      questions.push("kokiame mieste skelbiate");
    }
    if (missingFields.includes("vin")) {
      questions.push("ar turite VIN kodą");
    }

    if (filledPhrase && questions.length) {
      const q =
        questions[0]!.charAt(0).toUpperCase() +
        questions[0]!.slice(1) +
        (questions.length > 1 ? ` ir ${questions.slice(1).join(" ir ")}` : "");
      return `AI užpildė ${filledPhrase}. ${q}?`;
    }

    if (questions.length) {
      const q =
        questions[0]!.charAt(0).toUpperCase() +
        questions[0]!.slice(1) +
        (questions.length > 1 ? ` ir ${questions.slice(1).join(" ir ")}` : "");
      return `${q}?`;
    }
  }

  const generic: string[] = [];
  if (missingFields.includes("city")) generic.push("kokiame mieste skelbiate");
  if (missingFields.includes("price")) generic.push("kokia būtų kaina");
  if (missingFields.includes("description")) generic.push("trumpas aprašymas");

  if (!generic.length) return null;
  const q =
    generic[0]!.charAt(0).toUpperCase() +
    generic[0]!.slice(1) +
    (generic.length > 1 ? ` ir ${generic.slice(1).join(" ir ")}` : "");
  return `${q}?`;
}
