/**
 * Deterministic LT/EN intent + entity heuristics (offline-safe).
 * Used as primary classifier; optional FAST LLM may refine only after Zod validation.
 */

import type { IntentEntities, VautoIntent } from "./intent-schema.js";
import type { DomainNormalizeResult } from "../foundation/domain-normalizer/index.js";

export type RuleClassification = {
  intent: VautoIntent;
  confidence: number;
  entities: IntentEntities;
  missing: string[];
  reasonCode: string;
  adversarial: boolean;
};

/** Unicode-aware token edges (JS \\b breaks on ąčęėįšųūž). */
const L = String.raw`(?<![\p{L}\p{N}_])`;
const R = String.raw`(?![\p{L}\p{N}_])`;

const ADVERSARIAL = new RegExp(
  `${L}(ignore\\s+(all\\s+)?(previous|prior|above)\\s+instructions?|system\\s*:|developer\\s*mode|jailbreak|DAN|override\\s+schema|forget\\s+(you(r)?|the)\\s+rules|reveal\\s+(system|hidden)\\s+prompt|pretend\\s+you\\s+are\\s+unrestricted|sudo\\s+mode|prompt\\s+injection)${R}`,
  "iu"
);

const SELL = new RegExp(
  `${L}(parduodu|pardavimui|parduoti|parduosiu|išparduoti|listinu|skelbimą\\s+kurti|kurti\\s+skelbimą|selling|for\\s+sale|want\\s+to\\s+sell)${R}`,
  "iu"
);
const BUY = new RegExp(
  `${L}(perku|pirksiu|noriu\\s+pirkti|ieškau\\s+pirkti|buy(ing)?|want\\s+to\\s+buy|looking\\s+to\\s+buy)${R}`,
  "iu"
);
const SEARCH = new RegExp(
  `${L}(ieškau|rask|surask|paieška|rodyk|show\\s+me|find|search|looking\\s+for|kur\\s+rasti)${R}`,
  "iu"
);
const VALUE = new RegExp(
  `${L}(kiek\\s+vertas|kokia\\s+kaina|įvertink|ivertink|įvertinimas|ivertinimas|vertinimas|market\\s+value|appraisal|kainą\\s+pasakyk|worth)${R}`,
  "iu"
);
const COMPARE = new RegExp(
  `${L}(palygink|palyginimas|vs\\.?|versus|kuris\\s+geresnis|compare|comparison)${R}`,
  "iu"
);
const WATCH = new RegExp(
  `${L}(steb[eė]k|pranešk|watchlist|sek(?:ti)?\\s+kain\\p{L}*|notify\\s+me|alert|informuok\\s+kai)${R}`,
  "iu"
);
const HELP = new RegExp(
  `${L}(pad[eė]k|kaip\\s+veikia|help|pagalba|instrukcija|ką\\s+gali|how\\s+does|support)${R}`,
  "iu"
);

const MAKES: Array<[RegExp, string]> = [
  [new RegExp(`${L}(bmw|bemv[eė]|bimeris)${R}`, "iu"), "BMW"],
  [new RegExp(`${L}(audi|aud[eė])${R}`, "iu"), "Audi"],
  [new RegExp(`${L}(vw|volkswagen|folk[eė])${R}`, "iu"), "Volkswagen"],
  [new RegExp(`${L}(mercedes|mersas|benz)${R}`, "iu"), "Mercedes-Benz"],
  [new RegExp(`${L}(toyota|tojota)${R}`, "iu"), "Toyota"],
  [new RegExp(`${L}(volvo|volwo)${R}`, "iu"), "Volvo"],
  [new RegExp(`${L}(opel)${R}`, "iu"), "Opel"],
  [new RegExp(`${L}(ford)${R}`, "iu"), "Ford"],
  [new RegExp(`${L}(tesla)${R}`, "iu"), "Tesla"],
];

const PHONES = new RegExp(
  `${L}(iphone|samsung|xiaomi|pixel|telefonas|smartphone|galaxy)${R}`,
  "iu"
);

function extractPriceBounds(text: string): Pick<IntentEntities, "priceMin" | "priceMax"> {
  const out: Pick<IntentEntities, "priceMin" | "priceMax"> = {};
  const between = /(?:nuo\s+)?(\d{2,7})\s*(?:€|eur|eu)?\s*(?:-|–|iki)\s*(\d{2,7})\s*(?:€|eur)?/iu.exec(
    text
  );
  if (between) {
    out.priceMin = Number(between[1]);
    out.priceMax = Number(between[2]);
    return out;
  }
  const max = /(?:iki|max|under|<)\s*(\d{2,7})\s*(?:€|eur)?/iu.exec(text);
  if (max) out.priceMax = Number(max[1]);
  const min = /(?:nuo|from|>)\s*(\d{2,7})\s*(?:€|eur)?/iu.exec(text);
  if (min) out.priceMin = Number(min[1]);
  const single = /(\d{3,7})\s*(?:€|eur)\b/iu.exec(text);
  if (single && out.priceMin == null && out.priceMax == null) {
    out.priceMax = Number(single[1]);
  }
  return out;
}

function extractYears(text: string): Pick<IntentEntities, "yearMin" | "yearMax"> {
  const out: Pick<IntentEntities, "yearMin" | "yearMax"> = {};
  const range = /\b(19\d{2}|20[0-2]\d)\s*(?:-|–|iki)\s*(19\d{2}|20[0-2]\d)\b/.exec(text);
  if (range) {
    out.yearMin = Number(range[1]);
    out.yearMax = Number(range[2]);
    return out;
  }
  const from = /\bnuo\s+(19\d{2}|20[0-2]\d)\b/iu.exec(text);
  if (from) out.yearMin = Number(from[1]);
  const withM = /\b(19\d{2}|20[0-2]\d)\s*m\.?\b/iu.exec(text);
  if (withM) {
    out.yearMin = Number(withM[1]);
    out.yearMax = Number(withM[1]);
    return out;
  }
  // Bare year token — skip when it is a price context (iki/nuo/under/€/eur)
  const bare = /(?:^|[^\d])(19\d{2}|20[0-2]\d)(?:$|[^\d])/.exec(text);
  if (bare) {
    const idx = bare.index + (bare[0]!.startsWith(bare[1]!) ? 0 : 1);
    const around = text.slice(Math.max(0, idx - 12), idx + 8).toLowerCase();
    if (!/(iki|nuo|under|max|eur|€|kaina|price)/i.test(around)) {
      out.yearMin = Number(bare[1]);
      out.yearMax = Number(bare[1]);
    }
  }
  return out;
}

function extractMakeModel(text: string): IntentEntities {
  const entities: IntentEntities = {};
  for (const [re, make] of MAKES) {
    if (re.test(text)) {
      entities.make = make;
      entities.category = "vehicles";
      break;
    }
  }
  const model =
    /\b(?:golf|passat|a4|a6|e46|e90|c-?class|focus|corolla|octavia|model\s*3|v70|x5)\b/iu.exec(
      text
    );
  if (model) entities.model = model[0]!.replace(/\s+/g, " ");

  if (PHONES.test(text)) {
    entities.category = "electronics";
    const brand = new RegExp(`${L}(iphone|samsung|xiaomi|pixel|apple)${R}`, "iu").exec(text);
    if (brand) entities.brand = brand[1];
    entities.query = text.slice(0, 120);
  }

  if (!entities.query && text.trim()) {
    entities.query = text.trim().slice(0, 120);
  }
  return entities;
}

function applyDomainAttrs(
  entities: IntentEntities,
  domain: DomainNormalizeResult
): IntentEntities {
  const next = { ...entities };
  const commerce: Array<"vat_invoice"> = [...(next.commerceFlags ?? [])];
  for (const a of domain.attributes) {
    if (a.kind === "transmission") next.transmission = a.value;
    if (a.kind === "fuel") next.fuel = a.value;
    if (a.kind === "drivetrain") {
      next.drivetrain = a.value;
      next.drivetrainContext = a.context ?? null;
      if (!next.make && a.context === "Audi") next.make = "Audi";
      if (!next.make && a.context === "BMW") next.make = "BMW";
      next.category = next.category ?? "vehicles";
    }
    if (a.kind === "location") next.location = a.value;
    if (a.kind === "commerce" && a.value === "vat_invoice") {
      commerce.push("vat_invoice");
    }
  }
  if (commerce.length) next.commerceFlags = [...new Set(commerce)];
  return next;
}

function scoreIntent(text: string): { intent: VautoIntent; confidence: number; reasonCode: string } {
  if (ADVERSARIAL.test(text)) {
    return { intent: "UNKNOWN", confidence: 0.2, reasonCode: "adversarial_prompt" };
  }

  // F12 — bare field-vocabulary answers (condition synonyms) are NEVER a
  // search intent: they answer the assistant's pending missing-field
  // question. Deterministic, so a stray "Naudota" cannot hijack the sell
  // flow into a zero-result global search.
  const trimmed = text.trim();
  if (
    trimmed.length <= 80 &&
    /^(nauj\w*|naudot\w*|beveik\s+nauj\w*|kaip\s+nauj\w*|used|new|like\s+new)$/i.test(trimmed)
  ) {
    return { intent: "UNKNOWN", confidence: 0.3, reasonCode: "field_answer" };
  }

  const hits: Array<{ intent: VautoIntent; w: number; code: string }> = [];
  if (SELL.test(text)) hits.push({ intent: "SELL", w: 0.92, code: "rule_sell" });
  if (BUY.test(text)) hits.push({ intent: "BUY", w: 0.9, code: "rule_buy" });
  if (COMPARE.test(text)) hits.push({ intent: "COMPARE", w: 0.91, code: "rule_compare" });
  if (VALUE.test(text)) hits.push({ intent: "VALUE", w: 0.93, code: "rule_value" });
  if (WATCH.test(text)) hits.push({ intent: "WATCH", w: 0.88, code: "rule_watch" });
  if (HELP.test(text)) hits.push({ intent: "HELP", w: 0.9, code: "rule_help" });
  if (SEARCH.test(text)) hits.push({ intent: "SEARCH", w: 0.88, code: "rule_search" });

  if (
    hits.length === 0 &&
    (new RegExp(`${L}(bmw|audi|vw|iphone|samsung|butas|automobilis|mašina|masina)${R}`, "iu").test(
      text
    ) ||
      /\b\d{4}\b/.test(text))
  ) {
    hits.push({ intent: "SEARCH", w: 0.72, code: "rule_implicit_search" });
  }

  if (hits.length === 0) {
    return { intent: "UNKNOWN", confidence: 0.35, reasonCode: "no_signal" };
  }

  hits.sort((a, b) => b.w - a.w);
  const top = hits[0]!;
  const second = hits[1];
  if (second && Math.abs(top.w - second.w) < 0.05) {
    return { intent: "UNKNOWN", confidence: 0.55, reasonCode: "ambiguous_intent" };
  }
  return { intent: top.intent, confidence: top.w, reasonCode: top.code };
}

function requiredMissing(intent: VautoIntent, entities: IntentEntities): string[] {
  const missing: string[] = [];
  if (intent === "SELL" || intent === "VALUE") {
    if (!entities.query && !entities.make && !entities.brand) missing.push("item");
  }
  if (intent === "SEARCH" || intent === "BUY") {
    if (!entities.query && !entities.make && !entities.brand && !entities.category) {
      missing.push("query");
    }
  }
  if (intent === "COMPARE") {
    if (!entities.query) missing.push("compare_targets");
  }
  if (intent === "WATCH") {
    if (!entities.query && !entities.make) missing.push("watch_target");
  }
  return missing;
}

export function classifyIntentRules(
  normalizedText: string,
  domain: DomainNormalizeResult
): RuleClassification {
  const text = normalizedText.trim();
  const scored = scoreIntent(text);
  let entities = extractMakeModel(text);
  entities = { ...entities, ...extractPriceBounds(text), ...extractYears(text) };
  entities = applyDomainAttrs(entities, domain);

  const adversarial = scored.reasonCode === "adversarial_prompt";
  const missing = requiredMissing(scored.intent, entities);

  let confidence = scored.confidence;
  if (adversarial) confidence = Math.min(confidence, 0.25);
  if (scored.intent === "UNKNOWN" && scored.reasonCode === "ambiguous_intent") {
    confidence = Math.min(confidence, 0.58);
  }

  return {
    intent: scored.intent,
    confidence,
    entities,
    missing,
    reasonCode: scored.reasonCode,
    adversarial,
  };
}
