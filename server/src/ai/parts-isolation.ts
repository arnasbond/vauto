/**
 * Auto parts / wheels isolation — never leak full-car few-shot fields into parts drafts.
 */

const PARTS_RE =
  /\b(ratlank|ratai|ratų|ratud|ratu|ratus|dis[kc]ai|pads?|padang|tyres?|tires?|wheels?|rims?|al[ei]oy|lieti\s+ratai|detal[eė]|dalys|parts?|bamper|kapot|žibint|zibint|veidrod|stabd|filtr|amortiz|sankab|radiator)\b/i;

const FULL_CAR_LEAK_RE =
  /\b(citro[eë]n|grand\s+c4|c4\s+picasso|odinis\s+salonas|pavarų\s+dėž|pavarų\s+dez|vienatūris|mpv)\b/i;

/** Cabin / powertrain fields that MUST NOT appear on wheels/tires/parts. */
export const FULL_VEHICLE_ONLY_ATTR_KEYS = [
  "interiorCondition",
  "interior",
  "salon",
  "upholstery",
  "exteriorFeatures",
  "exterior",
  "transmission",
  "pavaros",
  "engine",
  "engineCapacity",
  "engineCc",
  "variklis",
  "powerKw",
  "power",
  "galia",
  "fuelType",
  "fuel",
  "kuras",
  "mileage",
  "rida",
  "vin",
  "VIN",
  "vinKodas",
  "seats",
  "seatCount",
  "vietos",
  "bodyType",
  "kebulas",
  "firstRegistration",
  "registrationDate",
  "techInspection",
  "ta",
  "taValidUntil",
  "inspectionValidUntil",
  "euroStandard",
  "curbWeight",
  "plate",
  "licensePlate",
] as const;

export function isAutoPartsOrWheelsContext(
  ...parts: Array<string | null | undefined>
): boolean {
  const hay = parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (!hay) return false;
  if (PARTS_RE.test(hay)) return true;
  // Typo-tolerant: "pordodu ratud r17"
  if (/\bratud\b|\br17\b|\br1[4-9]\b|\b\d{2}\s*col/i.test(hay)) return true;
  return false;
}

export function looksLikeLeakedFullCarCopy(text: string): boolean {
  return FULL_CAR_LEAK_RE.test(String(text ?? ""));
}

/**
 * Strip full-vehicle attributes / leaked car copy from a parts/wheels draft.
 * No-op when context is a real full vehicle.
 */
export function stripFullVehicleFieldsFromPartsDraft<
  T extends {
    title?: string;
    description?: string;
    category?: string;
    attributes?: Record<string, unknown>;
  },
>(draft: T, userText?: string): T {
  const user = String(userText ?? "");
  const partsIntent = isAutoPartsOrWheelsContext(
    user,
    draft.title,
    draft.description
  );
  if (!partsIntent) return draft;

  const attrs = { ...(draft.attributes ?? {}) };
  for (const key of FULL_VEHICLE_ONLY_ATTR_KEYS) {
    delete attrs[key];
  }

  // Drop hallucinated full-car make/model unless user named that brand for parts.
  const make = String(attrs.make ?? attrs.brand ?? "").trim();
  if (
    make &&
    /citro|bmw|audi|volvo|mercedes|toyota|volkswagen|opel|ford|peugeot|renault/i.test(
      make
    ) &&
    !new RegExp(make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(user)
  ) {
    delete attrs.make;
    delete attrs.brand;
    if (!/\b(r17|r1[4-9]|rat|padang|wheel|rim)/i.test(String(attrs.model ?? ""))) {
      delete attrs.model;
    }
  }

  let title = String(draft.title ?? "");
  let description = String(draft.description ?? "");
  if (looksLikeLeakedFullCarCopy(`${title}\n${description}`)) {
    if (/citro|picasso|odinis|pavar|vienatūr/i.test(title)) {
      title = user.match(/\br17\b/i)
        ? "Ratlankiai R17"
        : "Ratlankiai / auto dalys";
    }
    description = description
      .replace(/citro[eë]n[^.!\n]*/gi, "")
      .replace(/grand\s+c4\s+picasso[^.!\n]*/gi, "")
      .replace(/odinis\s+salonas[^.!\n]*/gi, "")
      .replace(/pavarų\s+dėž[^.!\n]*/gi, "")
      .replace(/vienatūr[^.!\n]*/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return {
    ...draft,
    title: title || draft.title,
    description,
    category: /vehicles|automobiliai/i.test(String(draft.category ?? ""))
      ? "other"
      : draft.category,
    attributes: attrs as T["attributes"],
  };
}
