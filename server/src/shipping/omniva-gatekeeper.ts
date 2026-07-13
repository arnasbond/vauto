export type OmnivaGatekeeperResult =
  | { oversized: false }
  | { oversized: true; reason: string };

const MAX = {
  a: 64,
  b: 38,
  c: 39,
  kg: 30,
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseDimensionsFromText(text: string): number[] | null {
  // Accept: 120x60x40, 120 x 60 x 40, 120×60×40, with optional "cm"
  const t = norm(text).replace(/[×]/g, "x");
  const m = t.match(
    /(\d{1,4}(?:[.,]\d{1,2})?)\s*x\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*x\s*(\d{1,4}(?:[.,]\d{1,2})?)(?:\s*cm)?/
  );
  if (!m) return null;
  const nums = [m[1], m[2], m[3]]
    .map((v) => Number(String(v).replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length === 3 ? nums : null;
}

function parseWeightKgFromText(text: string): number | null {
  const t = norm(text);
  const kg = t.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*kg\b/);
  if (kg) {
    const n = Number(kg[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const g = t.match(/(\d{1,6})\s*g\b/);
  if (g) {
    const n = Number(g[1]);
    if (Number.isFinite(n) && n > 0) return n / 1000;
  }
  return null;
}

function looksLikeOversizeItem(text: string): string | null {
  const t = norm(text);
  const keywords: Array<[RegExp, string]> = [
    [/\b(sofa|sofos|kampas|kampinė|lov(a|os)|čiužinys|čiužiniai)\b/i, "baldai"],
    [/\b(spinta|komoda|stalas|kėdės|kėdė|lentyna|vitrina)\b/i, "baldai"],
    [/\b(šaldytuvas|šaldiklis|skalb(yklė|imo mašina)|džiovyklė|orkaitė|viryklė)\b/i, "stambi buitinė technika"],
    [/\b(kapot(as|o)|bamper(is|io)|sparn(as|o)|durys|bagažinės dangtis)\b/i, "stambios auto dalys"],
    [/\b(riedlentė|paspirtukas)\b/i, "gali būti didesnis daiktas"],
  ];
  for (const [re, reason] of keywords) {
    if (re.test(t)) return reason;
  }
  return null;
}

export function evaluateOmnivaPastomatasGatekeeper(input: {
  title?: string;
  description?: string;
  category?: string;
  attributes?: Record<string, unknown>;
}): OmnivaGatekeeperResult {
  const text = [input.title, input.description]
    .filter(Boolean)
    .map(String)
    .join(" • ");

  const dims = parseDimensionsFromText(text);
  if (dims) {
    const [x, y, z] = dims.map((n) => Math.round(n * 100) / 100).sort((a, b) => b - a);
    if (x > MAX.a || y > MAX.b || z > MAX.c) {
      return {
        oversized: true,
        reason: `matmenys ${x}×${y}×${z} cm viršija paštomato ribas ${MAX.a}×${MAX.b}×${MAX.c} cm`,
      };
    }
  }

  const kg = parseWeightKgFromText(text);
  if (kg != null && kg > MAX.kg) {
    return {
      oversized: true,
      reason: `svoris ${Math.round(kg * 100) / 100} kg viršija ${MAX.kg} kg`,
    };
  }

  const keywordReason = looksLikeOversizeItem(text);
  if (keywordReason) {
    // Heuristic: only auto-disable for obvious bulky categories or mentions.
    return { oversized: true, reason: keywordReason };
  }

  return { oversized: false };
}

export const OMNIVA_OVERSIZE_BLOCK_MESSAGE =
  "Pastebėjau, kad šis daiktas pagal savo matmenis ar svorį netilps į standartinį Omniva paštomatą. Kad išvengtume klaidingų siuntų užsakymų ir logistikos atmetimo, siuntimo būdą paštomatu šiam skelbimui išjungsime — pirkėjams bus siūlomas tik atsiėmimas gyvai arba kurjeris.";

