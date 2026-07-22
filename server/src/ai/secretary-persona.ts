/**
 * Runtime VAD / noise guards + thin voice analyze persona.
 * Main agent instructions live in supervisor-system-instruction + gemini-intent-rules.
 */

import {
  VAUTO_DOMAIN_AUTONOMY_RULES,
  VAUTO_IN_DOMAIN_RECOVERY,
} from "../shared/vauto-domain-autonomy.js";

/** Minimum meaningful user utterance before Gemini is invoked (VAD-style guard). */
export const SECRETARY_MIN_QUERY_CHARS = 2;

/** Short brand/product tokens that bypass the VAD noise guard. */
const SHORT_QUERY_ALLOWLIST_RE =
  /\b(vw|bmw|kia|a[1-8]|q[1-8]|x[1-6]|e\d{2}|golf|audi|seat|opel|saab|mini|fiat|jeep|nt|butas|namas|batai|kedai|suknel|dzins|striuk|palt|megzt|telefon|iphone|ipad|tv|ps[45]|xbox|nike|puma|adidas|zara)\b/i;

export function hasMeaningfulShortToken(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return SHORT_QUERY_ALLOWLIST_RE.test(normalized);
}

export const TEXT_SECRETARY_NOISE_REPLIES = [
  VAUTO_IN_DOMAIN_RECOVERY,
  "Galite parašyti, ką ieškote ar norite parduoti VAUTO — padėsiu su skelbimu.",
  "Parašykite trumpai apie prekę, paslaugą ar paiešką — tęsime VAUTO platformoje.",
] as const;

export const VOICE_SECRETARY_NOISE_REPLIES = [
  "Atsiprašau, neišgirdau — pakartokite prašau?",
  "Gal gali pakartoti trumpai? Esu pasiruošęs padėti.",
  "Aplink triukšmo — pasakykite, ką ieškote ar norite parduoti.",
] as const;

/** Agent chat memory window — after this idle gap, history is reset. */
export const SECRETARY_SESSION_TTL_MS = 15 * 60 * 1000;

/**
 * Voice-intent analyze prompt only (routes/ai voice JSON).
 * Domain boundary + autonomy come from shared rules — no parallel micro-rule corpus.
 */
export const VOICE_SECRETARY_PERSONA = `Tu esi VAUTO Smart Assistant balso / intencijos sluoksnis.

${VAUTO_DOMAIN_AUTONOMY_RULES}

BALSO JSON REŽIMAS:
- understoodSummary ir followUpQuestion — lietuviškai, kaip gyvas brokeris, ne sistemos pranešimas.
- Platformos viduje interpretuok natūraliai (typos, žargonas, fragmentai).
- Už VAUTO ribų — DOMAIN BOUNDARY redirect.
- DRAUDŽIAMA: „ne visai supratau“, „neaiški užklausa“.`;
