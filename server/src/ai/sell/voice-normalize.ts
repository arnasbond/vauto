/**
 * Lithuanian voice / slang normalization for sell drafts (10C).
 * Preserves originalTranscript separately in the engine — this returns working text + structured hints.
 */

export type VoiceNormalizeResult = {
  normalizedText: string;
  hints: {
    brand?: string;
    model?: string;
    fuel?: string;
    transmission?: string;
    drivetrain?: string;
    engineLiters?: number;
    storageGb?: number;
    commerce?: string;
    chipTuned?: boolean;
  };
};

const DIGIT_WORDS: Record<string, string> = {
  nulis: "0",
  vienas: "1",
  viena: "1",
  du: "2",
  dvi: "2",
  trys: "3",
  keturi: "4",
  keturios: "4",
  penki: "5",
  penkios: "5",
  šeši: "6",
  sesi: "6",
  šešios: "6",
  septyni: "7",
  aštuoni: "8",
  astuoni: "8",
  devyni: "9",
  dešimt: "10",
  desimt: "10",
  penkiolika: "15",
  šešiolika: "16",
  sesiolika: "16",
};

/** Map spoken digit sequences like "du penki šeši" → 256 */
export function spokenDigitsToNumber(text: string): number | null {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  const digits: string[] = [];
  for (const t of tokens) {
    if (/^\d+$/.test(t)) {
      digits.push(t);
      continue;
    }
    const w = DIGIT_WORDS[t];
    if (w) digits.push(w);
  }
  if (!digits.length) return null;
  const joined = digits.join("");
  const n = Number(joined);
  return Number.isFinite(n) ? n : null;
}

export function normalizeSellVoiceText(raw: string): VoiceNormalizeResult {
  let t = String(raw ?? "").trim();
  const hints: VoiceNormalizeResult["hints"] = {};

  // Brand slang
  t = t.replace(/\bbemwas\b|\bbemv[eė]\b|\bbimeris\b|\bbmw\b/gi, (m) => {
    hints.brand = "BMW";
    return "BMW";
  });
  t = t.replace(/\baudi\b|\baud[eė]\b/gi, () => {
    hints.brand = hints.brand ?? "Audi";
    return "Audi";
  });
  t = t.replace(/\bfolk[eė]\b|\bvw\b|\bvolkswagen\b/gi, () => {
    hints.brand = hints.brand ?? "Volkswagen";
    return "Volkswagen";
  });

  // Models
  if (/\bx\s*5\b|\bx5\b/i.test(t)) {
    hints.model = "X5";
    t = t.replace(/\bx\s*5\b/gi, "X5");
  }
  if (/\ba\s*6\b|\ba6\b|a\s*šeši|a sesi/i.test(t)) {
    hints.model = hints.model ?? "A6";
    t = t.replace(/a\s*šeši|a\s*sesi|\ba\s*6\b/gi, "A6");
  }

  // Engine liters: "trys litrai" / "a šeši trys litrai"
  const lit = /(?:^|\s)(vienas|du|trys|keturi|penki|šeši|sesi|\d(?:[.,]\d)?)\s*litr/i.exec(t);
  if (lit) {
    const map: Record<string, number> = {
      vienas: 1,
      du: 2,
      trys: 3,
      keturi: 4,
      penki: 5,
      šeši: 6,
      sesi: 6,
    };
    const key = lit[1]!.toLowerCase();
    hints.engineLiters = map[key] ?? Number(String(lit[1]).replace(",", "."));
  }

  if (/\bdyzelis\b|\bdiesel\b/i.test(t)) hints.fuel = "diesel";
  if (/\bbenzas\b|\bpetrol\b/i.test(t)) hints.fuel = "petrol";
  if (/\belektra\b|\belectric\b/i.test(t)) hints.fuel = "electric";
  if (/\bautomatas\b|\bautomatic\b/i.test(t)) hints.transmission = "automatic";
  if (/\bmechanas\b|\bmechanin/i.test(t)) hints.transmission = "manual";
  if (/\bquattro\b/i.test(t)) {
    hints.drivetrain = "AWD";
    hints.brand = hints.brand ?? "Audi";
  }
  if (/\bxdrive\b/i.test(t)) {
    hints.drivetrain = "AWD";
    hints.brand = hints.brand ?? "BMW";
  }
  if (/\bčipuotas\b|\bcipuotas\b|\bchiptuned\b/i.test(t)) {
    hints.chipTuned = true;
  }
  if (/\bpvm\s*s[ąa]skait/i.test(t)) {
    hints.commerce = "vat_invoice";
  }

  // iPhone spoken: "iphone penkiolika pro du penki šeši" → 15 Pro 256GB
  if (/\biphone\b/i.test(t)) {
    hints.brand = "Apple";
    if (/\bpenkiolika\b|\b15\b/i.test(t)) hints.model = "iPhone 15";
    if (/\bpro\b/i.test(t) && hints.model) hints.model = `${hints.model} Pro`;
    const storageChunk =
      /(?:pro\s+)?((?:du|dvi|trys|keturi|penki|šeši|sesi|\d+)(?:\s+(?:du|dvi|trys|keturi|penki|šeši|sesi|\d+)){1,3})/i.exec(
        t
      );
    if (storageChunk) {
      const n = spokenDigitsToNumber(storageChunk[1]!);
      if (n != null && n >= 32 && n <= 2048) hints.storageGb = n;
    }
  }

  return { normalizedText: t.replace(/\s+/g, " ").trim(), hints };
}
