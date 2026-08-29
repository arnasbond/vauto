/** Opening follow-up after create_listing_draft — active consultant, not a form checklist. */
import { factsFromAttributes, selectNextQuestion } from "./sell/next-question-policy.js";

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

/**
 * Phase 2B — single highest-value missing-fact question policy.
 *
 * Vertical facts (make, model, mileage, area, size, salary, …) AND the universal
 * publish blockers (`sellerType`, `city`) are now selected together inside one
 * deterministic decision (`selectNextQuestion`) — see that module's documented
 * priority contract. `missingFields` (computed upstream by `postNewListing` from
 * the authoritative city/sellerType checks) is the small normalized blocker signal
 * this function passes in; it is never re-derived here. The post-policy fallback
 * below is only reached for a category the policy does not recognize at all.
 */
export function buildSellerContextualVoiceFollowUp(
  category: string,
  attributes: Record<string, string>,
  missingFields: string[]
): string | null {
  const facts = factsFromAttributes(category, attributes, {
    // Only presence matters to the policy — missingFields is already the source of truth for price.
    price: missingFields.includes("price") ? null : 1,
  });
  const blockers = {
    sellerType: { value: missingFields.includes("sellerType") ? undefined : 1 },
    city: { value: missingFields.includes("city") ? undefined : 1 },
  };
  const next = selectNextQuestion({ category, facts, blockers });
  if (next) return next.question;

  // Unreached for any recognized NextQuestionCategory (blockers/price are already
  // covered above) — kept only as a safety net for an unmapped category string.
  if (missingFields.includes("price")) {
    return "Kokią kainą nustatome eurais — norite greitesnio pardavimo ar aukštesnės kainos?";
  }

  if (missingFields.includes("sellerType")) {
    return "Skelbiate kaip privatus asmuo ar kaip įmonė?";
  }

  if (missingFields.includes("city")) {
    return "Kurį miestą rodyti pirkėjams skelbime?";
  }

  return null;
}
