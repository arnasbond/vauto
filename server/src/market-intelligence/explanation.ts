/**
 * LLM explanation of ValuationResult — numbers must match deterministic facts or REJECT.
 */

import type { ValuationResult } from "./valuation-schema.js";

export type ExplanationCaller = (prompt: string) => Promise<string>;

const TEMPLATE = (v: ValuationResult): string => {
  if (v.status === "INSUFFICIENT_DATA") {
    return "Rinkos įvertinimo nėra (N/A): nepakanka patikimų palyginamų stebėjimų. Skaičių nesugalvojame.";
  }
  if (v.status === "UNSUPPORTED") {
    return "Ši kategorija Market Intelligence 1.0 nepalaikoma.";
  }
  const r = v.estimatedRange!;
  return (
    `Orientacinis rinkos intervalas ~${r.low}–${r.high} € ` +
    `(vidurio taškas ~${r.median} €), remiantis ${v.acceptedComparableCount} priimtais palyginimais ` +
    `(lygis ${v.comparableLevel}, patikimumas ${v.confidenceBand}). ` +
    `Kainos pagrindas: ${v.priceBasis}.`
  );
};

/** Extract euro-like integers from text (tolerant of spaces/commas). */
export function extractMentionedAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[ \u00a0]?\d{3})+|\d+)(?:[.,]\d+)?\s*€?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1].replace(/[ \u00a0]/g, "");
    const n = Number(raw.replace(",", "."));
    if (Number.isFinite(n)) out.push(Math.round(n));
  }
  return out;
}

export function explanationGuard(
  valuation: ValuationResult,
  llmText: string
): { ok: boolean; text: string; reason?: string } {
  const allowed = new Set<number>();
  if (valuation.estimatedRange) {
    allowed.add(valuation.estimatedRange.low);
    allowed.add(valuation.estimatedRange.median);
    allowed.add(valuation.estimatedRange.high);
  }
  allowed.add(valuation.acceptedComparableCount);
  allowed.add(valuation.comparableCount);
  allowed.add(valuation.excludedOutlierCount);
  // Allow small rounding noise ±1 on range only
  const mentioned = extractMentionedAmounts(llmText);
  for (const n of mentioned) {
    if (allowed.has(n)) continue;
    if (
      valuation.estimatedRange &&
      [valuation.estimatedRange.low, valuation.estimatedRange.median, valuation.estimatedRange.high].some(
        (x) => Math.abs(x - n) <= 1
      )
    ) {
      continue;
    }
    // Ignore tiny numbers that are not euro amounts in narrative (years etc. hard — reject stray large)
    if (n >= 100 || (valuation.estimatedRange && n > 0)) {
      // years 1990-2030 often appear — allow
      if (n >= 1990 && n <= 2035) continue;
      if (!allowed.has(n)) {
        return {
          ok: false,
          text: TEMPLATE(valuation),
          reason: `LLM amount ${n} not in deterministic ValuationResult`,
        };
      }
    }
  }
  return { ok: true, text: llmText.trim() };
}

export async function explainValuation(
  valuation: ValuationResult,
  llm?: ExplanationCaller
): Promise<{ text: string; source: "llm" | "template"; rejected: boolean }> {
  const fallback = TEMPLATE(valuation);
  if (!llm) return { text: fallback, source: "template", rejected: false };
  try {
    const prompt =
      `Paaiškink lietuviškai TIK šiuos faktus, nesugalvodamas kitų skaičių:\n` +
      JSON.stringify({
        status: valuation.status,
        estimatedRange: valuation.estimatedRange,
        acceptedComparableCount: valuation.acceptedComparableCount,
        comparableLevel: valuation.comparableLevel,
        confidenceBand: valuation.confidenceBand,
        priceBasis: valuation.priceBasis,
      });
    const raw = await llm(prompt);
    const g = explanationGuard(valuation, raw);
    if (!g.ok) return { text: g.text, source: "template", rejected: true };
    return { text: g.text, source: "llm", rejected: false };
  } catch {
    return { text: fallback, source: "template", rejected: false };
  }
}
