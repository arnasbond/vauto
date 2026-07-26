/**
 * VAUTO Safety Shield — image moderation, profanity, prompt-injection / off-domain.
 * Deterministic gates before Gemini; vision also uses Gemini safetySettings.
 */

import { resolveGeminiApiKey } from "../load-env.js";
import { normalizeImageInputList } from "./image-input.js";

/** Rejected image — never persist / never fuse into draft. */
export const IMAGE_SAFETY_REJECT_NOTICE =
  "Nuotrauka neatitinka VAUTO saugumo taisyklių ir nebuvo įkelta.";

/** Toxic chat de-escalation (warm, no echo of the insult). */
export const TOXIC_DEESCALATION_REPLY =
  "Laikykimės etiketo! Aš esu čia, kad padėčiau suformuoti skelbimą. Tęskime nuo prekės/paslaugos aprašymo.";

/** Jailbreak / off-domain redirect (user-facing exact copy). */
export const SAFETY_DOMAIN_REJECT_REPLY =
  "Aš esu VAUTO asistentas ir padedu tik pirkimo, pardavimo bei paslaugų klausimais.";

export const RATE_LIMIT_BUSY_REPLY =
  "Per daug užklausų, pamėginkite šiek tiek vėliau";

/** Gemini REST safetySettings — block medium+ for sexual / violence / dangerous / hate. */
export const GEMINI_SAFETY_SETTINGS = [
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
] as const;

export class ImageSafetyBlockedError extends Error {
  readonly code = "image_safety_blocked" as const;
  constructor(message = IMAGE_SAFETY_REJECT_NOTICE) {
    super(message);
    this.name = "ImageSafetyBlockedError";
  }
}

export function isImageSafetyBlockedError(err: unknown): err is ImageSafetyBlockedError {
  return (
    err instanceof ImageSafetyBlockedError ||
    (err instanceof Error &&
      (err.name === "ImageSafetyBlockedError" ||
        /image_safety_blocked|SAFETY|safety.*block|blocked.*safety/i.test(
          err.message
        )))
  );
}

/** Strong LT/RU/EN profanity & toxic abuse (not mild teasing). */
const TOXIC_RE =
  /\b(blet|blyat|blyad|nahui|naxui|na\s*hui|pizd\w*|kurva|kurvos|šūdas|sudas|shudas|byb\w*|šik\w*|sikn\w*|fuck(?:ing|er)?|motherfuck\w*|shit(?:ty)?|asshole|cunt|dickhead|whore|slut|nigger|nigga|faggot|idiot(?:e|as)?|debil(?:as|e)?|dalbajob\w*|еб\w*|хуй|пизд\w*|сука|бля)\b/i;

/** Prompt injection / jailbreak attempts. */
const JAILBREAK_RE =
  /\b(ignore\s+(all\s+)?(previous\s+|prior\s+)?(rules|instructions|prompts?)|forget\s+(your\s+)?(rules|instructions)|system\s*prompt|jail\s*break|dan\s*mode|developer\s*mode|you\s+are\s+now\s+(a|an|my)|pretend\s+you\s+are|bypass\s+(your\s+)?(safety|rules|filters)|override\s+(your\s+)?(rules|instructions)|do\s+anything\s+now|ignore\s+rules)\b/i;

/** Clearly off-domain asks (not listing/search). */
const OFF_DOMAIN_RE =
  /\b(write\s+(me\s+)?(python|javascript|typescript|java|c\+\+|code|sql|html)|tell\s+(me\s+)?a\s+joke|what'?s\s+the\s+weather|weather\s+in|recipe\s+for|solve\s+this\s+math|homework|parašyk\s+kod[aą]|parasys?\s+kod|papasakok\s+juok|koks\s+oras|recept[aą]s?\s+kaip|politin\w*\s+nuomon)/i;

/** Marketplace context — off-domain detector should yield when present. */
const IN_DOMAIN_HINT_RE =
  /\b(parduod|parduot|ieškau|ieskau|skelb|nuotrauk|kaina|vilnius|kaunas|klaip|batai|auto|butas|iphone|paslaug|darb|publiku|juodrašt|juodrast|prepublish|ratus|volvo|bmw)\b/i;

export type TextSafetyGate =
  | { kind: "toxic" }
  | { kind: "injection" }
  | { kind: "off_domain" };

export function detectToxicLanguage(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  return TOXIC_RE.test(t);
}

export function detectPromptInjection(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  return JAILBREAK_RE.test(t);
}

export function detectOffDomainPrompt(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || t.length < 4) return false;
  if (IN_DOMAIN_HINT_RE.test(t)) return false;
  if (detectPromptInjection(t)) return false;
  return OFF_DOMAIN_RE.test(t);
}

/** First matching text safety gate for the agent chat turn. */
export function evaluateTextSafetyGate(text: string): TextSafetyGate | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  if (detectToxicLanguage(t)) return { kind: "toxic" };
  if (detectPromptInjection(t)) return { kind: "injection" };
  if (detectOffDomainPrompt(t)) return { kind: "off_domain" };
  return null;
}

export function replyForTextSafetyGate(gate: TextSafetyGate): string {
  if (gate.kind === "toxic") return TOXIC_DEESCALATION_REPLY;
  return SAFETY_DOMAIN_REJECT_REPLY;
}

/** Strip toxic tokens so they never land in listing title/description. */
export function scrubProfanity(text: string): string {
  const raw = String(text ?? "");
  if (!raw) return "";
  // Clone with /g — source regex is sticky for detect* calls.
  const scrubRe = new RegExp(TOXIC_RE.source, "gi");
  return raw
    .replace(scrubRe, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function geminiResponseLooksSafetyBlocked(data: {
  candidates?: { finishReason?: string }[];
  promptFeedback?: { blockReason?: string } | null;
}): boolean {
  const finish = String(data.candidates?.[0]?.finishReason ?? "").toUpperCase();
  if (finish === "SAFETY" || finish === "BLOCKLIST" || finish === "PROHIBITED_CONTENT") {
    return true;
  }
  const block = String(data.promptFeedback?.blockReason ?? "").toUpperCase();
  return Boolean(block && block !== "BLOCK_REASON_UNSPECIFIED");
}

/**
 * Fast image safety classification via Gemini.
 * Returns false when unsafe / blocked; true when safe or check unavailable.
 */
export async function classifyImagesSafe(
  imageDataUrls: string[]
): Promise<{ safe: boolean; reason?: string }> {
  const images = normalizeImageInputList(imageDataUrls).slice(0, 4);
  if (!images.length) return { safe: true };

  const key = resolveGeminiApiKey();
  if (!key) {
    // Fail-open when no key (local/dev) — production always has a key.
    return { safe: true };
  }

  const parts: object[] = [
    {
      text:
        "VAUTO marketplace image safety. Reply ONLY JSON: " +
        '{"safe":true|false,"reason":"none|nudity|sexual|violence|illegal|hate"}. ' +
        "Mark safe=false for nudity, sexual content, graphic violence, weapons/drugs promotion, or illegal activity. " +
        "Ordinary product photos (cars, clothes, phones, furniture, documents) are safe=true.",
    },
  ];

  for (const url of images) {
    const normalized = url.trim();
    const m = /^data:([^;]+);base64,(.+)$/i.exec(normalized);
    if (m) {
      parts.push({
        inline_data: { mime_type: m[1], data: m[2] },
      });
    } else if (/^https?:\/\//i.test(normalized)) {
      // Skip remote fetch here — chat path uses data URLs after client compress.
      continue;
    }
  }

  if (parts.length < 2) return { safe: true };

  try {
    const model =
      process.env.GEMINI_VISION_MODEL?.trim() || "gemini-2.0-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
          safetySettings: GEMINI_SAFETY_SETTINGS,
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );
    const raw = await res.text();
    let data: {
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string } | null;
    };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return { safe: true };
    }
    if (geminiResponseLooksSafetyBlocked(data)) {
      return { safe: false, reason: "gemini_safety_block" };
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = /\{[\s\S]*\}/.exec(text);
    if (!jsonMatch) return { safe: true };
    const parsed = JSON.parse(jsonMatch[0]) as { safe?: boolean; reason?: string };
    if (parsed.safe === false) {
      return { safe: false, reason: parsed.reason || "unsafe" };
    }
    return { safe: true };
  } catch (err) {
    console.warn(
      "[safety-shield] classifyImagesSafe failed open",
      err instanceof Error ? err.message : err
    );
    return { safe: true };
  }
}

/** Run image shield; throw ImageSafetyBlockedError when unsafe. */
export async function assertChatImagesSafe(imageDataUrls: string[]): Promise<void> {
  const result = await classifyImagesSafe(imageDataUrls);
  if (!result.safe) {
    console.warn("[safety-shield] image rejected", { reason: result.reason });
    throw new ImageSafetyBlockedError(IMAGE_SAFETY_REJECT_NOTICE);
  }
}
