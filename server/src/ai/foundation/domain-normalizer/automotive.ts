import type { DomainNormalizeResult, NormalizedAttribute } from "./types.js";

type AutoRule = {
  pattern: RegExp;
  attr: Exclude<NormalizedAttribute, { kind: "unknown" | "commerce" | "location" }>;
};

/** Unicode-aware edges — JS \\b is ASCII-only and breaks on ąčęėįšųūž. */
const L = String.raw`(?<![\p{L}\p{N}_])`;
const R = String.raw`(?![\p{L}\p{N}_])`;

const RULES: AutoRule[] = [
  {
    pattern: new RegExp(`${L}automatas${R}`, "iu"),
    attr: { kind: "transmission", value: "automatic", originalText: "automatas" },
  },
  {
    pattern: new RegExp(`${L}automatin[eė]${R}`, "iu"),
    attr: { kind: "transmission", value: "automatic", originalText: "automatinė" },
  },
  {
    pattern: new RegExp(`${L}mechanas${R}`, "iu"),
    attr: { kind: "transmission", value: "manual", originalText: "mechanas" },
  },
  {
    pattern: new RegExp(`${L}mechanin[eė]${R}`, "iu"),
    attr: { kind: "transmission", value: "manual", originalText: "mechaninė" },
  },
  {
    pattern: new RegExp(`${L}dyzelis${R}`, "iu"),
    attr: { kind: "fuel", value: "diesel", originalText: "dyzelis" },
  },
  {
    pattern: new RegExp(`${L}dyzelinas${R}`, "iu"),
    attr: { kind: "fuel", value: "diesel", originalText: "dyzelinas" },
  },
  {
    pattern: new RegExp(`${L}benzas${R}`, "iu"),
    attr: { kind: "fuel", value: "petrol", originalText: "benzas" },
  },
  {
    pattern: new RegExp(`${L}benzinas${R}`, "iu"),
    attr: { kind: "fuel", value: "petrol", originalText: "benzinas" },
  },
  {
    pattern: new RegExp(`${L}elektra${R}`, "iu"),
    attr: { kind: "fuel", value: "electric", originalText: "elektra" },
  },
  {
    pattern: new RegExp(`${L}elektrinis${R}`, "iu"),
    attr: { kind: "fuel", value: "electric", originalText: "elektrinis" },
  },
  {
    pattern: new RegExp(`${L}quattro${R}`, "iu"),
    attr: {
      kind: "drivetrain",
      value: "AWD",
      originalText: "quattro",
      context: "Audi",
    },
  },
  {
    pattern: new RegExp(`${L}xdrive${R}`, "iu"),
    attr: {
      kind: "drivetrain",
      value: "AWD",
      originalText: "xDrive",
      context: "BMW",
    },
  },
  {
    pattern: new RegExp(`${L}(?:automatic|auto\\s*transmission)${R}`, "iu"),
    attr: { kind: "transmission", value: "automatic", originalText: "automatic" },
  },
  {
    pattern: new RegExp(`${L}(?:manual(?:\\s*transmission)?)${R}`, "iu"),
    attr: { kind: "transmission", value: "manual", originalText: "manual" },
  },
  {
    pattern: new RegExp(`${L}diesel${R}`, "iu"),
    attr: { kind: "fuel", value: "diesel", originalText: "diesel" },
  },
  {
    pattern: new RegExp(`${L}(?:petrol|gasoline)${R}`, "iu"),
    attr: { kind: "fuel", value: "petrol", originalText: "petrol" },
  },
  {
    pattern: new RegExp(`${L}electric${R}`, "iu"),
    attr: { kind: "fuel", value: "electric", originalText: "electric" },
  },
];

/**
 * Map LT automotive slang → structured attributes.
 * Preserves originalText; does not invent values for unclear terms.
 */
export function normalizeAutomotiveText(text: string): DomainNormalizeResult {
  const originalText = String(text ?? "");
  const attributes: NormalizedAttribute[] = [];

  for (const rule of RULES) {
    const m = rule.pattern.exec(originalText);
    if (!m) continue;
    const matched = m[0]!;
    attributes.push({
      ...rule.attr,
      originalText: matched,
    });
  }

  return {
    originalText,
    attributes,
    unresolved: [],
  };
}
