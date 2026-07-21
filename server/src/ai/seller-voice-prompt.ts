/** Opening follow-up after create_listing_draft — active consultant, not a form checklist. */

function clothingWarmOpener(title: string): string {
  const lower = title.toLowerCase();
  if (/bat|aul|bas|ked|sukn|mar|keln|pal|stri|megz|kost/.test(lower)) {
    return "Puiku, atlaisvinam vietą spintoje!";
  }
  return "Puiku — imamės skelbimo.";
}

function looksLikePhone(title: string): boolean {
  return /iphone|samsung|pixel|xiaomi|huawei|oneplus|telefon|mobil/i.test(title);
}

/**
 * First turn after draft create: signal that we will enrich from knowledge,
 * then ask one expert question — never „Trūksta miesto, kainos…“.
 */
export function buildCreateListingDraftFollowUp(
  category: string,
  title: string,
  attributes: Record<string, string> = {}
): string {
  const item = title.trim() || "prekę";
  const hasColor = Boolean(attributes.color?.trim());
  const hasSize = Boolean(attributes.size?.trim() || attributes.clothingSize?.trim());
  const hasMemory = Boolean(
    attributes.memory?.trim() ||
      attributes.storage?.trim() ||
      attributes.capacity?.trim()
  );

  if (category === "electronics" || looksLikePhone(item)) {
    const enrich =
      looksLikePhone(item)
        ? `Jau sudėlioju turtingą „${item}“ aprašymą su tipinėmis specifikacijomis (ekranas, našumas, kamera, baterija) — pirkėjai taip greičiau pasitiki skelbimu.`
        : `Jau rašau profesionalų „${item}“ aprašymą su pagrindinėmis savybėmis — kad skelbimas atrodytų kaip iš gero salono, ne kaip vienos eilutės skelbimukas.`;
    if (hasColor && hasMemory) {
      return `${enrich}\n\nKokią kainą norėtumėte matyti — greitam pardavimui ar maksimaliai vertei?`;
    }
    return `${enrich}\n\nKokia jūsų įrenginio spalva ir vidinė atmintis? Ar pridedate įkroviklį / dėžutę?`;
  }

  if (category === "clothing") {
    const opener = clothingWarmOpener(item);
    if (hasColor && hasSize) {
      return `${opener} Sudėlioju gražų aprašymą su stiliumi ir būkle.\n\nKokia būtų kaina?`;
    }
    return `${opener} Paruošiu patrauklų aprašymą.\n\nKokios spalvos ir dydžio prekė — ir ar būklė kaip nauja?`;
  }

  if (category === "vehicles") {
    return `Pradedame „${item}“ skelbimą — parašysiu rimtą aprašymą su rinkos kontekstu.\n\nKokiais metais automobilis, kokia rida ir kokia komplektacija?`;
  }

  if (category === "real_estate") {
    return `Pradedame „${item}“ skelbimą — sudėliosiu aiškų, patikimą aprašymą.\n\nKoks plotas (m²) ir kiek kambarių?`;
  }

  if (category === "services" || category === "jobs") {
    return `Puiku — formuoju profesionalų „${item}“ skelbimą.\n\nKoks pagrindinis jūsų pasiūlymas vienu sakiniu ir kokiame spindulyje dirbate?`;
  }

  return `Puiku — imamės „${item}“. Parašysiu turtingą aprašymą, kad skelbimas išsiskirtų.\n\nPapasakokite svarbiausią detalę pirkėjui (būklė, komplektacija ar kodėl parduodate)?`;
}

export function buildSellerContextualVoiceFollowUp(
  category: string,
  attributes: Record<string, string>,
  missingFields: string[]
): string | null {
  if (!missingFields.length) return null;

  // Product consulting first — city/phone last, never as a checklist dump.
  if (category === "electronics") {
    if (
      missingFields.includes("model") ||
      !attributes.memory?.trim() ||
      !attributes.color?.trim()
    ) {
      return "Kokia spalva ir vidinė atmintis? Jei turite — ar pridedate įkroviklį?";
    }
  }

  if (category === "vehicles") {
    if (missingFields.includes("year") || missingFields.includes("make") || missingFields.includes("model")) {
      const bits: string[] = [];
      if (missingFields.includes("make")) bits.push("markė");
      if (missingFields.includes("model")) bits.push("modelis");
      if (missingFields.includes("year")) bits.push("metai");
      if (bits.length) {
        return `Patikslinkime: ${bits.join(", ")}? Tada sudėliosiu stipresnį aprašymą.`;
      }
    }
    if (missingFields.includes("vin")) {
      return "Ar turite VIN — galiu padėti greičiau užpildyti techninius laukus?";
    }
  }

  if (missingFields.includes("price")) {
    return "Kokią kainą nustatome eurais — norite greitesnio pardavimo ar aukštesnės kainos?";
  }

  if (missingFields.includes("sellerType")) {
    return "Skelbiate kaip privatus asmuo ar kaip įmonė?";
  }

  // City only after product + price questions are done.
  if (missingFields.includes("city")) {
    return "Kurį miestą rodyti pirkėjams skelbime?";
  }

  return null;
}
