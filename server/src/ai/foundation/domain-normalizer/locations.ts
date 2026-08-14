import type { DomainNormalizeResult, NormalizedAttribute } from "./types.js";

/** Unicode-aware edges */
const L = String.raw`(?<![\p{L}\p{N}_])`;
const R = String.raw`(?![\p{L}\p{N}_])`;

/** Lightweight LT/EN place cues for foundation layer. */
const PLACE_ALIASES: Array<{ pattern: RegExp; value: string }> = [
  {
    pattern: new RegExp(`${L}vilni(?:us|uje|aus)?${R}`, "iu"),
    value: "Vilnius",
  },
  {
    pattern: new RegExp(`${L}kaun(?:as|e|o)?${R}`, "iu"),
    value: "Kaunas",
  },
  {
    pattern: new RegExp(`${L}klaip[eė]d(?:a|oje|os)?${R}`, "iu"),
    value: "Klaipėda",
  },
  {
    pattern: new RegExp(`${L}[šs]iauli(?:ai|uose|u|ų)?${R}`, "iu"),
    value: "Šiauliai",
  },
  {
    pattern: new RegExp(`${L}panev[eė][zž](?:ys|yje|io)?${R}`, "iu"),
    value: "Panevėžys",
  },
];

export function normalizeLocationText(text: string): DomainNormalizeResult {
  const originalText = String(text ?? "");
  const attributes: NormalizedAttribute[] = [];

  for (const rule of PLACE_ALIASES) {
    const m = rule.pattern.exec(originalText);
    if (!m) continue;
    attributes.push({
      kind: "location",
      value: rule.value,
      originalText: m[0]!,
    });
  }

  return {
    originalText,
    attributes,
    unresolved: [],
  };
}
