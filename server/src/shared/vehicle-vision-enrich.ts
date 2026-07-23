/**
 * Post-Vision vehicle attribute enrichment — deterministic rules that Gemini
 * prompts alone cannot reliably enforce (Grand logic, paddles, full B date).
 */

function attrStr(
  attrs: Record<string, string | string[] | undefined>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const raw = attrs[key];
    const value = Array.isArray(raw) ? raw.map(String).join(", ") : String(raw ?? "");
    const t = value.trim();
    if (t) return t;
  }
  return "";
}

function setAttr(
  attrs: Record<string, string | string[] | undefined>,
  key: string,
  value: string
): void {
  if (value.trim()) attrs[key] = value.trim();
}

/** Normalize registration date to YYYY-MM-DD when possible; keep year separately. */
export function normalizeFirstRegistrationDate(raw: string): {
  fullDate: string;
  year: string;
} {
  const t = raw.trim();
  if (!t) return { fullDate: "", year: "" };
  const iso = t.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (iso) {
    const y = iso[1]!;
    const m = iso[2]!.padStart(2, "0");
    const d = iso[3]!.padStart(2, "0");
    return { fullDate: `${y}-${m}-${d}`, year: y };
  }
  const yOnly = t.match(/\b((19|20)\d{2})\b/);
  return { fullDate: "", year: yOnly?.[1] ?? "" };
}

/**
 * If S.1 = 7 (or seats≈7) and model is C4 Picasso without Grand — upgrade to Grand.
 */
export function applyGrandPicassoModelRule(
  make: string,
  model: string,
  seats: string,
  description = ""
): string {
  const seatsN = Number(String(seats).replace(/[^\d]/g, ""));
  const isSeven = seatsN === 7 || /\b7\s*viet/i.test(seats) || /\b7\s*seat/i.test(description);
  const m = model.trim().replace(/\s+/g, " ");
  if (!isSeven) return m;
  if (/grand\s+c4\s+picasso/i.test(m)) return m.replace(/\s+/g, " ");
  if (/c4\s+picasso/i.test(m) && !/grand/i.test(m)) {
    return m.replace(/c4\s+picasso/i, "Grand C4 Picasso");
  }
  if (/picasso/i.test(m) && /citro/i.test(make) && !/grand/i.test(m)) {
    return `Grand ${m}`.replace(/\s+/g, " ");
  }
  return m;
}

const PADDLE_RE =
  /\b(mentel|paddle|shift.?paddle|prie\s+vairo.*pavar|EGS|MCP|semi.?auto)\b/i;

/**
 * If paddles detected in interior/exterior/description → Automatinė / EGS.
 */
export function applyPaddleTransmissionRule(
  transmission: string,
  ...visualBlobs: string[]
): string {
  const blob = [transmission, ...visualBlobs].join(" ");
  if (PADDLE_RE.test(blob) || /mentelės\s+prie\s+vairo/i.test(blob)) {
    return "Automatinė / EGS (pusiau automatinė)";
  }
  return transmission.trim();
}

/** Build bullet-ready exterior / interior feature strings from free text. */
export function normalizeVisualFeatureBullets(input: {
  interior?: string;
  exterior?: string;
  description?: string;
}): { interiorBullets: string; exteriorBullets: string } {
  const corpus = [
    input.interior ?? "",
    input.exterior ?? "",
    input.description ?? "",
  ]
    .join("\n")
    .toLowerCase();

  const interiorBits: string[] = [];
  if (/od(a|os|inė|ines|inis)|leather|kamel|ruda\s+od/i.test(corpus)) {
    interiorBits.push("Odinis / kamelio spalvos salonas");
  }
  if (/porank/i.test(corpus)) interiorBits.push("Porankiai prie sėdynių");
  if (PADDLE_RE.test(corpus) || /mentel/i.test(corpus)) {
    interiorBits.push("Mentelės prie vairo (EGS)");
  }
  if (/bagaž|bagažin|proline|kilim/i.test(corpus)) {
    interiorBits.push("Erdvi bagažinė / apsauginis kilimėlis");
  }
  if (/multimedia|ekran|navigac/i.test(corpus)) {
    interiorBits.push("Multimedija / ekranas");
  }

  const exteriorBits: string[] = [];
  if (/ratlank|alloy|lieti\s+ratai|lengvojo\s+lydinio/i.test(corpus)) {
    exteriorBits.push("Originalūs lengvojo lydinio ratlankiai");
  }
  if (/rilin|stogo\s+bėgel|roof\s*rail|reling/i.test(corpus)) {
    exteriorBits.push("Stogo bagažinės bėgeliai (rilingai)");
  }
  if (/deflektor/i.test(corpus)) {
    exteriorBits.push("Langų deflektoriai");
  }
  if (/kabl|tow|vilkim/i.test(corpus)) {
    exteriorBits.push("Vilkimo kablys");
  }
  if (/vienatūr|mpv|minivan|grand\s+c4/i.test(corpus)) {
    exteriorBits.push("Vienatūris (šeimos) kėbulas");
  }

  // Preserve prior structured text if heuristics found nothing.
  const interiorBullets =
    interiorBits.length > 0
      ? interiorBits.map((b) => `• ${b}`).join("\n")
      : (input.interior ?? "").trim();
  const exteriorBullets =
    exteriorBits.length > 0
      ? exteriorBits.map((b) => `• ${b}`).join("\n")
      : (input.exterior ?? "").trim();

  return { interiorBullets, exteriorBullets };
}

export type VehicleDraftLike = {
  title?: string;
  description?: string;
  category?: string;
  attributes?: Record<string, string | string[] | undefined>;
};

/**
 * Apply all Step-1 strict rules to a listing draft after Vision JSON parse.
 */
export function enrichVehicleVisionDraft<T extends VehicleDraftLike>(draft: T): T {
  const cat = String(draft.category ?? "").toLowerCase();
  const attrs = { ...(draft.attributes ?? {}) };
  const looksVehicle =
    cat === "vehicles" ||
    cat === "transport" ||
    cat === "automobiliai" ||
    Boolean(attrStr(attrs, "make", "vin", "plate", "licensePlate", "powerKw"));
  if (!looksVehicle) return draft;

  const regRaw = attrStr(
    attrs,
    "firstRegistration",
    "registrationDate",
    "regDate",
    "firstRegDate",
    "year"
  );
  const { fullDate, year } = normalizeFirstRegistrationDate(regRaw);
  if (fullDate) {
    setAttr(attrs, "firstRegistration", fullDate);
    setAttr(attrs, "registrationDate", fullDate);
  }
  if (year) setAttr(attrs, "year", year);
  else if (/^\d{4}$/.test(regRaw)) setAttr(attrs, "year", regRaw);

  const make = attrStr(attrs, "make", "brand");
  let model = attrStr(attrs, "model");
  const seats = attrStr(attrs, "seats", "seatCount", "vietos");
  model = applyGrandPicassoModelRule(
    make,
    model,
    seats,
    draft.description ?? ""
  );
  if (model) setAttr(attrs, "model", model);

  const interior = attrStr(attrs, "interiorCondition", "interior", "salon", "upholstery");
  const exterior = attrStr(
    attrs,
    "exteriorFeatures",
    "exterior",
    "features",
    "equipment"
  );
  const transmission = applyPaddleTransmissionRule(
    attrStr(attrs, "transmission", "gearbox"),
    interior,
    exterior,
    draft.description ?? ""
  );
  if (transmission) setAttr(attrs, "transmission", transmission);

  const { interiorBullets, exteriorBullets } = normalizeVisualFeatureBullets({
    interior,
    exterior,
    description: draft.description,
  });
  if (interiorBullets) setAttr(attrs, "interiorCondition", interiorBullets);
  if (exteriorBullets) setAttr(attrs, "exteriorFeatures", exteriorBullets);

  const yearForTitle = attrStr(attrs, "year") || year;
  let title = (draft.title ?? "").trim();
  if (make && model) {
    const preferred = `${make} ${model}${yearForTitle ? ` ${yearForTitle}` : ""}`.trim();
    if (
      !title ||
      title === "Skelbimas" ||
      (/c4\s+picasso/i.test(title) && /grand/i.test(model) && !/grand/i.test(title))
    ) {
      title = preferred;
    }
  }

  return {
    ...draft,
    title: title || draft.title,
    attributes: attrs,
  };
}
