import type { ListingCategory } from "@/lib/types";
import { categoryFilterFieldsFor } from "@/lib/category-attribute-filters";
import { VEHICLE_MAKES, modelsForMake } from "@/data/vehicle-makes-models";
import { MarketplaceFilterState } from "@/lib/marketplace-view";
import { resolveAiVertical } from "@/lib/ai-vertical-adapter";

/**
 * Stage 18A/18B — Conversational entry: natural language → canonical facets.
 *
 * This module is an ADAPTER into the canonical 13A/13B search/facet system, NOT
 * a separate "AI filter model". It turns a natural-language request into
 * structured FacetChip[] where each chip maps onto either a base
 * MarketplaceFilterState field or a canonical CategoryAttributeFilters key from
 * categoryFilterFieldsFor(). The vertical is resolved by `resolveAiVertical`
 * (ai-vertical-adapter), which is itself an AI adapter over the canonical 13A
 * domain registry — there is no duplicate vertical truth source here.
 *
 * Principle: if a criteria cannot be confidently mapped to a canonical facet,
 * it is NOT silently invented — it is skipped (or surfaced as a plain keyword).
 */

/** Kind of canonical target a chip writes to. */
export type FacetChipKind =
  | "vertical"
  | "keyword"
  | "location"
  | "price"
  | "condition"
  | "radius"
  | "attribute";

export interface FacetChip {
  /** Stable id for the UI (field + value). */
  id: string;
  kind: FacetChipKind;
  /** Canonical source field the chip reads/writes. */
  field: string;
  /** Human label in Lithuanian. */
  label: string;
  /** Parsed value (already canonical where possible). */
  value: string;
  /** True when the chip came from this AI interpretation. */
  fromAi: boolean;
  /** Attribute value is selectable from these canonical options (for editing). */
  options?: readonly string[];
  /** Base MarketplaceFilterState field target, when applicable. */
  baseField?: keyof MarketplaceFilterState | "categoryAttributes";
}

export interface AiFacetInterpretation {
  chips: FacetChip[];
  vertical: ListingCategory | "all";
  /** Remaining natural-language that was not mapped to a facet (keyword search). */
  residualQuery: string;
}

function normToken(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Lowercase + strip diacritics ("šiauliai", "ieskoti", "butu"). */
function normDiacritics(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Build a chip id deterministically. */
function chipId(field: string, value: string, kind: FacetChipKind): string {
  return `ai:${kind}:${field}:${normToken(value)}`;
}

/** Extract a price bound from text like "iki 120 000", "120 tūkst.", "iki 120000 €". */
function parsePriceHint(text: string): { min?: number; max?: number } {
  const t = text.toLowerCase().replace(/€|eur/g, " ").replace(/\b(trt|tūkst|tukst|k)\b/g, "000");

  // Replace "120 000" / "120.000" separators → "120000".
  const normalized = t.replace(/(\d)([.\s])(\d{3})/g, "$1$3");
  const digits =
    normalized.match(/(?:iki|iki\s+)\s*(\d{4,7})/) ??
    normalized.match(/(?:nuo|nuo\s+)\s*(\d{4,7})/) ??
    (/\d{4,7}/.test(normalized) ? normalized.match(/(\d{4,7})/) : null);

  const iki = normalized.match(/(?:iki|iki\s+)\s*(\d{4,7})/);
  const nuo = normalized.match(/(?:nuo|nuo\s+)\s*(\d{4,7})/);

  const toNum = (raw: string | undefined): number | undefined => {
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const max = toNum(iki?.[1] ?? (nuo ? undefined : digits?.[1]));
  const min = toNum(nuo?.[1]);
  void iki;
  void nuo;
  void digits;
  return { min, max };
}

function detectCity(text: string): string | null {
  const cities: Array<[RegExp, string]> = [
    [/\bvilni(?:us|uje|aus|u[sš]*)\b/i, "Vilnius"],
    [/\bkaun(?:as|e|o[je]?)\b/i, "Kaunas"],
    [/\bklaip[eė]d(?:a|o|oje|ai)[sž]*\b/i, "Klaipėda"],
    [/\b[šs]iauli(?:ai|u|i|uo)s?\b/i, "Šiauliai"],
    [/\bpanev[eė][žz]i[sš]+\b/i, "Panevėžys"],
    [/\banyk[šs][čc](?:iai|iu|i)\b/i, "Anykščiai"],
    [/\bmarijampol[eė]\b/i, "Marijampolė"],
    [/\bdruskinink/i, "Druskininkai"],
    [/\balyt(?:us|aus|uje)\b/i, "Alytus"],
    [/\bu(?:ten[o]?|tena)\b/i, "Utena"],
    [/\btel[šs](?:iai|iu|i)\b/i, "Telšiai"],
    [/\bma[žz]eiki(?:ai|u|i)\b/i, "Mažeikiai"],
    [/\bpalang(?:a|oje|os)\b/i, "Palanga"],
    [/\btrak(?:ai|u|us)\b/i, "Trakai"],
    [/\bjurbark/i, "Jurbarkas"],
    [/\bk[+i]edain/i, "Kėdainiai"],
    [/\btaurag(?:ė|e|es)\b/i, "Tauragė"],
    [/\bkreting(?:a|o)\b/i, "Kretinga"],
  ];
  for (const [re, city] of cities) {
    if (re.test(text)) return city;
  }
  return null;
}

/**
 * Interpret a natural-language query into canonical facet chips + residual
 * keyword. Deterministic (no live API) so the UI always has something to show
 * even when the AI endpoint is unavailable.
 */
export function interpretAiFacets(query: string): AiFacetInterpretation {
  const q = query.trim();
  const text = ` ${q} `.toLowerCase();
  const vertical = resolveAiVertical(q);

  const chips: FacetChip[] = [];
  let residual = q;

  // Vertical chip.
  if (vertical !== "all") {
    chips.push({
      id: chipId("category", vertical, "vertical"),
      kind: "vertical",
      field: "category",
      label: verticalLabelFor(vertical),
      value: vertical,
      fromAi: true,
      options: ["vehicles", "real_estate", "clothing", "jobs", "services", "electronics"],
    });
  }

  // Location (city).
  const city = detectCity(text);
  if (city) {
    chips.push({
      id: chipId("location", city, "location"),
      kind: "location",
      field: "location",
      label: "Vietovė",
      value: city,
      fromAi: true,
      baseField: "location",
    });
    residual = residual.replace(new RegExp(city, "ig"), " ").replace(/\s+/g, " ").trim();
  }

  // Price bound.
  const price = parsePriceHint(q);
  if (price.max != null && price.max > 0) {
    chips.push({
      id: chipId("priceMax", String(price.max), "price"),
      kind: "price",
      field: "priceMax",
      label: "Kaina iki",
      value: String(price.max),
      fromAi: true,
      baseField: "priceMax",
    });
  }
  if (price.min != null && price.min > 0) {
    chips.push({
      id: chipId("priceMin", String(price.min), "price"),
      kind: "price",
      field: "priceMin",
      label: "Kaina nuo",
      value: String(price.min),
      fromAi: true,
      baseField: "priceMin",
    });
  }

  // Condition.
  const condition =
    /\b(naujas|nauja|nauji|new|nenaudot)\b/.test(text) ? "new"
      : /\b(naudot|naudotas|used|ar tai naudotas)\b/.test(text) ? "used"
        : null;
  if (condition) {
    chips.push({
      id: chipId("condition", condition, "condition"),
      kind: "condition",
      field: "condition",
      label: "Būklė",
      value: condition === "new" ? "Naujas" : "Naudotas",
      fromAi: true,
      baseField: "condition",
    });
  }

  // Radius hint ("Vilnius + 100 km", "šį savaitgalį" → service location constraint).
  const radiusMatch = text.match(/\+\s*(\d{1,3})\s*km|\b([5-9]|[12]\d|50)\s*km\b/);
  if (radiusMatch) {
    const km = Number(radiusMatch[1] ?? radiusMatch[2]);
    if (km >= 5 && km <= 50) {
      chips.push({
        id: chipId("radiusKm", String(km), "radius"),
        kind: "radius",
        field: "radiusKm",
        label: "Spindulys",
        value: `${km} km`,
        fromAi: true,
        baseField: "radiusKm",
      });
    }
  }

  // Vertical-specific attribute facets (18D) via the canonical field registry.
  chips.push(...interpretVerticalAttributes(normDiacritics(q), vertical));

  return { chips, vertical, residualQuery: residual };
}

function verticalLabelFor(vertical: ListingCategory | "all"): string {
  switch (vertical) {
    case "vehicles":
      return "Transportas";
    case "real_estate":
      return "Nekilnojamas turtas";
    case "clothing":
      return "Mada";
    case "jobs":
      return "Darbas";
    case "services":
      return "Paslaugos";
    case "electronics":
      return "Elektronika";
    case "home":
      return "Namai ir buitis";
    case "other":
      return "Kita";
    default:
      return "Prekės";
  }
}

function interpretVerticalAttributes(
  text: string,
  vertical: ListingCategory | "all"
): FacetChip[] {
  const chips: FacetChip[] = [];
  const fields = categoryFilterFieldsFor(vertical);

  if (vertical === "vehicles") {
    // Make & model feed the canonical keyword path (search by make/model).
    const make = VEHICLE_MAKES.find((m) => text.includes(normToken(m)));
    if (make) {
      chips.push({
        id: chipId("make", make, "keyword"),
        kind: "keyword",
        field: "make",
        label: "Markė",
        value: make,
        fromAi: true,
      });
      const model = modelsForMake(make).find((md) => text.includes(normToken(md)));
      if (model && model !== make) {
        chips.push({
          id: chipId("model", model, "keyword"),
          kind: "keyword",
          field: "model",
          label: "Modelis",
          value: model,
          fromAi: true,
        });
      }
    }

    // Year (from/to).
    const yearMatch = text.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const y = yearMatch[1];
      const isFrom = text.includes("nuo");
      chips.push({
        id: chipId(isFrom ? "yearFrom" : "yearTo", y, "attribute"),
        kind: "attribute",
        field: isFrom ? "yearFrom" : "yearTo",
        label: isFrom ? "Metai nuo" : "Metai iki",
        value: y,
        fromAi: true,
        options: fields.find((f) => f.key === (isFrom ? "yearFrom" : "yearTo"))?.options,
        baseField: "categoryAttributes",
      });
    }

    // Fuel.
    const fuel = fields.find((f) => f.key === "fuelType");
    if (fuel) {
      const fuelVal =
        /\bdyzel(?:in|inio|inis)\b/.test(text) ? "Dyzelinas"
          : /\bbenzi(n|o|inio|inis)?\b/.test(text) ? "Benzinas"
            : /\belektr(?:inis|inio|inio)\b/.test(text) ? "Elektra"
              : /\bhibrid(?:inis|inio|inio)\b/.test(text) ? "Hibridas"
                : null;
      if (fuelVal) {
        chips.push({
          id: chipId("fuelType", fuelVal, "attribute"),
          kind: "attribute",
          field: "fuelType",
          label: "Kuras",
          value: fuelVal,
          fromAi: true,
          options: fuel.options,
          baseField: "categoryAttributes",
        });
      }
    }

    // Gearbox (transmission).
    const gear = fields.find((f) => f.key === "gearbox");
    if (gear) {
      const gearVal =
        /\ba(utomatin|utomatas)\b/.test(text) ? "Automatinė"
          : /\bmechanin|rankin\b/.test(text) ? "Mechaninė"
            : null;
      if (gearVal) {
        chips.push({
          id: chipId("gearbox", gearVal, "attribute"),
          kind: "attribute",
          field: "gearbox",
          label: "Pavarų dėžė",
          value: gearVal,
          fromAi: true,
          options: gear.options,
          baseField: "categoryAttributes",
        });
      }
    }

    // Mileage.
    const mil = fields.find((f) => f.key === "mileageMax");
    const mileage = text.match(/\b(\d{1,3}(?:[.\s]\d{3})*|\d+)\s*km\b/);
    if (mil && mileage) {
      const km = Number(mileage[1].replace(/[^\d]/g, ""));
      if (Number.isFinite(km) && km > 0) {
        chips.push({
          id: chipId("mileageMax", String(km), "attribute"),
          kind: "attribute",
          field: "mileageMax",
          label: "Rida iki",
          value: `${km} km`,
          fromAi: true,
          options: mil.options,
          baseField: "categoryAttributes",
        });
      }
    }
  }

  if (vertical === "real_estate") {
    const propType =
      /\bnam(?:as|a|u|ai|us)?\b/.test(text) && !/\bbuta/.test(text) ? "Namas"
        : /\bsklyp/.test(text) ? "Sklypas"
          : /\bbut/.test(text) ? "Butas"
            : /\bpatalp/.test(text) ? "Patalpos"
              : null;
    const roomsField = fields.find((f) => f.key === "rooms");
    const roomsMatch = /\b(\d)\s*kambari/.exec(text);
    const rooms = roomsMatch ? Number(roomsMatch[1]) : null;
    if (propType) {
      chips.push({
        id: chipId("propertyType", propType, "attribute"),
        kind: "attribute",
        field: "propertyType",
        label: "Objektas",
        value: propType,
        fromAi: true,
        options: fields.find((f) => f.key === "propertyType")?.options,
        baseField: "categoryAttributes",
      });
    }
    if (roomsField && rooms != null) {
      // Canonical value must equal the listing attribute format (plain digit,
      // per roomsField.options) so the AI chip actually filters the result set.
      chips.push({
        id: chipId("rooms", String(rooms), "attribute"),
        kind: "attribute",
        field: "rooms",
        label: "Kambariai",
        value: String(rooms),
        fromAi: true,
        options: roomsField.options,
        baseField: "categoryAttributes",
      });
    }
  }

  if (vertical === "jobs") {
    const locType =
      /\bnuotol(?:in|iu)/.test(text) ? "Nuotolinis"
        : /\bhibrid(?:inis|inio|ines?)\b/.test(text) ? "Hibridinis"
          : /\b(?:ofise|biure|savaitgaliais)\b/.test(text) ? "Ofise"
            : null;
    if (locType) {
      chips.push({
        id: chipId("locationType", locType, "attribute"),
        kind: "attribute",
        field: "locationType",
        label: "Darbo vieta",
        value: locType,
        fromAi: true,
        options: fields.find((f) => f.key === "locationType")?.options,
        baseField: "categoryAttributes",
      });
    }
  }

  return chips;
}
