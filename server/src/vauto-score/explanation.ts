/**
 * LLM explanation — allowlisted reason codes only + math guard on scores.
 */

import type { VautoScoreResult } from "./score-schema.js";
import {
  isAllowedReasonCode,
  type ReasonCode,
  type ScoreComponent,
} from "./types.js";

export type ScoreExplanationCaller = (prompt: string) => Promise<string>;

const LT_LABELS: Record<ReasonCode, string> = {
  PRICE_WITHIN_MARKET_RANGE: "Kaina patenka į rinkos intervalą",
  PRICE_BELOW_MARKET_RANGE: "Kaina žemiau rinkos intervalo (patrauklu pirkėjui)",
  PRICE_ABOVE_MARKET_RANGE: "Kaina viršija rinkos intervalą",
  PRICE_MARKET_UNAVAILABLE: "Rinkos įvertinimo nėra (N/A)",
  PRICE_ASKING_MISSING: "Nenurodyta prašoma kaina",
  COMPLETE_ATTRIBUTES: "Atributai užpildyti išsamiai",
  PARTIAL_ATTRIBUTES: "Atributai užpildyti dalinai",
  SPARSE_ATTRIBUTES: "Atributų trūksta",
  RICH_PHOTO_SET: "Gausus nuotraukų rinkinys",
  ADEQUATE_PHOTO_SET: "Pakankamas nuotraukų kiekis",
  LIMITED_PHOTO_SET: "Ribotas nuotraukų kiekis",
  NO_PHOTOS: "Nėra nuotraukų",
  USEFUL_DESCRIPTION: "Naudingas aprašymas",
  THIN_DESCRIPTION: "Trumpas / silpnas aprašymas",
  MISSING_DESCRIPTION: "Aprašymo nėra",
  VERIFIED_SELLER: "Pardavėjo tapatybė patvirtinta",
  UNVERIFIED_SELLER: "Pardavėjo tapatybė nepatvirtinta",
  ESTABLISHED_ACCOUNT: "Įsitvirtinusi paskyra",
  NEW_SELLER_NO_HISTORY: "Naujas pardavėjas be istorijos (ne bauda)",
  LIMITED_TRANSACTION_HISTORY: "Ribota sandorių istorija",
  SOLID_TRANSACTION_HISTORY: "Solidi sandorių istorija",
  LOW_DISPUTE_RATE: "Žemas ginčų rodiklis",
  ELEVATED_DISPUTE_RATE: "Padidėjęs ginčų rodiklis",
  RELIABLE_DELIVERY_RECORD: "Patikimas pristatymų įrašas",
  SELLER_SIGNALS_MISSING: "Pardavėjo signalų trūksta",
  HEALTHY_DEMAND: "Sveika paklausa",
  MODERATE_DEMAND: "Vidutinė paklausa",
  LOW_DEMAND: "Žema paklausa",
  DEMAND_SIGNALS_MISSING: "Paklausos signalų trūksta",
  DEMAND_SPAM_FILTERED: "Paklausos triukšmas filtruotas",
  ESCROW_AVAILABLE: "Escrow prieinamas",
  OMNIVA_AVAILABLE: "Omniva pristatymas prieinamas",
  BUYER_PROTECTION_AVAILABLE: "Pirkėjo apsauga prieinama",
  LIMITED_PROTECTION_OPTIONS: "Ribotos apsaugos parinktys",
  NO_PROTECTION_OPTIONS: "Apsaugos parinkčių nėra",
  TRANSACTION_SIGNALS_MISSING: "Sandorio apsaugos signalų trūksta",
  SCORE_PARTIAL_COVERAGE: "Dalinis signalų padengimas",
  SCORE_INSUFFICIENT_COVERAGE: "Nepakanka signalų balui",
  SCORE_FULL_COVERAGE: "Pilnas komponentų padengimas",
};

export function buildTemplateExplanation(args: {
  status: VautoScoreResult["status"];
  totalScore: number | null;
  components: VautoScoreResult["components"];
  reasonCodes: ReasonCode[];
}): string {
  if (args.status === "INSUFFICIENT_DATA" || args.totalScore == null) {
    return (
      "VAUTO Score šiuo metu neprieinamas (N/A): nepakanka patikimų signalų. " +
      "Trūkstami duomenys neatvaizduojami kaip netikras 50/100."
    );
  }
  const bullets = args.reasonCodes
    .filter(isAllowedReasonCode)
    .slice(0, 8)
    .map((c) => LT_LABELS[c]);
  const scoreTxt =
    Number.isInteger(args.totalScore)
      ? String(args.totalScore)
      : args.totalScore.toFixed(1);
  return (
    `VAUTO Score: ${scoreTxt}/100 (${args.status}). ` +
    (bullets.length ? `Pagrindai: ${bullets.join("; ")}.` : "")
  );
}

/** Extract numbers that look like scores (0–100) or totals from LLM text. */
export function extractScoreLikeNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[.,]\d+)?)(?:\s*\/\s*100)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(String(m[1]).replace(",", "."));
    if (Number.isFinite(n) && n >= 0 && n <= 100) out.push(n);
  }
  return out;
}

function allowedNumbers(result: VautoScoreResult): Set<number> {
  const s = new Set<number>();
  if (result.totalScore != null) {
    s.add(result.totalScore);
    s.add(Math.round(result.totalScore));
  }
  for (const c of Object.values(result.components) as ScoreComponent[]) {
    if (c.score != null) {
      s.add(c.score);
      s.add(Math.round(c.score));
    }
    s.add(Math.round(c.weight * 100) / 100);
  }
  s.add(Math.round(result.confidence * 100) / 100);
  s.add(Math.round(result.confidence * 100));
  return s;
}

/**
 * Reject if LLM invents scores or non-allowlisted reason code tokens.
 */
export function explanationMathGuard(
  result: VautoScoreResult,
  llmText: string,
  allowedCodes: readonly string[]
): { ok: boolean; text: string; reason?: string } {
  const template = result.summaryExplanation;
  const allowed = allowedNumbers(result);

  // Reason code tokens in ALL_CAPS_WITH_UNDERSCORES must be allowlisted & provided
  const codeMentions = llmText.match(/\b[A-Z][A-Z0-9_]{3,}\b/g) ?? [];
  const provided = new Set(allowedCodes.filter(isAllowedReasonCode));
  for (const tok of codeMentions) {
    if (!isAllowedReasonCode(tok)) continue; // ignore unrelated ALLCAPS
    if (!provided.has(tok)) {
      return {
        ok: false,
        text: template,
        reason: `reason code ${tok} not in provided allowlist set`,
      };
    }
  }

  for (const n of extractScoreLikeNumbers(llmText)) {
    // Allow exact matches or ±0.1 to total/component
    const close = [...allowed].some((a) => Math.abs(a - n) <= 0.15);
    if (!close) {
      // Ignore bare "100" when used as /100 scale denominator only — already in pattern
      if (n === 100 && /\/\s*100/.test(llmText)) continue;
      return {
        ok: false,
        text: template,
        reason: `LLM number ${n} not in deterministic score set`,
      };
    }
  }

  return { ok: true, text: llmText.trim() };
}

export async function explainVautoScore(
  result: VautoScoreResult,
  reasonCodes: readonly string[],
  llm?: ScoreExplanationCaller
): Promise<{ text: string; source: "llm" | "template"; rejected: boolean }> {
  const fallback = result.summaryExplanation;
  if (!llm) return { text: fallback, source: "template", rejected: false };

  const safeCodes = reasonCodes.filter(isAllowedReasonCode);
  try {
    const prompt =
      `Paaiškink lietuviškai VAUTO Score naudodamas TIK šiuos reason codes ir skaičius. ` +
      `Nesugalvok naujų balų ar priežasčių.\n` +
      JSON.stringify({
        totalScore: result.totalScore,
        status: result.status,
        confidence: result.confidence,
        components: Object.fromEntries(
          Object.entries(result.components).map(([k, c]) => [
            k,
            { score: c.score, reasonCodes: c.reasonCodes },
          ])
        ),
        reasonCodes: safeCodes,
        labels: Object.fromEntries(safeCodes.map((c) => [c, LT_LABELS[c]])),
      });
    const raw = await llm(prompt);
    const g = explanationMathGuard(result, raw, safeCodes);
    if (!g.ok) return { text: g.text, source: "template", rejected: true };
    return { text: g.text, source: "llm", rejected: false };
  } catch {
    return { text: fallback, source: "template", rejected: false };
  }
}
