/**
 * Vision multi-object labels must stay Lithuanian in chat + chips.
 * Keep in sync with shared/vision-object-labels.ts
 */

const CHIP_PREFIX_RE = /^(parduoti|ieškoti|ieskoti)\s+/i;

/** Known Gemini EN regressions → LT nouns (lowercase keys). */
const EN_TO_LT_OBJECT_LABEL: Record<string, string> = {
  "house under construction": "statomas namas",
  "roof frame": "stogo karkasas",
  "roof framing": "stogo karkasas",
  "wooden frame": "medinis karkasas",
  "construction site": "statybų aikštelė",
  scaffolding: "pastoliai",
  "building materials": "statybinės medžiagos",
  "building under construction": "statomas pastatas",
  "unfinished house": "nebaigtas namas",
  "car frame": "automobilio kėbulas",
  "engine block": "variklio blokas",
  "washing machine": "skalbyklė",
  refrigerator: "šaldytuvas",
  fridge: "šaldytuvas",
  sofa: "sofa",
  couch: "sofa",
  television: "televizorius",
  tv: "televizorius",
  bicycle: "dviratis",
  bike: "dviratis",
  smartphone: "išmanusis telefonas",
  "mobile phone": "telefonas",
  laptop: "nešiojamas kompiuteris",
  "dining table": "valgomojo stalas",
  wardrobe: "spinta",
  "kitchen cabinet": "virtuvės spintelė",
  "garden tools": "sodo įrankiai",
  "power tool": "elektrinis įrankis",
  "car tire": "padanga",
  "alloy wheel": "ratlankis",
  "rim wheel": "ratlankis",
};

function stripChipPrefix(label: string): { prefix: string; noun: string } {
  const trimmed = label.trim();
  const match = trimmed.match(CHIP_PREFIX_RE);
  if (!match) return { prefix: "", noun: trimmed };
  return {
    prefix: match[0],
    noun: trimmed.slice(match[0].length).trim(),
  };
}

function lookupLtNoun(noun: string): string | null {
  const key = noun.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  if (EN_TO_LT_OBJECT_LABEL[key]) return EN_TO_LT_OBJECT_LABEL[key];
  const bare = key.replace(/^(a|an|the)\s+/i, "");
  return EN_TO_LT_OBJECT_LABEL[bare] ?? null;
}

/** True when label looks like Latin/English marketplace jargon (no LT diacritics). */
export function looksLikeEnglishVisionLabel(label: string): boolean {
  const { noun } = stripChipPrefix(label);
  if (!noun || noun.length < 3) return false;
  if (/[ąčęėįšųūž]/i.test(noun)) return false;
  if (
    /\b(automobilis|telefonas|televizorius|sofa|stalas|spinta|dviratis|padanga|ratlankis|namas|butas|skalbykle|saldytuvas)\b/i.test(
      noun
    )
  ) {
    return false;
  }
  return /^[a-z0-9][a-z0-9\s\-/'&.]+$/i.test(noun) && /\s/.test(noun);
}

/**
 * Normalize a Vision object label / chip noun to Lithuanian when possible.
 * Preserves „Parduoti “ / „Ieškoti “ prefixes.
 */
export function localizeVisionObjectLabel(raw: string): string {
  const trimmed = String(raw ?? "")
    .trim()
    .replace(/^[\[\]«»"']+|[\[\]«»"']+$/g, "");
  if (!trimmed) return "";

  const { prefix, noun } = stripChipPrefix(trimmed);
  const mapped = lookupLtNoun(noun);
  if (mapped) {
    return `${prefix}${mapped}`;
  }

  if (!looksLikeEnglishVisionLabel(noun)) {
    return trimmed;
  }

  let next = noun;
  for (const [en, lt] of Object.entries(EN_TO_LT_OBJECT_LABEL)) {
    if (next.toLowerCase().includes(en)) {
      next = next.replace(new RegExp(en, "ig"), lt);
    }
  }
  return `${prefix}${next}`;
}

export function localizeVisionObjectLabels(labels: string[]): string[] {
  return labels.map(localizeVisionObjectLabel).filter(Boolean);
}
