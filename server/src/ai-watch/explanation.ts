/**
 * Notification text — LLM optional with mandatory template fallback.
 * Never invents listing IDs or prices.
 */

import type { AiWatchMatchResult } from "./schema.js";
import type { WatchListingEvent } from "./types.js";
import { isAllowedMatchReason } from "./types.js";

export type WatchExplanationCaller = (prompt: string) => Promise<string>;

export function buildTemplateNotification(
  event: WatchListingEvent,
  match: AiWatchMatchResult
): { title: string; body: string } {
  const title = `VAUTO Watch: ${event.title}`.slice(0, 200);
  const reasons = match.matchReasons
    .filter(isAllowedMatchReason)
    .slice(0, 5)
    .join(", ");
  const body =
    `Skelbimas ${event.listingId} atitiko jūsų stebėjimą. ` +
    `Kaina: ${event.price} €. ` +
    (reasons ? `Priežastys: ${reasons}.` : "");
  return { title, body: body.slice(0, 2000) };
}

export function notificationTextGuard(
  event: WatchListingEvent,
  match: AiWatchMatchResult,
  llmText: string
): { ok: boolean; text: string } {
  const fallback = buildTemplateNotification(event, match).body;
  if (!llmText.includes(event.listingId)) {
    return { ok: false, text: fallback };
  }
  // Reject invented euro amounts not equal to event.price (simple)
  const amounts = [...llmText.matchAll(/(\d[\d\s]*)\s*€/g)].map((m) =>
    Number(m[1].replace(/\s/g, ""))
  );
  for (const n of amounts) {
    if (Number.isFinite(n) && n !== event.price && Math.abs(n - event.price) > 0.5) {
      return { ok: false, text: fallback };
    }
  }
  return { ok: true, text: llmText.trim().slice(0, 2000) };
}

export async function formatWatchNotification(
  event: WatchListingEvent,
  match: AiWatchMatchResult,
  llm?: WatchExplanationCaller
): Promise<{ title: string; body: string; source: "llm" | "template" }> {
  const tpl = buildTemplateNotification(event, match);
  if (!llm) return { ...tpl, source: "template" };
  try {
    const prompt =
      `Suformuluok trumpą lietuvišką Watch pranešimą. ` +
      `Privalomi faktai: listingId=${event.listingId}, price=${event.price}, title=${event.title}. ` +
      `Nesugalvok kitų ID ar kainų.\n` +
      JSON.stringify({
        listingId: event.listingId,
        price: event.price,
        title: event.title,
        matchReasons: match.matchReasons,
      });
    const raw = await llm(prompt);
    const g = notificationTextGuard(event, match, raw);
    if (!g.ok) return { ...tpl, source: "template" };
    return { title: tpl.title, body: g.text, source: "llm" };
  } catch {
    return { ...tpl, source: "template" };
  }
}
