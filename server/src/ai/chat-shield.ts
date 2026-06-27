import { unifiedLlmJson } from "./llm-provider.js";

export type ChatShieldReason =
  | "lowball_offer"
  | "aggressive_tone"
  | "reseller_template"
  | "none";

export interface ChatShieldInput {
  message: string;
  listingPrice: number;
  listingTitle: string;
  sellerName?: string;
}

export interface ChatShieldResult {
  shouldShield: boolean;
  reason: ChatShieldReason;
  offeredPrice?: number;
  autoReply: string;
  sellerNotification: string;
}

const RESELLER_PATTERNS = [
  /\b(perku\s+viską|perku\s+viska|superku|supirkimas|supirkėj|perpardavin|dealer|broker)\b/i,
  /\b(galiu\s+atvažiuoti\s+šiandien|galiu\s+atvaziuoti\s+siandien|cash\s+deal|grynais\s+čia\s+ir\s+dabar)\b/i,
  /\b(pasiimsiu\s+visus|export|eksportu)\b/i,
];

const AGGRESSIVE_PATTERNS = [
  /\b(kas\s+per\s+šitą\s+kainą|kas\s+per\s+sita\s+kaina|ridícul|neprotinga|per\s+daug\s+brangu)\b/i,
  /\b(jei\s+ne\s+parduosi|paskutinis\s+šansas|paskutinis\s+sansas)\b/i,
  /\b(!{3,}|idiot|kvail)\b/i,
];

function extractOfferedPrice(text: string): number | undefined {
  const normalized = text.replace(/\s/g, " ");
  const eurMatch = normalized.match(/(\d[\d\s.,]*)\s*(?:€|eur|euro)/i);
  if (eurMatch) {
    const n = Number(eurMatch[1]!.replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const bare = normalized.match(/\b(?:siūlau|siulau|duodu|moku)\s*(\d[\d\s.,]*)/i);
  if (bare) {
    const n = Number(bare[1]!.replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function buildAutoReply(sellerName: string, reason: ChatShieldReason): string {
  const name = sellerName.trim() || "pardavėjas";
  if (reason === "lowball_offer") {
    return `Ačiū už pasiūlymą! ${name} nurodė, kad kaina derinama tik minimaliai ir arti skelbime nurodytos vertės. Jei turite konkretesnį pasiūlymą — parašykite.`;
  }
  if (reason === "aggressive_tone") {
    return `Ačiū už susidomėjimą. ${name} prašo bendrauti mandagiai — galime aptarti sąlygas ramiai ir konkrečiai.`;
  }
  return `Ačiū už žinutę. ${name} šiuo metu svarsto tik rimtus pasiūlymus pagal skelbime nurodytą kainą ir sąlygas.`;
}

function buildSellerNotification(
  sellerName: string,
  reason: ChatShieldReason,
  offeredPrice?: number
): string {
  const first = sellerName.trim().split(/\s+/)[0] || "Drauge";
  if (reason === "lowball_offer" && offeredPrice != null) {
    return `${first}, AI Ghost Shield mandagiai atsakė už tave — gautas per žemas pasiūlymas (${offeredPrice} €).`;
  }
  if (reason === "aggressive_tone") {
    return `${first}, AI Ghost Shield suvaldė agresyvią žinutę pokalbyje ir atsakė už tave.`;
  }
  return `${first}, AI Ghost Shield filtravo įtartiną/perpardavinėtojo tipo žinutę ir atsakė už tave.`;
}

/** Ghost Caller Shield — taisyklės + optional Gemini patvirtinimas. */
export async function analyzeChatShield(
  input: ChatShieldInput
): Promise<ChatShieldResult> {
  const message = input.message.trim();
  const sellerName = input.sellerName?.trim() || "Pardavėjas";
  const none: ChatShieldResult = {
    shouldShield: false,
    reason: "none",
    autoReply: "",
    sellerNotification: "",
  };
  if (!message || message.length < 4) return none;

  const offeredPrice = extractOfferedPrice(message);
  let reason: ChatShieldReason = "none";

  if (
    input.listingPrice > 0 &&
    offeredPrice != null &&
    offeredPrice < input.listingPrice * 0.7
  ) {
    reason = "lowball_offer";
  } else if (RESELLER_PATTERNS.some((p) => p.test(message))) {
    reason = "reseller_template";
  } else if (AGGRESSIVE_PATTERNS.some((p) => p.test(message))) {
    reason = "aggressive_tone";
  }

  if (reason === "none") return none;

  return {
    shouldShield: true,
    reason,
    offeredPrice,
    autoReply: buildAutoReply(sellerName, reason),
    sellerNotification: buildSellerNotification(sellerName, reason, offeredPrice),
  };
}

/** Gemini patvirtinimas ribiniams atvejams (optional, jei reikia). */
export async function refineChatShieldReply(
  input: ChatShieldInput,
  draft: ChatShieldResult
): Promise<ChatShieldResult> {
  if (!draft.shouldShield) return draft;
  try {
    const raw = await unifiedLlmJson({
      systemInstruction:
        "Tu esi mandagus VAUTO sekretorius. Perrašyk autoReply lietuviškai — trumpai, profesionaliai, be emoji. Grąžink JSON: { \"autoReply\": \"string\" }",
      prompt: `Skelbimas: ${input.listingTitle}, kaina ${input.listingPrice} EUR.
Pirkėjo žinutė: """${input.message}"""
Draft atsakymas: ${draft.autoReply}`,
    });
    const autoReply = String(raw.autoReply ?? draft.autoReply).trim();
    return { ...draft, autoReply: autoReply || draft.autoReply };
  } catch {
    return draft;
  }
}
