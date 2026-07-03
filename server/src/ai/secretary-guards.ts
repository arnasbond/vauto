import type { AgentMessage } from "./vauto-agent.js";
import { detectServerSellIntent } from "./sell-intent-fallback.js";
import {
  SECRETARY_MIN_QUERY_CHARS,
  SECRETARY_NOISE_REPLIES,
  SECRETARY_SESSION_TTL_MS,
  hasMeaningfulShortToken,
} from "./secretary-persona.js";

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
export function resolveSecretaryNoiseReply(seed?: string): string {
  if (!SECRETARY_NOISE_REPLIES.length) {
    return "Atsiprašau, neišgirdau — pakartokite prašau?";
  }
  if (!seed?.trim()) {
    return SECRETARY_NOISE_REPLIES[0]!;
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % SECRETARY_NOISE_REPLIES.length;
  }
  return SECRETARY_NOISE_REPLIES[hash]!;
}

export function isSecretarySessionExpired(
  lastActiveAtMs: number | undefined,
  now = Date.now()
): boolean {
  if (!lastActiveAtMs || !Number.isFinite(lastActiveAtMs)) return false;
  return now - lastActiveAtMs > SECRETARY_SESSION_TTL_MS;
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

  const json = JSON.stringify({
    page_id: page.page_id,
    active_listing_id: page.active_listing_id ?? null,
    active_listing_title: page.active_listing_title ?? null,
    zero_ui_screen: page.zero_ui_screen ?? null,
  });

  return `[UI kontekstas — rodo „šitas/anas"]:
${json}
Jei vartotojas sako „šitą", „aną", „išimk skelbimą", „archyvuok" — naudok active_listing_id be papildomų klausimų (markListingSold ar kitas įrankis).`;
}

export function buildSessionExpiredInjectionBlock(
  firstName: string,
  lastTopic: string
): string {
  return `[Sesijos TTL — vartotojas sugrįžo po ${Math.round(SECRETARY_SESSION_TTL_MS / 60_000)} min pertraukos]
Senoji pokalbio istorija nebegalioja. Paskutinė tema: „${lastTopic}".
Pradėk šiltai: „Sveiki sugrįžę, ${firstName}! Matau praeitą kartą kalbėjome apie ${lastTopic} — tęsiame ar pradedame naują skelbimą?"`;
}
