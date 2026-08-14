/**
 * LLM explanation — allowlisted reason/tradeoff codes only; cannot reorder or change scores.
 */

import type { BuyerMatchResult, BuyerMatchResponse } from "./schema.js";
import {
  EXPLANATION_TOP_N,
  isAllowedReasonCode,
  isAllowedTradeoffCode,
  type ReasonCode,
  type TradeoffCode,
} from "./types.js";

export type MatchExplanationCaller = (prompt: string) => Promise<string>;

const REASON_LT: Partial<Record<ReasonCode, string>> = {
  WITHIN_BUDGET: "Kaina neviršija biudžeto",
  EXACT_BRAND_MATCH: "Tiksli markės atitiktis",
  EXACT_MODEL_MATCH: "Tiksli modelio atitiktis",
  YEAR_WITHIN_PREFERENCE: "Metai atitinka pageidavimą",
  LOW_MILEAGE_FIT: "Rida tinkama",
  LOW_DISTANCE: "Mažas atstumas",
  STRONG_VAUTO_SCORE: "Aukštas VAUTO Score",
  VERIFIED_SELLER_SIGNAL: "Yra tapatybės patvirtinimo signalas",
  DELIVERY_AVAILABLE: "Pristatymas prieinamas",
  COLOR_PREFERENCE_MATCH: "Spalva atitinka pageidavimą",
  CONDITION_PREFERENCE_MATCH: "Būklė atitinka pageidavimą",
  FUEL_PREFERENCE_MATCH: "Kuras atitinka pageidavimą",
  TRANSMISSION_PREFERENCE_MATCH: "Pavarų dėžė atitinka",
  SOFT_PREFERENCE_ALIGNED: "Minkštos preferencijos suderintos",
};

const TRADEOFF_LT: Partial<Record<TradeoffCode, string>> = {
  HIGHER_MILEAGE_THAN_TOP_RESULT: "Didesnė rida nei geriausio rezultato",
  PRICE_NEAR_BUDGET_LIMIT: "Kaina arti biudžeto ribos",
  DELIVERY_NOT_AVAILABLE: "Pristatymas neprieinamas",
  FARTHER_THAN_TOP_RESULT: "Tolimesnis nei geriausias rezultatas",
  OLDER_YEAR_THAN_PREFERRED: "Senesni metai nei pageidauta",
  LOWER_VAUTO_SCORE_THAN_TOP: "Žemesnis VAUTO Score nei top",
  MISSING_MILEAGE_SIGNAL: "Ridos signalo trūksta (ne bauda)",
  MISSING_DISTANCE_SIGNAL: "Atstumo signalo trūksta",
  MISSING_COLOR_SIGNAL: "Spalvos signalo trūksta",
  MISSING_DELIVERY_SIGNAL: "Pristatymo signalo trūksta",
  SOFT_PREFERENCE_PARTIAL: "Dalinis preferencijų atitikimas",
};

export function buildMatchSummary(
  ranked: BuyerMatchResult[],
  eligibleCount: number,
  total: number
): string {
  if (eligibleCount === 0) {
    return (
      `Buyer Match: iš ${total} kandidatų nė vienas neatitiko hard constraints ` +
      `(arba kandidatų rinkinys tuščias). Pagrindiniame rankinge 0 skelbimų.`
    );
  }
  const top = ranked.slice(0, EXPLANATION_TOP_N);
  const lines = top.map((r, i) => {
    const why = r.reasons
      .filter(isAllowedReasonCode)
      .slice(0, 3)
      .map((c) => REASON_LT[c] ?? c)
      .join(", ");
    return `${i + 1}) ${r.listingId} — ${r.matchScore}/100${why ? ` (${why})` : ""}`;
  });
  return (
    `Buyer Match: ${eligibleCount}/${total} tinkami. Top-${Math.min(EXPLANATION_TOP_N, eligibleCount)}: ` +
    lines.join("; ") +
    "."
  );
}

export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[.,]\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(String(m[1]).replace(",", "."));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Guard: LLM may not invent scores, reorder IDs, or invent codes.
 * Returns template on reject. Never mutates ranked order.
 */
export function explanationMatchGuard(
  response: BuyerMatchResponse,
  llmText: string
): { ok: boolean; text: string; reason?: string } {
  const template = response.summaryExplanation;
  const top = response.rankedListings.slice(0, EXPLANATION_TOP_N);
  const allowedIds = new Set(top.map((r) => r.listingId));
  const allowedScores = new Set<number>();
  for (const r of top) {
    if (r.matchScore != null) {
      allowedScores.add(r.matchScore);
      allowedScores.add(Math.round(r.matchScore));
    }
  }
  allowedScores.add(response.eligibleCount);
  allowedScores.add(response.totalCandidatesEvaluated);

  // Detect listing-like IDs (simple heuristic: tokens matching known candidate pattern or id-*)
  const idMentions = llmText.match(/\b(?:id-)?[a-z0-9][a-z0-9\-_]{2,}\b/gi) ?? [];
  for (const tok of idMentions) {
    if (tok.startsWith("id-") || /^listing-/i.test(tok)) {
      if (!allowedIds.has(tok) && !allowedIds.has(tok.toLowerCase())) {
        // only reject if it looks like a listing id from our corpus style
        if (/^(id-|listing-)/i.test(tok)) {
          return {
            ok: false,
            text: template,
            reason: `hallucinated listing id ${tok}`,
          };
        }
      }
    }
  }

  // Explicit ranked IDs from response that appear out of order in LLM text
  const mentionedOrder: string[] = [];
  const positions: Array<{ id: string; pos: number }> = [];
  for (const r of top) {
    const pos = llmText.indexOf(r.listingId);
    if (pos >= 0) positions.push({ id: r.listingId, pos });
  }
  positions.sort((a, b) => a.pos - b.pos);
  for (const p of positions) mentionedOrder.push(p.id);

  if (mentionedOrder.length >= 2) {
    const expected = top.map((r) => r.listingId).filter((id) => mentionedOrder.includes(id));
    for (let i = 0; i < mentionedOrder.length; i++) {
      if (mentionedOrder[i] !== expected[i]) {
        return {
          ok: false,
          text: template,
          reason: "LLM attempted to reorder results",
        };
      }
    }
  }

  const codeMentions = llmText.match(/\b[A-Z][A-Z0-9_]{3,}\b/g) ?? [];
  const providedCodes = new Set<string>();
  for (const r of top) {
    for (const c of r.reasons) providedCodes.add(c);
    for (const c of r.tradeoffs) providedCodes.add(c);
  }
  for (const tok of codeMentions) {
    if (isAllowedReasonCode(tok) || isAllowedTradeoffCode(tok)) {
      if (!providedCodes.has(tok)) {
        return {
          ok: false,
          text: template,
          reason: `code ${tok} not in top-N allowlist set`,
        };
      }
    }
  }

  for (const n of extractNumbers(llmText)) {
    if (n > 100 && n !== response.totalCandidatesEvaluated) continue;
    if (n >= 0 && n <= 100) {
      const close = [...allowedScores].some((a) => Math.abs(a - n) <= 0.15);
      if (!close && n !== 100) {
        // allow small ranks 1..topN
        if (n >= 1 && n <= EXPLANATION_TOP_N) continue;
        if (n === response.eligibleCount) continue;
        return {
          ok: false,
          text: template,
          reason: `LLM number ${n} not in deterministic score set`,
        };
      }
    }
  }

  return { ok: true, text: llmText.trim() };
}

export async function explainBuyerMatch(
  response: BuyerMatchResponse,
  llm?: MatchExplanationCaller
): Promise<{ text: string; source: "llm" | "template"; rejected: boolean }> {
  const fallback = response.summaryExplanation;
  if (!llm) return { text: fallback, source: "template", rejected: false };

  const top = response.rankedListings.slice(0, EXPLANATION_TOP_N);
  try {
    const prompt =
      `Paaiškink lietuviškai Buyer Match Top-${top.length}. ` +
      `Negalima keisti tvarkos ar matchScore. Naudok tik pateiktus kodus ir ID.\n` +
      JSON.stringify({
        eligibleCount: response.eligibleCount,
        totalCandidatesEvaluated: response.totalCandidatesEvaluated,
        top: top.map((r) => ({
          listingId: r.listingId,
          matchScore: r.matchScore,
          reasons: r.reasons,
          tradeoffs: r.tradeoffs,
          reasonLabels: r.reasons.map((c) =>
            isAllowedReasonCode(c) ? REASON_LT[c] : c
          ),
          tradeoffLabels: r.tradeoffs.map((c) =>
            isAllowedTradeoffCode(c) ? TRADEOFF_LT[c] : c
          ),
        })),
      });
    const raw = await llm(prompt);
    const g = explanationMatchGuard(response, raw);
    if (!g.ok) return { text: g.text, source: "template", rejected: true };
    return { text: g.text, source: "llm", rejected: false };
  } catch {
    return { text: fallback, source: "template", rejected: false };
  }
}
