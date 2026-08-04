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

/** Spec-list fuel label (nominative noun) — kept for **Variklis:** rows. */
export function formatFuelLabelNominative(fuel: string): string {
  const t = fuel.trim().toLowerCase();
  if (!t) return "";
  if (/elekt/.test(t)) return "elektra";
  if (/hibrid/.test(t)) return "hibridas";
  if (/dyzel|diesel/.test(t)) return "dyzelinas";
  if (/benzin|petrol|gasoline/.test(t)) return "benzinas";
  if (/duj|lpg|cng/.test(t)) return "dujos";
  return fuel.trim().toLowerCase();
}

/** Prose adjective agreement: „dyzelinis variklis“, „benzininis variklis“. */
export function formatFuelAdjective(fuel: string): string {
  const t = fuel.trim().toLowerCase();
  if (!t) return "";
  if (/elekt/.test(t)) return "elektrinis";
  if (/hibrid/.test(t)) return "hibridinis";
  if (/dyzel|diesel/.test(t)) return "dyzelinis";
  if (/benzin|petrol|gasoline/.test(t)) return "benzininis";
  if (/duj|lpg|cng/.test(t)) return "dujinis";
  return "";
}

/**
 * Soft locative for common LT cities in sales prose („Kaišiadoryse“, „Vilniuje“).
 * Falls back to a light heuristic if unknown — never invents a wrong case blindly.
 */
export function cityInLocative(city: string): string {
  const raw = city.trim();
  if (!raw) return "";
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ė/g, "e")
    .replace(/š/g, "s")
    .replace(/ų|ū/g, "u")
    .replace(/ž/g, "z")
    .replace(/ą/g, "a")
    .replace(/č/g, "c")
    .replace(/į/g, "i");
  const table: Record<string, string> = {
    vilnius: "Vilniuje",
    kaunas: "Kaune",
    klaipeda: "Klaipėdoje",
    siauliai: "Šiauliuose",
    panevezys: "Panevėžyje",
    alytus: "Alytuje",
    marijampole: "Marijampolėje",
    utena: "Utenoje",
    kaisiadorys: "Kaišiadoryse",
    jonava: "Jonavoje",
    kedainiai: "Kėdainiuose",
    telsiai: "Telšiuose",
    taurage: "Tauragėje",
    ukmerge: "Ukmergėje",
    palanga: "Palangoje",
    druskininkai: "Druskininkuose",
    mazeikiai: "Mažeikiuose",
    plunge: "Plungėje",
  };
  if (table[key]) return table[key]!;
  if (/ys$/i.test(raw)) return raw.replace(/ys$/i, "yse");
  if (/iai$/i.test(raw)) return raw.replace(/iai$/i, "iuose");
  if (/a$/i.test(raw)) return `${raw.slice(0, -1)}oje`;
  if (/ė$/i.test(raw)) return `${raw.slice(0, -1)}ėje`;
  if (/us$/i.test(raw)) return `${raw.slice(0, -2)}uje`;
  return raw;
}

/** Build a natural LT engine phrase for prose (not the spec-list row). */
export function formatEngineProsePhrase(parts: {
  engine?: string;
  fuel?: string;
  powerKw?: string;
}): string {
  const eng = (parts.engine ?? "").trim();
  const fuelAdj = formatFuelAdjective(parts.fuel ?? "");
  const fuelNom = formatFuelLabelNominative(parts.fuel ?? "");
  const kw = (parts.powerKw ?? "").replace(/\s*kW$/i, "").trim();
  const engNorm =
    eng && /\d/.test(eng) && !/l/i.test(eng) ? `${eng} l` : eng;

  const chunks: string[] = [];
  if (fuelAdj && engNorm) {
    chunks.push(`${fuelAdj} ${engNorm} variklis`);
  } else if (fuelAdj) {
    chunks.push(`${fuelAdj} variklis`);
  } else if (engNorm && fuelNom) {
    chunks.push(`${engNorm} variklis (${fuelNom})`);
  } else if (engNorm) {
    chunks.push(`${engNorm} variklis`);
  } else if (fuelNom) {
    chunks.push(fuelNom);
  }
  if (kw) chunks.push(`${kw} kW`);
  return chunks.join(", ");
}

/** User confirmed Step-2 vision summary → generate sales ad (Paruošti skelbimą). */
export function isVehicleSalesCopyConfirmIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 120) return false;
  if (/paruošti\s+skelbim/i.test(t)) return true;
  if (/^✨?\s*paruošti\s+skelbim/i.test(t)) return true;
  if (/^(taip|ok|gerai|yes)\b/.test(t)) return true;
  if (/taip[,!]?\s*(paruošk|paruosk|generuok|rašyk|parasyk|paruošti)/i.test(t)) {
    return true;
  }
  if (/^(paruošk|paruosk|generuok|sukurk)\b/i.test(t)) return true;
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

  const makeModel =
    [make, model].filter(Boolean).join(" ") ||
    enriched.title?.trim() ||
    "automobilis";
  const yearBit = year ? ` (${year} m.)` : "";

  const interiorLines = splitFeatureLines(
    attr(attrs, "interiorCondition", "interior", "salon")
  );
  const exteriorLines = splitFeatureLines(
    attr(attrs, "exteriorFeatures", "exterior", "features", "equipment")
  );

  const fuelNom = formatFuelLabelNominative(fuel);
  const engineSpecLine = [
    engine
      ? /\d/.test(engine) && !/l/i.test(engine)
        ? `${engine} l`
        : engine
      : "",
    fuelNom,
    powerKw ? `${powerKw} kW` : "",
    euro
      ? euro.toUpperCase().startsWith("EURO")
        ? euro
        : `Euro ${euro}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");

  const engineProse = formatEngineProsePhrase({
    engine,
    fuel,
    powerKw,
  });

  const headline = `🚗 Parduodamas ${makeModel}${yearBit}`.replace(/\s+/g, " ").trim();

  const lines: string[] = [
    headline,
    "",
    make || model ? `**Markė / Modelis:** ${makeModel}` : "",
    regDate
      ? `**Pirmosios registracijos data:** ${regDate}`
      : year
        ? `**Metai:** ${year}`
        : "",
    engineSpecLine ? `**Variklis:** ${engineSpecLine}` : "",
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
  const open = `Parduodamas erdvus ir praktiškas ${makeModel}${yearBit}`
    .replace(/\s+/g, " ")
    .trim();
  if (engineProse) {
    descParts.push(`${open} su ${engineProse}.`);
  } else {
    descParts.push(`${open}.`);
  }
  if (interiorLines.length) {
    descParts.push(`Salonas: ${interiorLines.join(", ").toLowerCase()}.`);
  }
  if (exteriorLines.length) {
    descParts.push(`Komplektacija: ${exteriorLines.join(", ").toLowerCase()}.`);
  }
  if (city) {
    descParts.push(`Automobilis stovi ${cityInLocative(city)}.`);
  }
  descParts.push("Dėl apžiūros kreipkitės nurodytu telefonu.");
  lines.push(descParts.join(" "));

  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

/** Chat-only follow-ups — never paste into listing.description. */
export function listVehicleSalesCopyGaps(draft: SalesCopyDraft): string[] {
  const enriched = enrichVehicleVisionDraft(draft);
  const attrs = enriched.attributes ?? {};
  const ta = attr(attrs, "techInspection", "ta", "inspectionValidUntil", "taValidUntil");
  const mileage = attr(attrs, "mileage", "odometer", "rida");
  const transmission = attr(attrs, "transmission", "gearbox");
  const price =
    enriched.price != null && Number(enriched.price) > 0
      ? Number(enriched.price)
      : 0;

  const missing: string[] = [];
  if (!(price > 0)) missing.push("kainą (€)");
  if (!ta) missing.push("TA galiojimą");
  if (!mileage) missing.push("ridą (km)");
  if (!transmission) missing.push("pavarų dėžę");
  return missing;
}
