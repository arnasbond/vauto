/**
 * LLM explanation — fact-locked; cannot invent IDs, reorder, or invent numbers.
 */

import { collectDeterministicNumbers, type DeltaMap } from "./delta-engine.js";
import type { CompareResponse, ComparisonListingSnapshot } from "./schema.js";
import {
  isAllowedCompareTradeoff,
  type CompareTradeoffCode,
} from "./types.js";

export type CompareExplanationCaller = (prompt: string) => Promise<string>;

const LT: Partial<Record<CompareTradeoffCode, string>> = {
  LOWER_PRICE: "žemesnė kaina",
  NEWER_YEAR: "naujesni metai",
  LOWER_MILEAGE: "mažesnė rida",
  HIGHER_VAUTO_SCORE: "aukštesnis VAUTO Score",
  HIGHER_BUYER_MATCH: "geresnis Buyer Match",
  CLOSER_DISTANCE: "mažesnis atstumas",
  HIGHER_PRICE: "aukštesnė kaina",
  HIGHER_MILEAGE: "didesnė rida",
  OLDER_YEAR: "senesni metai",
  LOWER_MATCH: "silpnesnis Buyer Match",
  LOWER_VAUTO_SCORE: "žemesnis VAUTO Score",
  FARTHER_DISTANCE: "didesnis atstumas",
  BETTER_CONDITION: "geresnė būklė",
  WORSE_CONDITION: "silpnesnė būklė",
  HAS_WARRANTY: "yra garantija",
  NO_WARRANTY: "nėra garantijos",
  HAS_DELIVERY: "yra pristatymas",
  NO_DELIVERY: "nėra pristatymo",
  MORE_STORAGE: "daugiau atminties",
  LESS_STORAGE: "mažiau atminties",
};

export function buildTemplateSummary(
  response: Pick<
    CompareResponse,
    | "comparedListings"
    | "tradeoffs"
    | "keyTakeaways"
    | "contextualBestListingId"
    | "status"
  >
): string {
  if (response.status === "STALE_SNAPSHOT") {
    return "Palyginimas neprieinamas: STALE_SNAPSHOT — kaina ar kritiniai laukai pasikeitė. Atnaujinkite duomenis.";
  }
  if (response.status === "UNAUTHORIZED") {
    return "Palyginimas neprieinamas: trūksta autorizacijos vienam ar keliems skelbimams.";
  }
  if (response.status === "INVALID_REQUEST") {
    return "Netinkama Compare užklausa (reikia 2–4 unikalių autorizuotų skelbimų ID).";
  }

  const lines = response.comparedListings.map((l) => {
    const price = l.askingPrice == null ? "N/A" : `${l.askingPrice} €`;
    const t = response.tradeoffs.find((x) => x.listingId === l.listingId);
    const pros = (t?.pros ?? [])
      .filter(isAllowedCompareTradeoff)
      .slice(0, 3)
      .map((c) => LT[c] ?? c)
      .join(", ");
    return `${l.listingId}: ${l.title} — kaina ${price}${pros ? `; pliusai: ${pros}` : ""}`;
  });

  let text = `Compare 1.0: ${lines.join(" | ")}.`;
  if (!response.contextualBestListingId) {
    text +=
      " Absoliutus laimėtojas neskelbiamas be pirkėjo konteksto.";
  } else {
    text += ` Kontextinis geriausias atitikmuo: ${response.contextualBestListingId}.`;
  }
  return text;
}

export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[ \u00a0]?\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1].replace(/[ \u00a0]/g, "").replace(",", ".");
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function explanationCompareGuard(
  response: CompareResponse,
  llmText: string,
  deltas: DeltaMap
): { ok: boolean; text: string; reason?: string } {
  const template = response.aiSummary;
  const allowedIds = new Set(response.comparedListings.map((l) => l.listingId));
  const allowedNums = collectDeterministicNumbers(
    response.comparedListings,
    deltas
  );

  // Hallucinated listing ids
  for (const id of allowedIds) {
    // ok if mentioned
  }
  const idLike = llmText.match(/\b(?:listing-|id-)[a-z0-9\-_]+\b/gi) ?? [];
  for (const tok of idLike) {
    if (![...allowedIds].some((id) => id.toLowerCase() === tok.toLowerCase())) {
      return {
        ok: false,
        text: template,
        reason: `hallucinated listing id ${tok}`,
      };
    }
  }

  // Reorder: listing ids must appear in comparedListings order when multiple mentioned
  const positions: Array<{ id: string; pos: number }> = [];
  for (const l of response.comparedListings) {
    const pos = llmText.indexOf(l.listingId);
    if (pos >= 0) positions.push({ id: l.listingId, pos });
  }
  positions.sort((a, b) => a.pos - b.pos);
  if (positions.length >= 2) {
    const expected = response.comparedListings
      .map((l) => l.listingId)
      .filter((id) => positions.some((p) => p.id === id));
    for (let i = 0; i < positions.length; i++) {
      if (positions[i].id !== expected[i]) {
        return {
          ok: false,
          text: template,
          reason: "LLM attempted to reorder listing facts",
        };
      }
    }
  }

  // Absolute winner without context
  if (
    response.contextualBestListingId == null &&
    /\b(laim[eė]tojas|absolute winner|aiškus nugal[eė]tojas)\b/i.test(llmText)
  ) {
    return {
      ok: false,
      text: template,
      reason: "absolute winner claim without buyer context",
    };
  }

  // Tradeoff codes
  const codes = llmText.match(/\b[A-Z][A-Z0-9_]{3,}\b/g) ?? [];
  const provided = new Set<string>();
  for (const t of response.tradeoffs) {
    for (const c of t.pros) provided.add(c);
    for (const c of t.cons) provided.add(c);
  }
  for (const tok of codes) {
    if (isAllowedCompareTradeoff(tok) && !provided.has(tok)) {
      return {
        ok: false,
        text: template,
        reason: `tradeoff code ${tok} not in deterministic set`,
      };
    }
  }

  for (const n of extractNumbers(llmText)) {
    if (n === 100 || n === 1 || n === 2 || n === 3 || n === 4) continue;
    const close = [...allowedNums].some((a) => Math.abs(a - n) <= 0.15);
    if (!close) {
      return {
        ok: false,
        text: template,
        reason: `LLM number ${n} not in deterministic fact/delta set`,
      };
    }
  }

  return { ok: true, text: llmText.trim() };
}

export async function explainCompare(
  response: CompareResponse,
  deltas: DeltaMap,
  llm?: CompareExplanationCaller
): Promise<{ text: string; source: "llm" | "template"; rejected: boolean }> {
  const fallback = response.aiSummary;
  if (!llm) return { text: fallback, source: "template", rejected: false };
  try {
    const prompt =
      `Paaiškink lietuviškai Compare faktų lentelę. ` +
      `Negalima keisti tvarkos, ID ar skaičių. Neskelbk absoliutaus laimėtojo, jei contextualBestListingId=null.\n` +
      JSON.stringify({
        listings: response.comparedListings.map((l: ComparisonListingSnapshot) => ({
          listingId: l.listingId,
          title: l.title,
          askingPrice: l.askingPrice,
          attributes: l.attributes,
          vautoScore: l.vautoScore,
          buyerMatchScore: l.buyerMatchScore,
        })),
        deltas,
        tradeoffs: response.tradeoffs,
        contextualBestListingId: response.contextualBestListingId,
        keyTakeaways: response.keyTakeaways,
      });
    const raw = await llm(prompt);
    const g = explanationCompareGuard(response, raw, deltas);
    if (!g.ok) return { text: g.text, source: "template", rejected: true };
    return { text: g.text, source: "llm", rejected: false };
  } catch {
    return { text: fallback, source: "template", rejected: false };
  }
}
