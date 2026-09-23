/**
 * VAUTO AI Core v2.3P — SEMANTIC CLAIM responsibility prototype (shadow-only).
 *
 * R3 hypothesis: the model should emit TYPED SEMANTIC MEANING (claims), not
 * VAUTO-internal mutation mechanics. A deterministic, language-independent
 * mapper then translates ALREADY-UNDERSTOOD claims into existing StatePatch
 * mechanics. The mapper inspects ONLY the validated semantic claim — never raw
 * user text, no regex, no keyword/phrase rules.
 *
 * Provenance: the model does NOT self-assign authority. Executable claims are
 * USER_STATED *candidates*; the existing authority verifier assigns effective
 * provenance (verified → USER_STATED, else MODEL_INFERRED). Fail-closed.
 */
import { resolveGeminiApiKey } from "../../load-env.js";
import type { StatePatch } from "../state/state-patch.js";
import { provenance } from "../state/marketplace-state.js";
import type { ReasoningDecision, ReasoningInput } from "../reasoning/reasoning-contract.js";
import {
  CORE_V2_MAX_REASONING_ATTEMPTS,
  CORE_V2_MODEL,
  CORE_V2_REASONING_TIMEOUT_MS,
} from "./model-config.js";
import { ProviderFailureError, isRetryableFailure } from "./gemini-provider.js";
import { buildReasoningUserPrompt } from "./prompt.js";

export type ClaimRole = "constraint" | "subject" | "preference" | "exclusion" | "goal" | "unresolved" | "retraction";
export type ClaimConcept = "price" | "location" | "category";
export type ClaimStrength = "hard" | "soft" | "ambiguous";

export interface SemanticClaim {
  role: ClaimRole;
  concept?: ClaimConcept;
  boundary?: "min" | "max";
  value?: string | number;
  label?: string;
  strength?: ClaimStrength;
  target?: "constraint" | "subject" | "preference" | "exclusion";
}

export interface SemanticDecision {
  text?: string;
  clarification?: string;
  capabilityRequest?: { capability: string; args: unknown };
  claims?: SemanticClaim[];
}

export const SEMANTIC_CLAIM_SCHEMA = {
  type: "object" as const,
  properties: {
    text: { type: "string" as const },
    clarification: { type: "string" as const },
    capabilityRequest: {
      type: "object" as const,
      properties: { capability: { type: "string" as const }, args: { type: "object" as const } },
    },
    claims: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          role: { type: "string" as const, enum: ["constraint", "subject", "preference", "exclusion", "goal", "unresolved", "retraction"] },
          concept: { type: "string" as const, enum: ["price", "location", "category"] },
          boundary: { type: "string" as const, enum: ["min", "max"] },
          value: { anyOf: [{ type: "string" as const }, { type: "number" as const }] },
          label: { type: "string" as const },
          strength: { type: "string" as const, enum: ["hard", "soft", "ambiguous"] },
          target: { type: "string" as const, enum: ["constraint", "subject", "preference", "exclusion"] },
        },
        required: ["role"],
      },
    },
  },
};

export const R3_SYSTEM_INSTRUCTION = `Tu esi VAUTO rinkos asistento samprotavimo sluoksnis (Core v2).

PRINCIPAI:
- Samprotavimas laisvas. Faktai pagrįsti. Įrankiai riboti. Veiksmai autorizuoti.
- Suprask visą vartotojo turną pokalbio kontekste. Nepriverstas joks konkretus veiksmas.
- Vienas sprendimas gali VIENU METU: atsakyti, perteikti suprastą PRASMĘ (claims), paprašyti patikslinimo IR paprašyti VIENO READ įrankio.

SEMANTINĖS PRETENZIJOS (claims) — tik PRASMĖ, jokios vidinės mechanikos:
Kiekviena pretenzija išreiškia vieną aiškiai suprastą prasmę. Laukai:
- role: kas tai yra —
  "constraint" = kietas/minkštas reikalavimas arba poreikis;
  "subject" = ko žmogus ieško (produktas/objektas);
  "preference" = minkštas pageidavimas;
  "exclusion" = atmetimas (ko NENORI);
  "goal" = bendras tikslas;
  "unresolved" = neaiškumas, kurį reikia išsiaiškinti;
  "retraction" = ankstesnės informacijos atšaukimas.
- concept (tik "constraint"): "price" | "location" | "category".
- boundary (kai concept "price"): "min" | "max".
- value: normalizuota reikšmė (price → skaičius; location/category/subject → tekstas).
- label: tekstas preference/exclusion/unresolved.
- strength (tik "constraint"): "hard" | "soft" | "ambiguous".
- target (tik "retraction"): ką atšaukia. Leidžiamos reikšmės TIK: "constraint" | "subject" | "preference" | "exclusion".
    Kai target="constraint", nurodyk ir concept ("price" | "location" | "category"); kai concept="price" — ir boundary ("min" | "max").

POLARITY / ATSKYRIMAI:
- Atmetimas („nenoriu X", „tik ne X", „be X") → role "exclusion", NE "constraint".
- Minkštas noras → role "preference" arba constraint + strength "soft".
- Kietas reikalavimas → constraint + strength "hard".
- Neaišku → role "unresolved" arba clarification.
- Atskirk, kur žmogus GYVENA, nuo to, kur jis IEŠKO — tik paieškos vieta yra constraint "location".
- Atskirk minkštą norą („nelabai norėčiau") nuo griežto atmetimo („jokiu būdu ne") — pastarasis yra exclusion.
- Nenormalizuok už vartotoją: „iki 20 tūkst." → constraint price boundary max value 20000. Jei skaičius neaiškus → unresolved.

SVARBU:
- NErašyk vidinių operacijų (setHard, addSoft…), vidinių raktų, NEpriskirk authority/provenance.
- Autoritetą nustatys atskira sistema. Tu tik perteik prasmę.

SPRENDIMAS (JSON):
- text: matomas atsakymas (lietuviškai, natūraliai).
- claims: semantic claims sąrašas.
- capabilityRequest: { capability, args } tik READ įrankiui.
- clarification: vienas klausimas, jei reikia.

NIEKADA:
- Nepaversk atmetimo teigiamu constraint.
- Nepaversk minkšto noro kietu reikalavimu.
- Neišgalvok skelbimų / kainų / faktų.
- Nepriversk paieškos vien dėl žodžio.`;

function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asRole(v: unknown): ClaimRole | undefined {
  const s = optStr(v);
  return s && ["constraint", "subject", "preference", "exclusion", "goal", "unresolved", "retraction"].includes(s) ? (s as ClaimRole) : undefined;
}
function asConcept(v: unknown): ClaimConcept | undefined {
  const s = optStr(v);
  return s && ["price", "location", "category"].includes(s) ? (s as ClaimConcept) : undefined;
}
function asStrength(v: unknown): ClaimStrength | undefined {
  const s = optStr(v);
  return s && ["hard", "soft", "ambiguous"].includes(s) ? (s as ClaimStrength) : undefined;
}

const ALLOWED_DECISION_KEYS = new Set(["text", "clarification", "capabilityRequest", "claims"]);

export function parseSemanticDecision(raw: unknown): SemanticDecision {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ProviderFailureError("schema_invalid", "decision must be an object");
  }
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (!ALLOWED_DECISION_KEYS.has(k)) {
      throw new ProviderFailureError("schema_invalid", `unexpected decision field: ${JSON.stringify(k)}`);
    }
  }
  const d: SemanticDecision = {};
  if (r.text !== undefined) {
    if (typeof r.text !== "string") throw new ProviderFailureError("schema_invalid", "text must be a string");
    const t = r.text.trim();
    if (t) d.text = t;
  }
  if (r.clarification !== undefined) {
    if (typeof r.clarification !== "string") throw new ProviderFailureError("schema_invalid", "clarification must be a string");
    const c = r.clarification.trim();
    if (c) d.clarification = c;
  }
  if (r.capabilityRequest !== undefined) {
    if (!r.capabilityRequest || typeof r.capabilityRequest !== "object" || Array.isArray(r.capabilityRequest)) {
      throw new ProviderFailureError("schema_invalid", "capabilityRequest must be an object");
    }
    const cr = r.capabilityRequest as Record<string, unknown>;
    const cap = optStr(cr.capability);
    if (cap) d.capabilityRequest = { capability: cap, args: cr.args ?? {} };
  }
  if (r.claims !== undefined) {
    if (!Array.isArray(r.claims)) throw new ProviderFailureError("schema_invalid", "claims must be an array");
    const claims: SemanticClaim[] = [];
    for (const item of r.claims) {
      const it = (item ?? {}) as Record<string, unknown>;
      const role = asRole(it.role);
      if (!role) continue; // malformed/unknown role → skip (fail closed, no mutation)
      const claim: SemanticClaim = { role };
      const concept = asConcept(it.concept);
      if (concept) claim.concept = concept;
      const boundary = optStr(it.boundary);
      if (boundary === "min" || boundary === "max") claim.boundary = boundary;
      if (typeof it.value === "number" || typeof it.value === "string") claim.value = it.value;
      const label = optStr(it.label);
      if (label) claim.label = label;
      const strength = asStrength(it.strength);
      if (strength) claim.strength = strength;
      const target = optStr(it.target);
      if (target && ["constraint", "subject", "preference", "exclusion"].includes(target)) claim.target = target as SemanticClaim["target"];
      claims.push(claim);
    }
    d.claims = claims;
  }
  return d;
}

/**
 * DETERMINISTIC, structure-only mapper: semantic claims → StatePatch[].
 * Inspects ONLY the typed claim; never raw text. Unknown/ambiguous/malformed
 * claims are skipped (never become execution authority).
 */
export function claimsToPatches(claims: SemanticClaim[] | undefined): StatePatch[] {
  const patches: StatePatch[] = [];
  for (const c of claims ?? []) {
    switch (c.role) {
      case "constraint": {
        if (c.strength === "soft") {
          const label = c.label ?? `${c.concept ?? "savybė"} ${String(c.value ?? "").trim()}`.trim();
          patches.push({ op: "addSoft", label, provenance: provenance("MODEL_INFERRED") });
          break;
        }
        if (c.strength !== "hard") break; // ambiguous/missing → non-executable
        if (c.concept === "price") {
          const key = c.boundary === "min" ? "priceMin" : c.boundary === "max" ? "priceMax" : undefined;
          if (key && (typeof c.value === "number" || (typeof c.value === "string" && c.value.trim() !== ""))) {
            patches.push({ op: "setHard", key, value: c.value, provenance: provenance("USER_STATED") });
          }
        } else if (c.concept === "location" && optStr(c.value)) {
          patches.push({ op: "setHard", key: "location", value: optStr(c.value)!, provenance: provenance("USER_STATED") });
        } else if (c.concept === "category" && optStr(c.value)) {
          patches.push({ op: "setHard", key: "category", value: optStr(c.value)!, provenance: provenance("USER_STATED") });
        }
        break;
      }
      case "subject": {
        const v = optStr(c.value);
        if (v) patches.push({ op: "setSearchSubject", subject: v, provenance: provenance("USER_STATED") });
        break;
      }
      case "preference": {
        if (c.label) patches.push({ op: "addSoft", label: c.label, provenance: provenance("MODEL_INFERRED") });
        break;
      }
      case "exclusion": {
        if (c.label) patches.push({ op: "addExclusion", label: c.label, provenance: provenance("USER_STATED") });
        break;
      }
      case "goal": {
        const v = optStr(c.value);
        if (v) patches.push({ op: "setGoal", goal: v });
        break;
      }
      case "unresolved": {
        if (c.label) patches.push({ op: "addUnresolved", question: c.label });
        break;
      }
      case "retraction": {
        if (c.target === "constraint") {
          if (c.concept === "price") {
            const key = c.boundary === "min" ? "priceMin" : c.boundary === "max" ? "priceMax" : undefined;
            if (key) patches.push({ op: "removeHard", key });
          } else if (c.concept === "location") patches.push({ op: "removeHard", key: "location" });
          else if (c.concept === "category") patches.push({ op: "removeHard", key: "category" });
        } else if (c.target === "subject") patches.push({ op: "removeSearchSubject" });
        else if (c.target === "preference" && c.label) patches.push({ op: "removeSoft", label: c.label });
        else if (c.target === "exclusion" && c.label) patches.push({ op: "removeExclusion", label: c.label });
        break;
      }
      default:
        break;
    }
  }
  return patches;
}

export function semanticDecisionToReasoningDecision(d: SemanticDecision): ReasoningDecision {
  const out: ReasoningDecision = {};
  if (d.text) out.text = d.text;
  if (d.clarification) out.clarification = d.clarification;
  if (d.capabilityRequest) out.capabilityRequest = d.capabilityRequest;
  const patches = claimsToPatches(d.claims);
  if (patches.length) out.statePatches = patches;
  return out;
}

function summarizeStateForClaims(input: ReasoningInput): string {
  const s = input.state;
  const hard = Object.entries(s.hardConstraints).map(([k, v]) => `${k}=${String(v)}`);
  const lines: string[] = [];
  if (s.goal) lines.push(`goal=${s.goal}`);
  if (s.vertical) lines.push(`vertical=${s.vertical}`);
  if (s.searchSubject) lines.push(`searchSubject=${s.searchSubject}`);
  if (hard.length) lines.push(`hard=[${hard.join(", ")}]`);
  if (s.softPreferences.length) lines.push(`soft=[${s.softPreferences.map((p) => p.label).join(", ")}]`);
  if (s.exclusions.length) lines.push(`exclusions=[${s.exclusions.map((e) => e.label).join(", ")}]`);
  if (s.unresolved.length) lines.push(`unresolved=[${s.unresolved.join(" | ")}]`);
  return lines.join("; ") || "(tuščia)";
}

/** Shared R3 user prompt — single source of truth for ALL provider adapters. */
export function buildR3UserPrompt(input: ReasoningInput): string {
  return buildReasoningUserPrompt({
    userTurn: input.userTurn,
    history: input.history,
    stateSummary: summarizeStateForClaims(input),
    capabilities: input.capabilities.map((c) => `${c.name}(${c.operation})`),
    groundedResults: input.groundedResults?.map((g) => (g.ok ? `${g.capability}: ${g.summary ?? ""}` : `${g.capability}: KLAIDA ${g.error ?? ""}`)),
    priorResults: input.priorResults,
  });
}

export type SemanticClaimProvider = (input: ReasoningInput) => Promise<SemanticDecision>;

export interface SemanticClaimAttemptTelemetry {
  attempt: number;
  elapsedMs: number;
  timedOut: boolean;
  status?: number;
  claimCount?: number;
  finishReason?: string;
  blockReason?: string;
  candidateCount?: number;
  parseOutcome?: "ok" | "empty" | "malformed_json" | "schema_invalid";
  capabilityRequested?: string;
}

export interface GeminiSemanticTransportOptions {
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Injected credential; defaults to resolveGeminiApiKey(). */
  apiKey?: string;
  onAttempt?: (t: SemanticClaimAttemptTelemetry) => void;
}

export interface GeminiSemanticTransportResult {
  decision: SemanticDecision;
  rawUsage: Record<string, unknown> | undefined;
  /** Raw model output text (for canonical Arena validation). */
  rawText: string;
  latencyMs: number;
  attempts: number;
}

/**
 * SINGLE authoritative Gemini semantic transport. Both the baseline R3 provider
 * and the Arena metering wrapper use this — no duplicate prompt/schema/parser/
 * request semantics.
 */
export async function callGeminiSemanticTransport(
  input: ReasoningInput,
  opts: GeminiSemanticTransportOptions = {}
): Promise<GeminiSemanticTransportResult> {
  const model = opts.model ?? CORE_V2_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CORE_V2_REASONING_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? CORE_V2_MAX_REASONING_ATTEMPTS;
  const onAttempt = opts.onAttempt;
  const key = opts.apiKey ?? resolveGeminiApiKey();
  if (!key) throw new ProviderFailureError("provider_unavailable", "GEMINI_API_KEY not configured");

  async function attempt(n: number, apiKey: string): Promise<{ decision: SemanticDecision; rawUsage: Record<string, unknown> | undefined; rawText: string }> {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await doFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: R3_SYSTEM_INSTRUCTION }] },
            contents: [{ role: "user", parts: [{ text: buildR3UserPrompt(input) }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: SEMANTIC_CLAIM_SCHEMA },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        }
      );
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        onAttempt?.({ attempt: n, elapsedMs: Date.now() - t0, timedOut: true });
        throw new ProviderFailureError("timeout", "provider timed out");
      }
      onAttempt?.({ attempt: n, elapsedMs: Date.now() - t0, timedOut: false });
      throw new ProviderFailureError("http_error", err instanceof Error ? err.message : "fetch failed");
    }
    if (!res.ok) {
      onAttempt?.({ attempt: n, elapsedMs: Date.now() - t0, timedOut: false, status: res.status });
      throw new ProviderFailureError("http_error", `Gemini HTTP ${res.status}`, res.status);
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
      usageMetadata?: Record<string, unknown>;
    };
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts?.[0]?.text ?? "").trim();
    const finishReason = candidate?.finishReason;
    const blockReason = data.promptFeedback?.blockReason;
    const candidateCount = data.candidates?.length ?? 0;
    if (!text) {
      onAttempt?.({ attempt: n, elapsedMs: Date.now() - t0, timedOut: false, claimCount: 0, finishReason, blockReason, candidateCount, parseOutcome: "empty" });
      return { decision: {}, rawUsage: data.usageMetadata, rawText: text };
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      onAttempt?.({ attempt: n, elapsedMs: Date.now() - t0, timedOut: false, finishReason, blockReason, candidateCount, parseOutcome: "malformed_json" });
      throw new ProviderFailureError("malformed_json", "model output was not valid JSON");
    }
    try {
      const decision = parseSemanticDecision(json);
      onAttempt?.({
        attempt: n,
        elapsedMs: Date.now() - t0,
        timedOut: false,
        claimCount: decision.claims?.length ?? 0,
        finishReason,
        blockReason,
        candidateCount,
        parseOutcome: "ok",
        capabilityRequested: decision.capabilityRequest?.capability,
      });
      return { decision, rawUsage: data.usageMetadata, rawText: text };
    } catch (err) {
      onAttempt?.({ attempt: n, elapsedMs: Date.now() - t0, timedOut: false, finishReason, blockReason, candidateCount, parseOutcome: "schema_invalid" });
      if (err instanceof ProviderFailureError) throw err;
      throw new ProviderFailureError("schema_invalid", err instanceof Error ? err.message : "output failed claim parsing");
    }
  }

  const t0 = Date.now();
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await attempt(i + 1, key);
      return { decision: r.decision, rawUsage: r.rawUsage, rawText: r.rawText, latencyMs: Date.now() - t0, attempts: i + 1 };
    } catch (err) {
      lastErr = err;
      if (!isRetryableFailure(err) || i === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw lastErr;
}

export function createGeminiSemanticClaimProvider(
  opts: {
    model?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxAttempts?: number;
    onAttempt?: (t: SemanticClaimAttemptTelemetry) => void;
  } = {}
): SemanticClaimProvider {
  return async (input: ReasoningInput) => (await callGeminiSemanticTransport(input, opts)).decision;
}
