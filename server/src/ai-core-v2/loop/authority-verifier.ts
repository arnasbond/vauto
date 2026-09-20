/**
 * VAUTO AI Core v2.3 — narrow AUTHORITY VERIFIER.
 *
 * EVIDENCE LOCATION != SEMANTIC ENTAILMENT. A verbatim/normalized substring
 * match proves only that text exists in the user turn — it cannot prove the
 * proposed normalized value is what the user asserted (it cannot see negation,
 * normalization, inflection, or shorthand), and must NOT become a semantic
 * authority engine.
 *
 * So the verifier is a NARROW, structurally-separate step that answers ONLY:
 * is this proposed USER_STATED value actually entailed by its evidence?
 * Verdicts: VERIFIED_USER_INTENT | CONTRADICTED | AMBIGUOUS | UNSUPPORTED.
 * Only VERIFIED_USER_INTENT may become execution-eligible.
 *
 * Two verifiers:
 *  - continuityVerifier (deterministic, conservative): only prior verified
 *    state re-statement is VERIFIED; everything else is UNSUPPORTED.
 *  - createGeminiAuthorityVerifier (model-assisted, narrow): judges semantic
 *    entailment from claim + evidence + user turn. Structurally separate from
 *    the reasoning provider and does NOT plan — it only verifies one claim.
 */
import { resolveGeminiApiKey } from "../../load-env.js";
import type { MarketplaceState } from "../state/marketplace-state.js";
import type { StatePatch } from "../state/state-patch.js";

export type AuthorityVerdict =
  | "VERIFIED_USER_INTENT"
  | "CONTRADICTED"
  | "AMBIGUOUS"
  | "UNSUPPORTED";

export interface AuthorityClaim {
  op: "setHard" | "setSearchSubject";
  key?: string;
  value?: string | number;
  subject?: string;
  evidence?: string;
}

export interface AuthorityVerifyContext {
  userTurn: string;
  priorState: MarketplaceState;
}

export type AuthorityVerifier = (
  claim: AuthorityClaim,
  context: AuthorityVerifyContext
) => Promise<AuthorityVerdict>;

export function claimFromPatch(patch: StatePatch): AuthorityClaim | null {
  if (patch.op === "setHard") {
    return { op: "setHard", key: patch.key, value: patch.value, evidence: patch.evidence };
  }
  if (patch.op === "setSearchSubject") {
    return { op: "setSearchSubject", subject: patch.subject, evidence: patch.evidence };
  }
  return null;
}

function valueMatchesPrior(state: MarketplaceState, claim: AuthorityClaim): boolean {
  if (claim.op === "setHard" && claim.key) {
    const key = claim.key as keyof MarketplaceState["hardConstraints"];
    const prior = state.hardConstraints[key];
    const prov = state.hardConstraintProvenance[key];
    return prior != null && prov?.source === "USER_STATED" && prior === claim.value;
  }
  if (claim.op === "setSearchSubject") {
    return (
      state.searchSubject === claim.subject &&
      state.searchSubjectProvenance?.source === "USER_STATED"
    );
  }
  return false;
}

/**
 * Deterministic conservative verifier: ONLY prior verified USER_INTENT state
 * re-statement is VERIFIED. It performs no semantic entailment (no negation,
 * normalization, or substring authority) — that is the model verifier's job.
 */
export const continuityVerifier: AuthorityVerifier = async (claim, ctx) => {
  if (valueMatchesPrior(ctx.priorState, claim)) return "VERIFIED_USER_INTENT";
  return "UNSUPPORTED";
};

const AUTHORITY_VERIFY_PROMPT = `Tu esi NARROWS autoriteto tikrintuvas (ne planeris). Įvertink VIENĄ teiginį.

Vartotojo turnas: <USER_TURN>
Teiginys: modelis siūlo normalizuotą reikšmę <CLAIM> su įrodymu <EVIDENCE>.

Nustatyk, ar normalizuota reikšmė yra:
- VERIFIED_USER_INTENT — įrodymas aiškiai patvirtina šią reikšmę;
- CONTRADICTED — įrodymas reiškia PRIEŠINGĄ (pvz. neigimą „nenoriu X");
- AMBIGUOUS — neaišku;
- UNSUPPORTED — įrodymas nepatvirtina šios reikšmės.

Atsakyk TIK vieną iš šių keturių žodžių.`;

const AUTHORITY_VERDICTS = new Set([
  "VERIFIED_USER_INTENT",
  "CONTRADICTED",
  "AMBIGUOUS",
  "UNSUPPORTED",
]);

export function createGeminiAuthorityVerifier(opts: {
  model?: string;
  fetchImpl?: typeof fetch;
} = {}): AuthorityVerifier {
  const model = opts.model ?? "gemini-2.0-flash";
  const doFetch = opts.fetchImpl ?? fetch;
  return async (claim, ctx) => {
    const key = resolveGeminiApiKey();
    if (!key) return "UNSUPPORTED";
    const claimText = JSON.stringify(claim);
    const prompt = AUTHORITY_VERIFY_PROMPT.replace("<USER_TURN>", ctx.userTurn)
      .replace("<CLAIM>", claimText)
      .replace("<EVIDENCE>", claim.evidence ?? "");
    const res = await doFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You are an authority verifier. Output exactly one verdict word." }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0 },
        }),
      }
    );
    if (!res.ok) return "UNSUPPORTED";
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim().toUpperCase();
    const word = text.match(/VERIFIED_USER_INTENT|CONTRADICTED|AMBIGUOUS|UNSUPPORTED/)?.[0];
    return AUTHORITY_VERDICTS.has(word ?? "") ? (word as AuthorityVerdict) : "UNSUPPORTED";
  };
}
