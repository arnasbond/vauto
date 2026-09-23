/**
 * VAUTO AI Core v2.3A — narrow AUTHORITY VERIFIER.
 *
 * EVIDENCE LOCATION != SEMANTIC ENTAILMENT. A verbatim/normalized substring
 * match proves only that text exists in the user turn — it cannot prove the
 * proposed normalized value is what the user asserted (it cannot see negation,
 * normalization, inflection, or shorthand), and must NOT become a semantic
 * authority engine.
 *
 * So the verifier is a NARROW, structurally-separate step that answers ONLY:
 * is this proposed claim actually entailed by its evidence, INCLUDING its
 * polarity/operation (positive inclusion vs negative exclusion)?
 * Verdicts: VERIFIED_USER_INTENT | CONTRADICTED | AMBIGUOUS | UNSUPPORTED.
 * Only VERIFIED_USER_INTENT may become execution-eligible.
 *
 * Two verifiers:
 *  - continuityVerifier (deterministic, conservative): only prior verified
 *    state re-statement is VERIFIED; everything else is UNSUPPORTED.
 *  - createGeminiAuthorityVerifier (model-assisted, narrow): judges semantic
 *    entailment + polarity from claim + evidence + user turn. Structurally
 *    separate from the reasoning provider and does NOT plan — it only
 *    verifies one claim. Fails CLOSED (a provider failure is never
 *    VERIFIED_USER_INTENT).
 */
import { resolveGeminiApiKey } from "../../load-env.js";
import type { MarketplaceState } from "../state/marketplace-state.js";
import type { StatePatch } from "../state/state-patch.js";
import {
  CORE_V2_MODEL,
  CORE_V2_VERIFIER_TIMEOUT_MS,
} from "../provider/model-config.js";

export type AuthorityVerdict =
  | "VERIFIED_USER_INTENT"
  | "CONTRADICTED"
  | "AMBIGUOUS"
  | "UNSUPPORTED";

export interface AuthorityClaim {
  op:
    | "setHard"
    | "setSearchSubject"
    | "addExclusion"
    | "removeHard"
    | "removeSearchSubject"
    | "removeExclusion";
  key?: string;
  value?: string | number;
  subject?: string;
  label?: string;
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
  if (patch.op === "addExclusion") {
    return { op: "addExclusion", label: patch.label, evidence: patch.evidence };
  }
  if (patch.op === "removeHard") {
    return { op: "removeHard", key: patch.key };
  }
  if (patch.op === "removeSearchSubject") {
    return { op: "removeSearchSubject" };
  }
  if (patch.op === "removeExclusion") {
    return { op: "removeExclusion", label: patch.label };
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
  if (claim.op === "addExclusion") {
    return state.exclusions.some(
      (e) => e.label === claim.label && e.provenance.source === "USER_STATED"
    );
  }
  return false;
}

export function currentTurnEvidenceVerified(userTurn: string, claim: AuthorityClaim): boolean {
  const ev =
    claim.evidence && typeof claim.evidence === "string" && claim.evidence.trim() !== ""
      ? claim.evidence.trim()
      : claim.value != null
        ? String(claim.value).trim()
        : claim.subject && claim.subject.trim() !== ""
          ? claim.subject.trim()
          : claim.label && claim.label.trim() !== ""
            ? claim.label.trim()
            : undefined;

  if (!ev) return false;
  return userTurn.toLowerCase().includes(ev.toLowerCase());
}

/**
 * Deterministic authority verifier composing two deterministic sources:
 * 1. Prior verified USER_STATED continuity (valueMatchesPrior)
 * 2. Current-turn verbatim evidence provenance (currentTurnEvidenceVerified)
 */
export const deterministicAuthorityVerifier: AuthorityVerifier = async (claim, ctx) => {
  if (valueMatchesPrior(ctx.priorState, claim)) return "VERIFIED_USER_INTENT";
  if (currentTurnEvidenceVerified(ctx.userTurn, claim)) return "VERIFIED_USER_INTENT";
  return "UNSUPPORTED";
};

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
Teiginys: modelis siūlo teiginį <CLAIM> su įrodymu <EVIDENCE>.

OPERACIJOS SEMANTIKA (polarity):
- op "setHard" / "setSearchSubject" = TEIGIAMAS įtraukimas: modelis teigia, kad vartotojas NORI šios reikšmės.
- op "addExclusion" = NEIGIAMAS atmetimas: modelis teigia, kad vartotojas NENORI šios reikšmės.
- op "removeHard" / "removeSearchSubject" / "removeExclusion" = PAŠALINIMAS: modelis teigia, kad vartotojas ATSISAKO / ATŠAUKIA anksčiau nustatytą reikšmę.

Nustatyk, ar teiginys su jo polarity/operation yra:
- VERIFIED_USER_INTENT — įrodymas aiškiai patvirtina šią reikšmę su nurodyta polarity (pašalinimui: vartotojas aiškiai atšaukia);
- CONTRADICTED — įrodymas reiškia PRIEŠINGĄ polarity (pvz. teigiamas setHard apie "SUV", kai vartotojas sako "nenoriu SUV");
- AMBIGUOUS — neaišku;
- UNSUPPORTED — įrodymas nepatvirtina šios reikšmės.

Atsakyk TIK vieną iš šių keturių žodžių.`;

const AUTHORITY_VERDICTS = new Set([
  "VERIFIED_USER_INTENT",
  "CONTRADICTED",
  "AMBIGUOUS",
  "UNSUPPORTED",
]);

export interface VerifierAttemptTelemetry {
  elapsedMs: number;
  timedOut: boolean;
  status?: number;
  verdict: AuthorityVerdict;
  /** Provider-reported usage metadata (observability only; never credentials). */
  usage?: Record<string, unknown>;
}

export function createGeminiAuthorityVerifier(opts: {
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  onAttempt?: (t: VerifierAttemptTelemetry) => void;
} = {}): AuthorityVerifier {
  const model = opts.model ?? CORE_V2_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CORE_V2_VERIFIER_TIMEOUT_MS;
  const onAttempt = opts.onAttempt;
  return async (claim, ctx) => {
    const key = resolveGeminiApiKey();
    if (!key) return "UNSUPPORTED";
    const claimText = JSON.stringify(claim);
    const prompt = AUTHORITY_VERIFY_PROMPT.replace("<USER_TURN>", ctx.userTurn)
      .replace("<CLAIM>", claimText)
      .replace("<EVIDENCE>", claim.evidence ?? "");
    const t0 = Date.now();
    try {
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
          signal: AbortSignal.timeout(timeoutMs),
        }
      );
      if (!res.ok) {
        const elapsedMs = Date.now() - t0;
        onAttempt?.({ elapsedMs, timedOut: false, status: res.status, verdict: "UNSUPPORTED" });
        return "UNSUPPORTED";
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: Record<string, unknown>;
      };
      const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim().toUpperCase();
      const word = text.match(/VERIFIED_USER_INTENT|CONTRADICTED|AMBIGUOUS|UNSUPPORTED/)?.[0];
      const verdict = AUTHORITY_VERDICTS.has(word ?? "") ? (word as AuthorityVerdict) : "UNSUPPORTED";
      const elapsedMs = Date.now() - t0;
      onAttempt?.({ elapsedMs, timedOut: false, status: res.status, verdict, usage: data.usageMetadata });
      return verdict;
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      const elapsedMs = Date.now() - t0;
      onAttempt?.({ elapsedMs, timedOut, verdict: "UNSUPPORTED" });
      // Fail CLOSED: a provider failure can never grant execution authority.
      return "UNSUPPORTED";
    }
  };
}
