/**
 * Extract sell hints from explicit user TEXT (not OCR).
 */

import { normalizeLithuanianDomainText } from "../foundation/domain-normalizer/index.js";
import type { FieldCandidate } from "./field-merge.js";
import { detectPromptInjection } from "../../shared/prompt-injection.js";

export type TextExtractBundle = {
  candidates: {
    category?: FieldCandidate<string>;
    title?: FieldCandidate<string>;
    brand?: FieldCandidate<string>;
    model?: FieldCandidate<string>;
    year?: FieldCandidate<number>;
    condition?: FieldCandidate<string>;
    color?: FieldCandidate<string>;
    price?: FieldCandidate<number>;
    description?: FieldCandidate<string>;
    attributes: Record<string, FieldCandidate<unknown>>;
  };
  warnings: string[];
  injectionAttempt: boolean;
};

const COLORS =
  /\b(juoda|juodas|balta|baltas|pilka|pilkas|mėlyna|melyna|raudona|žalia|zalia|sidabrin\w+|black|white|grey|gray|blue|red|green|silver)\b/iu;

export function extractFromUserText(
  text: string,
  source: "TEXT" | "VOICE" = "TEXT"
): TextExtractBundle {
  const warnings: string[] = [];
  const attributes: Record<string, FieldCandidate<unknown>> = {};
  const raw = String(text ?? "").trim();
  const injectionAttempt = detectPromptInjection(raw);
  if (injectionAttempt) {
    warnings.push(
      "Aptiktas galimas prompt injection tekste — interpretuojama tik kaip turinys, ne komanda."
    );
  }

  const domain = normalizeLithuanianDomainText(raw);
  const candidates: TextExtractBundle["candidates"] = { attributes };

  for (const a of domain.attributes) {
    if (a.kind === "transmission") {
      attributes.transmission = {
        value: a.value,
        confidence: 0.92,
        source,
        evidence: [a.originalText],
      };
    }
    if (a.kind === "fuel") {
      attributes.fuel = {
        value: a.value,
        confidence: 0.92,
        source,
        evidence: [a.originalText],
      };
    }
    if (a.kind === "drivetrain") {
      attributes.drivetrain = {
        value: a.value,
        confidence: 0.9,
        source,
        evidence: [a.originalText],
      };
      if (a.context && !candidates.brand) {
        candidates.brand = {
          value: a.context,
          confidence: 0.88,
          source,
          evidence: [a.originalText],
        };
      }
    }
    if (a.kind === "commerce") {
      attributes.vatInvoice = {
        value: true,
        confidence: 0.95,
        source,
        evidence: [a.originalText],
      };
      // Explicit: not an automotive technical attribute
      warnings.push("PVM sąskaita — mokesčių/verslo atributas, ne auto techninis parametras.");
    }
    if (a.kind === "location") {
      attributes.location = {
        value: a.value,
        confidence: 0.9,
        source,
        evidence: [a.originalText],
      };
    }
  }

  const makes: Array<[RegExp, string]> = [
    [/\b(bmw|bemv)/i, "BMW"],
    [/\baudi\b/i, "Audi"],
    [/\b(vw|volkswagen|folk)/i, "Volkswagen"],
    [/\b(iphone|apple)\b/i, "Apple"],
    [/\bsamsung\b/i, "Samsung"],
    [/\btesla\b/i, "Tesla"],
    [/\bopel\b/i, "Opel"],
    [/\bford\b/i, "Ford"],
  ];
  for (const [re, brand] of makes) {
    if (re.test(raw)) {
      candidates.brand = {
        value: brand,
        confidence: 0.9,
        source,
        evidence: [re.exec(raw)?.[0] ?? brand],
      };
      break;
    }
  }

  const model =
    /\b(x5|e46|e90|a4|a6|golf|passat|focus|astra|model\s*3|iphone\s*15(?:\s*pro)?|galaxy\s*s\d+)\b/iu.exec(
      raw
    );
  if (model) {
    candidates.model = {
      value: model[0]!.replace(/\s+/g, " "),
      confidence: 0.88,
      source,
      evidence: [model[0]!],
    };
  }

  const year = /\b(19\d{2}|20[0-2]\d)\s*m\.?\b/i.exec(raw) || /\b(19\d{2}|20[0-2]\d)\b/.exec(raw);
  if (year) {
    const y = Number(year[1]);
    // Fact-guard: year from text is allowed as USER hint but needs confirm if bare
    candidates.year = {
      value: y,
      confidence: /\bm\.?\b/i.test(year[0]) ? 0.9 : 0.75,
      source,
      evidence: [year[0]],
    };
  }

  const price =
    /(?:kaina|price|u[zž])\s*:?\s*(\d{2,7})\s*(?:€|eur)?/i.exec(raw) ||
    /(\d{2,7})\s*(?:€|eur)\b/i.exec(raw);
  if (price) {
    candidates.price = {
      value: Number(price[1]),
      confidence: 0.95,
      source: "USER_PROVIDED",
      evidence: [price[0]],
    };
  }

  const color = COLORS.exec(raw);
  if (color) {
    candidates.color = {
      value: color[1],
      confidence: 0.85,
      source,
      evidence: [color[0]],
    };
  }

  if (/\b(nauja|naujas|new)\b/i.test(raw)) {
    candidates.condition = { value: "new", confidence: 0.85, source, evidence: ["new"] };
  } else if (/\b(naudot|used)\b/i.test(raw)) {
    candidates.condition = { value: "used", confidence: 0.85, source, evidence: ["used"] };
  }

  if (/\b(iphone|samsung|telefon|phone)\b/i.test(raw)) {
    candidates.category = {
      value: "electronics",
      confidence: 0.9,
      source,
      evidence: ["electronics_cue"],
    };
  // F1.3 — category neutrality: vehicles only from explicit brand cues.
  // Word-substring matches ("auto", "mašin", "masin") used to force vehicles
  // onto unrelated items (e.g. "siuvimo mašina") — removed.
  } else if (/\b(bmw|audi|volkswagen|vw|toyota|mercedes|volvo|opel|ford|renault|skoda|peugeot|citro[eë]?n|quattro|xdrive)\b/i.test(raw)) {
    candidates.category = {
      value: "vehicles",
      confidence: 0.9,
      source,
      evidence: ["vehicles_cue"],
    };
  } else if (raw) {
    candidates.category = {
      value: "other",
      confidence: 0.7,
      source,
      evidence: ["generic"],
    };
  }

  if (candidates.brand || candidates.model) {
    const titleParts = [candidates.brand?.value, candidates.model?.value]
      .filter(Boolean)
      .join(" ");
    candidates.title = {
      value: titleParts || raw.slice(0, 80),
      confidence: 0.85,
      source,
      evidence: ["composed_title"],
    };
  } else if (raw) {
    candidates.title = {
      value: raw.slice(0, 80),
      confidence: 0.7,
      source,
      evidence: ["raw_title"],
    };
  }

  candidates.description = {
    value: raw.slice(0, 500) || null,
    confidence: raw ? 0.8 : 0,
    source,
  };

  // Critical attrs — only if explicit patterns (VIN etc.) with evidence
  const vin = /\bVIN[:\s-]*([A-HJ-NPR-Z0-9]{17})\b/i.exec(raw);
  if (vin) {
    attributes.vin = {
      value: vin[1]!.toUpperCase(),
      confidence: 0.95,
      source,
      evidence: [vin[0]],
    };
  }

  const mileage = /\b(\d{1,3}(?:[\s ]?\d{3})+)\s*km\b/i.exec(raw);
  if (mileage) {
    attributes.mileage = {
      value: Number(mileage[1]!.replace(/\s/g, "")),
      confidence: 0.9,
      source,
      evidence: [mileage[0]],
    };
  }

  const storage = /\b(\d{2,4})\s*GB\b/i.exec(raw);
  if (storage) {
    attributes.storageGb = {
      value: Number(storage[1]),
      confidence: 0.9,
      source,
      evidence: [storage[0]],
    };
  }

  return { candidates, warnings, injectionAttempt };
}
