/**
 * Step-2 benchmark Lithuanian vehicle sales copy — only from known draft facts.
 * NEVER invents price, TA, or mileage.
 */

import { enrichVehicleVisionDraft } from "./vehicle-vision-enrich.js";

function attr(
  attrs: Record<string, string | string[] | undefined> | undefined,
  ...keys: string[]
): string {
  if (!attrs) return "";
  for (const key of keys) {
    const raw = attrs[key];
    const value = Array.isArray(raw) ? raw.map(String).join(", ") : String(raw ?? "");
    const t = value.trim();
    if (t) return t;
  }
  return "";
}

/** User confirmed Step-1 OCR report → generate sales ad. */
export function isVehicleSalesCopyConfirmIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 120) return false;
  if (/^(taip|ok|gerai|yes)\b/.test(t)) return true;
  if (/taip[,!]?\s*(paruošk|paruosk|generuok|rašyk|parasyk)/i.test(t)) return true;
  if (/^(paruošk|paruosk|generuok|sukurk)\b.*\b(skelbim|tekst|apraš)/i.test(t)) {
    return true;
  }
  if (/generuok\s+skelbim/i.test(t)) return true;
  if (/paruošk.*skelbim/i.test(t)) return true;
  if (/noriu\s+(skelbimo\s+)?tekst/i.test(t)) return true;
  return false;
}

export type SalesCopyDraft = {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string | string[] | undefined>;
};

function splitFeatureLines(raw: string): string[] {
  return raw
    .split(/\n|•|;|\|/)
    .map((s) => s.replace(/^[-*•\s]+/, "").trim())
    .filter((s) => s.length >= 3);
}

/**
 * Build Gemini-benchmark style Lithuanian selling ad from draft facts only.
 */
export function buildVehicleBenchmarkSalesCopy(draft: SalesCopyDraft): string {
  const enriched = enrichVehicleVisionDraft(draft);
  const attrs = enriched.attributes ?? {};
  const make = attr(attrs, "make", "brand");
  const model = attr(attrs, "model");
  const year = attr(attrs, "year");
  const regDate = attr(
    attrs,
    "firstRegistration",
    "registrationDate",
    "regDate"
  );
  const engine = attr(attrs, "engine", "engineSize");
  const powerKw = attr(attrs, "powerKw", "power", "kw").replace(/\s*kW$/i, "");
  const fuel = attr(attrs, "fuelType", "fuel");
  const color = attr(attrs, "color", "colour");
  const seats = attr(attrs, "seats", "seatCount");
  const body = attr(attrs, "bodyType", "body") || (seats === "7" ? "Vienatūris" : "");
  const euro = attr(attrs, "euroStandard", "emissionStandard", "euro");
  const plate = attr(attrs, "plate", "licensePlate");
  const transmission = attr(attrs, "transmission", "gearbox");
  const city = (enriched.location ?? "").trim();
  const price =
    enriched.price != null && Number(enriched.price) > 0
      ? Number(enriched.price)
      : 0;
  const ta = attr(attrs, "techInspection", "ta", "inspectionValidUntil", "taValidUntil");
  const mileage = attr(attrs, "mileage", "odometer", "rida");

  const makeModel = [make, model].filter(Boolean).join(" ") || enriched.title?.trim() || "automobilis";
  const yearBit = year ? ` (${year} m.)` : "";

  const interiorLines = splitFeatureLines(
    attr(attrs, "interiorCondition", "interior", "salon")
  );
  const exteriorLines = splitFeatureLines(
    attr(attrs, "exteriorFeatures", "exterior", "features", "equipment")
  );

  const engineLine = [
    engine
      ? /\d/.test(engine) && !/l/i.test(engine)
        ? `${engine} l`
        : engine
      : "",
    fuel,
    powerKw ? `${powerKw} kW` : "",
    euro ? euro.toUpperCase().startsWith("EURO") ? euro : `Euro ${euro}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const headline = `🚗 Parduodamas ${makeModel}${yearBit}`.replace(/\s+/g, " ").trim();

  const lines: string[] = [
    headline,
    "",
    make || model ? `**Markė / Modelis:** ${makeModel}` : "",
    regDate ? `**Pirmosios registracijos data:** ${regDate}` : year ? `**Metai:** ${year}` : "",
    engineLine ? `**Variklis:** ${engineLine}` : "",
    color ? `**Spalva:** ${color}` : "",
    body || seats
      ? `**Kėbulo tipas:** ${[body, seats ? `${seats} vietų` : ""].filter(Boolean).join(" · ")}`
      : "",
    transmission ? `**Pavarų dėžė:** ${transmission}` : "",
    plate ? `**Valstybinis numeris:** ${plate}` : "",
    price > 0 ? `**Kaina:** ${price.toLocaleString("lt-LT")} €` : "",
    ta ? `**Techninė apžiūra:** ${ta}` : "",
    city ? `**Miestas:** ${city}` : "",
    "",
    "🌟 **Pagrindiniai privalumai ir komplektacija:**",
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));

  const advantageBullets: string[] = [];
  if (seats === "7" || /grand/i.test(model)) {
    advantageBullets.push(
      "Labai erdvus ir praktiškas: 7 sėdimos vietos, šeimos vienatūris."
    );
  }
  for (const b of interiorLines.slice(0, 6)) {
    advantageBullets.push(b);
  }
  for (const b of exteriorLines.slice(0, 6)) {
    advantageBullets.push(b);
  }
  if (euro) {
    advantageBullets.push(`Taršos standartas: ${euro}.`);
  }
  if (!advantageBullets.length) {
    advantageBullets.push(
      "Techniniai duomenys pagal registracijos dokumentą ir nuotraukas."
    );
  }
  for (const b of advantageBullets) {
    lines.push(`- ${b}`);
  }

  lines.push("", "**Aprašymas:**");
  const descParts: string[] = [];
  descParts.push(
    `Parduodamas erdvus ir praktiškas ${makeModel}${yearBit}`.replace(/\s+/g, " ").trim() +
      (engineLine ? ` su ${engineLine.toLowerCase()}.` : ".")
  );
  if (interiorLines.length) {
    descParts.push(`Salonas: ${interiorLines.join(", ").toLowerCase()}.`);
  }
  if (exteriorLines.length) {
    descParts.push(`Komplektacija: ${exteriorLines.join(", ").toLowerCase()}.`);
  }
  if (city) {
    descParts.push(`Automobilis ${city}.`);
  }
  descParts.push("Dėl apžiūros kreipkitės nurodytu telefonu.");
  lines.push(descParts.join(" "));

  const missing: string[] = [];
  if (!(price > 0)) missing.push("kainą (€)");
  if (!ta) missing.push("techninės apžiūros (TA) galiojimą");
  if (!mileage) missing.push("faktinę ridą (km)");
  if (!transmission) missing.push("pavarų dėžę (jei dar nepatvirtinta)");

  lines.push("");
  if (missing.length) {
    lines.push(
      `💡 **Patarimas:** Skelbimas paruoštas pagal dokumentą ir nuotraukas. Dar galite papildyti: ${missing.join(", ")}. Nerašykite spėjamų skaičių — tik tikrus duomenis. Kai tekstas tinka — parašykite „Tinka“ arba „Publikuojam“.`
    );
  } else {
    lines.push(
      "💡 **Patarimas:** Skelbimas paruoštas — parašykite „Tinka“, „Publikuojam“ arba „Keliam“, kad atidaryčiau PrePublish peržiūrą."
    );
  }

  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}
