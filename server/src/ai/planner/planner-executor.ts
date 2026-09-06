/**
 * E2 — deterministic executor for planner-owned replies.
 *
 * When the planner routes `deterministic_executor`, the reply is produced by
 * typed logic here — never by ad-hoc regex branches scattered in the route.
 * Policy enforcement (auth, financial invariants, publish readiness) remains
 * in the action layer; these replies are the conversational surface of
 * planner decisions only.
 */
import { buildConversationalMissingPrompt } from "../listing-conversational-flow.js";

export interface DraftSummaryInput {
  title?: string;
  price?: number;
  location?: string;
  category?: string;
}

function draftHeadline(draft: DraftSummaryInput): string {
  const title = String(draft.title ?? "").trim() || "naujas skelbimas";
  const bits = [
    draft.price && Number(draft.price) > 0 ? `${draft.price} €` : "",
    String(draft.location ?? "").trim(),
  ].filter(Boolean);
  return bits.length ? `${title} — ${bits.join(", ")}` : title;
}

export function executorSellCancelReply(draft: DraftSummaryInput): string {
  return `Gerai — „${draftHeadline(draft)}“ lieka juodraštyje, nieko neskelbiame. Galite tęsti redagavimą arba publikuoti vėliau.`;
}

export function executorSellPreviewReply(draft: DraftSummaryInput): string {
  return `Štai dabartinis juodraštis: ${draftHeadline(draft)}. Galite koreguoti faktus arba publikuoti.`;
}

export function executorClarifyAmbiguousReply(token: string): string {
  return `Ar norite „${token}“ pirkti ar parduoti? Jei parduodate — parašykite aprašymą ir kainą; jei ieškote — pritaikysiu paieškos filtrus.`;
}

export function executorFinancialDenyReply(): string {
  return "Tokios finansinės operacijos pokalbyje atlikti negalima — naudokitės saugiais VAUTO mokėjimų ir piniginės kanalais.";
}

export function executorUnauthPublishReply(): string {
  return buildConversationalMissingPrompt({ missingAuth: true });
}

/** E2.1 — AI-down honest dialog: never a fabricated search, never success. */
export function executorAiDownReply(query: string): string {
  const q = String(query ?? "").trim();
  return q
    ? `Atsiprašau — AI asistentas laikinai negali suprasti šios užklausos („${q}“). Parašykite konkrečiau, ko norite, arba bandykite kiek vėliau.`
    : "Atsiprašau — AI asistentas laikinai negali suprasti užklausos. Parašykite konkrečiau, ko norite, arba bandykite kiek vėliau.";
}

export function executorSparseSellQuestion(category?: string): string {
  const cat = String(category ?? "").toLowerCase();
  if (cat === "services" || cat === "jobs") return "";
  return "Kokios būklės?";
}
