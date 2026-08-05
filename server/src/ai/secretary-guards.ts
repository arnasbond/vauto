import type { AgentMessage } from "./vauto-agent.js";
import { detectServerSellIntent } from "./sell-intent-fallback.js";
import {
  SECRETARY_MIN_QUERY_CHARS,
  TEXT_SECRETARY_NOISE_REPLIES,
  VOICE_SECRETARY_NOISE_REPLIES,
  SECRETARY_SESSION_TTL_MS,
  hasMeaningfulShortToken,
} from "./secretary-persona.js";
import {
  sanitizePromptUserInput,
  wrapUntrustedXml,
} from "../shared/prompt-injection.js";

export interface CurrentPageContextPayload {
  page_id: string;
  active_listing_id?: string;
  active_listing_title?: string;
  zero_ui_screen?: string;
}

export function normalizeSecretaryQuery(text: string | null | undefined): string {
  return String(text ?? "").trim();
}

export function isTooShortSecretaryQuery(text: string | null | undefined): boolean {
  const t = normalizeSecretaryQuery(text);
  if (!t) return true;
  if (detectServerSellIntent(t)) return false;
  // Short brand/product tokens (vw, bmw, kia, a4, nike…) are meaningful searches.
  if (hasMeaningfulShortToken(t)) return false;
  return t.length < SECRETARY_MIN_QUERY_CHARS;
}

/** VAD-style guard — never call Gemini on empty/noise input. */
export function resolveSecretaryNoiseReply(
  seed?: string,
  mode: "text" | "voice" = "text"
): string {
  const replies =
    mode === "voice" ? VOICE_SECRETARY_NOISE_REPLIES : TEXT_SECRETARY_NOISE_REPLIES;
  if (!replies.length) {
    return mode === "voice"
      ? "Atsiprašau, neišgirdau — pakartokite prašau?"
      : "Galite parašyti — padėsiu surasti ar sukurti skelbimą.";
  }
  if (!seed?.trim()) {
    return replies[0]!;
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % replies.length;
  }
  return replies[hash]!;
}

export function extractLastSessionTopic(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const text = normalizeSecretaryQuery(msg.text);
    if (text.length >= SECRETARY_MIN_QUERY_CHARS) {
      return text.length > 80 ? `${text.slice(0, 77)}…` : text;
    }
  }
  return "skelbimus ar paiešką";
}

export function buildPageContextInjectionBlock(
  page?: CurrentPageContextPayload | null
): string {
  if (!page?.page_id && !page?.active_listing_id) return "";

  const titleSafe = sanitizePromptUserInput(page.active_listing_title ?? "").text;
  const json = JSON.stringify({
    page_id: String(page.page_id ?? "").slice(0, 120),
    active_listing_id: page.active_listing_id
      ? String(page.active_listing_id).slice(0, 80)
      : null,
    active_listing_title: titleSafe || null,
    zero_ui_screen: page.zero_ui_screen
      ? String(page.zero_ui_screen).slice(0, 80)
      : null,
  });

  return `[UI kontekstas — rodo „šitas/anas"]:
${wrapUntrustedXml("untrusted_page_context", json, 2_000)}
Jei vartotojas sako „šitą", „aną", „išimk skelbimą", „archyvuok" — naudok active_listing_id be papildomų klausimų (markListingSold ar kitas įrankis).`;
}

export function buildSessionExpiredInjectionBlock(
  firstName: string,
  lastTopic: string
): string {
  const safeName = sanitizePromptUserInput(firstName).text || "drauge";
  const safeTopic =
    sanitizePromptUserInput(lastTopic).text || "skelbimus ar paiešką";
  return `[Sesijos TTL — vartotojas sugrįžo po ${Math.round(SECRETARY_SESSION_TTL_MS / 60_000)} min pertraukos]
Senoji pokalbio istorija nebegalioja. Paskutinė tema: „${safeTopic}".
Pradėk šiltai: „Sveiki sugrįžę, ${safeName}! Matau praeitą kartą kalbėjome apie ${safeTopic} — tęsiame ar pradedame naują skelbimą?"`;
}
