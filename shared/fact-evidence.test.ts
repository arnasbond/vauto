/**
 * Universal Fact-Evidence Contract — balanced cross-vertical evaluation +
 * semantic, state-invariant and closure hardening (final remediation).
 *
 * Category-neutral proofs only: the contract has no vertical knowledge, so
 * every scenario here passes category/field names ONLY as test labels.
 *
 * Repository-native co-located pattern (same as marketplace-domain tests):
 * run from the server package with `npx tsx --test ../shared/fact-evidence.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateFactEvidence,
  type FactDecision,
  type FactEvidence,
  type FactEvidenceState,
} from "./fact-evidence.ts";

const ev = (
  value: string,
  source: FactEvidence["source"],
  status: FactEvidence["status"] = "UNCONFIRMED",
  reason?: string
): FactEvidence => ({ value, source, status, ...(reason ? { reason } : {}) });

const ver = (value: string, reason?: string): FactEvidence =>
  ev(value, "TRUSTED_VERIFICATION", "INDEPENDENTLY_VERIFIED", reason);

const VERIFIED_OPTIONS = { authenticatedVerification: true } as const;

function validState(canonical: FactEvidence | null, history: readonly FactEvidence[]): FactEvidenceState {
  return { validity: "VALID", canonical, history };
}

function invalidState(history: readonly FactEvidence[], error: string): FactEvidenceState {
  return { validity: "INVALID", canonical: null, history, error };
}

function evalOnce(
  current: FactEvidence | null,
  incoming: unknown,
  options: Parameters<typeof evaluateFactEvidence>[2] = {}
) {
  return evaluateFactEvidence(
    current ? validState(current, [current]) : null,
    incoming,
    options
  );
}

const NON_TRUSTED_SOURCES: readonly FactEvidence["source"][] = [
  "USER_CLAIM",
  "USER_CORRECTION",
  "DOCUMENT_OBSERVATION",
  "VISUAL_OBSERVATION",
  "MODEL_INFERENCE",
  "EXISTING_PERSISTED_VALUE",
];

/**
 * Attempt an unsafe mutation of a frozen output. In strict mode it throws; in
 * sloppy mode the assignment silently has no effect. The essential proof is
 * that the mutation has NO EFFECT — verified unconditionally afterwards.
 */
function assertFrozenMutationRejected(target: object, mutate: (t: never) => void, verify: () => void) {
  try {
    mutate(target as never);
  } catch {
    /* strict-mode throw = rejection */
  }
  verify();
}

describe("Universal fact-evidence contract — balanced cross-vertical scenarios", () => {
  it("real_estate: document 62 m² vs user claim 64 m² → CONFLICT, neither silently wins", () => {
    const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "ntr-registras.pdf"), ev("64", "USER_CLAIM"));
    assert.equal(r.decision, "CONFLICT");
    assert.equal(r.state.validity, "VALID");
    assert.equal(r.state.canonical?.value, "62", "existing evidence stays canonical");
    assert.equal(r.conflictWith?.value, "64");
  });

  it("electronics: label 128 GB vs model inference 256 GB → unsupported overwrite rejected", () => {
    const r = evalOnce(ev("128", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "etikete.jpg"), ev("256", "MODEL_INFERENCE"));
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(r.state.canonical?.value, "128", "label observation preserved");
  });

  it("clothing: label L vs explicit correction M → ACCEPT_CORRECTION as a human claim", () => {
    const r = evalOnce(
      ev("L", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "care-label"),
      ev("M", "USER_CLAIM", "HUMAN_CONFIRMED"),
      { isExplicitCorrection: true, isHumanConfirmation: true }
    );
    assert.equal(r.decision, "ACCEPT_CORRECTION");
    assert.equal(r.state.canonical?.value, "M");
    assert.equal(r.state.canonical?.source, "USER_CORRECTION");
    assert.equal(r.state.canonical?.status, "HUMAN_CONFIRMED", "confirmation is a claim, not verification");
  });

  it("services: claim Kaunas then explicit correction Vilnius → ACCEPT_CORRECTION, no false conflict", () => {
    const r = evalOnce(ev("kaunas", "USER_CLAIM"), ev("vilnius", "USER_CLAIM"), { isExplicitCorrection: true });
    assert.equal(r.decision, "ACCEPT_CORRECTION");
    assert.equal(r.state.canonical?.value, "vilnius");
    assert.equal(r.state.canonical?.status, "UNCONFIRMED", "correction without confirmation is not confirmed");
  });

  it("jobs: persisted 'office' vs user claim 'remote' without correction intent → CONFLICT", () => {
    const r = evalOnce(ev("office", "EXISTING_PERSISTED_VALUE"), ev("remote", "USER_CLAIM"));
    assert.equal(r.decision, "CONFLICT", "persisted value is not verified authority");
    assert.equal(r.state.canonical?.value, "office");
  });

  it("transport (equal reference): claim 160000 km then non-explicit 180000 km → CONFLICT", () => {
    const r = evalOnce(ev("160000", "USER_CLAIM"), ev("180000", "USER_CLAIM"));
    assert.equal(r.decision, "CONFLICT");
    assert.equal(r.state.canonical?.value, "160000");
    assert.equal(r.conflictWith?.value, "180000");
  });

  it("home/garden: visual 'wood' vs user claim 'laminate' → CONFLICT; observation is never verified", () => {
    const r = evalOnce(ev("wood", "VISUAL_OBSERVATION"), ev("laminate", "USER_CLAIM"));
    assert.equal(r.decision, "CONFLICT");
    assert.notEqual(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED", "visual observation never verifies");
  });

  it("unknown/future category: model inference alone → INSUFFICIENT_EVIDENCE, no canonical verified value", () => {
    const r = evalOnce(null, ev("whatever", "MODEL_INFERENCE"));
    assert.equal(r.decision, "INSUFFICIENT_EVIDENCE");
    assert.equal(r.state.canonical, null, "nothing may be stored canonically");
  });
});

describe("Correction 1 — same-value trusted verification produces a VALID canonical", () => {
  it("canonical after verified upgrade is a valid TRUSTED_VERIFICATION + INDEPENDENTLY_VERIFIED record", () => {
    const r = evalOnce(ev("WBAZZZ8VZM1234567", "USER_CLAIM", "HUMAN_CONFIRMED"), ver("WBAZZZ8VZM1234567"), VERIFIED_OPTIONS);
    assert.equal(r.decision, "SAME_VALUE");
    assert.equal(r.state.canonical?.source, "TRUSTED_VERIFICATION");
    assert.equal(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("the returned state re-validates across a second and third evaluation (multi-turn regression)", () => {
    const s1 = evalOnce(null, ev("WBAZZZ8VZM1234567", "USER_CLAIM"), { isHumanConfirmation: true });
    const s2 = evaluateFactEvidence(s1.state, ver("WBAZZZ8VZM1234567"), VERIFIED_OPTIONS);
    assert.equal(s2.decision, "SAME_VALUE");
    assert.equal(s2.state.canonical?.source, "TRUSTED_VERIFICATION");

    const s3 = evaluateFactEvidence(s2.state, ev("WBAZZZ8VZM1234567", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "doc.pdf"));
    assert.equal(s3.decision, "SAME_VALUE", "third evaluation must not reject its own prior state");
    assert.equal(s3.state.canonical?.source, "TRUSTED_VERIFICATION", "verified canonical preserved");
    assert.equal(s3.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
    assert.equal(s3.state.history.length, 3, "cumulative history: claim + verification + document");
  });

  it("prior claim remains separately in cumulative history after verification", () => {
    const r = evalOnce(ev("WBAZZZ8VZM1234567", "USER_CLAIM"), ver("WBAZZZ8VZM1234567"), VERIFIED_OPTIONS);
    assert.ok(
      r.state.history.some((e) => e.source === "USER_CLAIM" && e.value === "WBAZZZ8VZM1234567"),
      "the original claim is retained as a separate history record"
    );
  });
});

describe("Correction 2 — first evidence never returns SAME_VALUE", () => {
  it("first user claim → ACCEPT_EVIDENCE", () => {
    assert.equal(evalOnce(null, ev("62", "USER_CLAIM")).decision, "ACCEPT_EVIDENCE");
  });
  it("first document observation → ACCEPT_EVIDENCE", () => {
    assert.equal(evalOnce(null, ev("62", "DOCUMENT_OBSERVATION")).decision, "ACCEPT_EVIDENCE");
  });
  it("first visual observation → ACCEPT_EVIDENCE", () => {
    assert.equal(evalOnce(null, ev("wood", "VISUAL_OBSERVATION")).decision, "ACCEPT_EVIDENCE");
  });
  it("first persisted value → ACCEPT_EVIDENCE (not verification)", () => {
    const r = evalOnce(null, ev("office", "EXISTING_PERSISTED_VALUE"));
    assert.equal(r.decision, "ACCEPT_EVIDENCE");
    assert.equal(r.state.canonical?.status, "UNCONFIRMED");
  });
  it("first model inference → INSUFFICIENT_EVIDENCE", () => {
    assert.equal(evalOnce(null, ev("x", "MODEL_INFERENCE")).decision, "INSUFFICIENT_EVIDENCE");
  });
  it("first trusted verification → ACCEPT_VERIFICATION", () => {
    assert.equal(evalOnce(null, ver("WBAZZZ8VZM1234567"), VERIFIED_OPTIONS).decision, "ACCEPT_VERIFICATION");
  });
  it("SAME_VALUE occurs only when two equal normalized values were compared", () => {
    const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("62", "USER_CLAIM"));
    assert.equal(r.decision, "SAME_VALUE");
  });
});

describe("Correction 3 — no history deduplication; every valid event preserved in order", () => {
  it("the same input object twice yields two separately cloned history records", () => {
    const reused = { value: "62", source: "DOCUMENT_OBSERVATION", status: "UNCONFIRMED" } as FactEvidence;
    const s1 = evaluateFactEvidence(null, reused);
    const s2 = evaluateFactEvidence(s1.state, reused);
    assert.equal(s2.state.history.length, 2, "both events must remain");
    assert.notEqual(s2.state.history[0], s2.state.history[1], "two separate defensive clones, not aliases");
    assert.equal(s2.state.history[0].value, "62");
    assert.equal(s2.state.history[1].value, "62");
    assert.notEqual(s2.state.history[0], reused, "no alias to the input object");
    assert.notEqual(s2.state.history[1], reused, "no alias to the input object");
  });
});

describe("Correction 4 — immutability is honest and enforceable", () => {
  it("all nested outputs are frozen; unsafe mutation is rejected or ineffective", () => {
    const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("64", "USER_CLAIM"));
    assertFrozenMutationRejected(r, (x) => { x.decision = "CONFLICT" as FactDecision; }, () => assert.equal(r.decision, "CONFLICT"));
    assertFrozenMutationRejected(r.state, (x) => { x.canonical = null; }, () => assert.equal(r.state.canonical?.value, "62"));
    assertFrozenMutationRejected(r.state.canonical!, (x) => { x.value = "MUTATED"; }, () => assert.equal(r.state.canonical?.value, "62"));
    assertFrozenMutationRejected(r.state.history, (x) => { (x as FactEvidence[])[0] = ev("junk", "USER_CLAIM"); }, () => assert.equal(r.state.history[0].value, "62"));
    assertFrozenMutationRejected(r.state.history[0], (x) => { x.value = "MUTATED"; }, () => assert.equal(r.state.history[0].value, "62"));
    assertFrozenMutationRejected(r.conflictWith!, (x) => { x.value = "MUTATED"; }, () => assert.equal(r.conflictWith?.value, "64"));

    assert.equal(r.state.canonical?.value, "62");
    assert.equal(r.state.history[0].value, "62");
    assert.equal(r.conflictWith?.value, "64");

    const again = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("64", "USER_CLAIM"));
    assert.equal(again.decision, "CONFLICT");
    assert.equal(again.state.canonical?.value, "62");
  });

  it("no output shares mutable identity with inputs or between logical slots", () => {
    const current = ev("62", "DOCUMENT_OBSERVATION");
    const incoming = ev("64", "USER_CLAIM");
    const r = evaluateFactEvidence(validState(current, [current]), incoming);
    assert.notEqual(r.state.canonical, current);
    assert.notEqual(r.state.history[0], current);
    assert.notEqual(r.conflictWith, incoming);
    assert.notEqual(r.state.history[1], incoming);
  });
});

describe("Invalid-state closure — malformed prior states fail closed and STAY closed", () => {
  it("A: malformed state → INVALID_STATE → next user claim → still INVALID_STATE", () => {
    const badCanonical = { value: "bad", source: "USER_CLAIM", status: "INDEPENDENTLY_VERIFIED" } as FactEvidence;
    const verified = ver("WBAZZZ8VZM1234567");
    const first = evaluateFactEvidence(
      validState(badCanonical, [badCanonical, verified]),
      ev("y", "USER_CLAIM")
    );
    assert.equal(first.decision, "INVALID_STATE");
    assert.equal(first.state.validity, "INVALID");
    const second = evaluateFactEvidence(first.state, ev("z", "USER_CLAIM"));
    assert.equal(second.decision, "INVALID_STATE", "INVALID must never silently become VALID");
    assert.equal(second.state.validity, "INVALID");
    assert.equal(second.state.canonical, null, "no new claim may become canonical");
    assert.match(second.reason, /canonical|verified/i);
  });

  it("B: invalid state with verified history retains that history across three subsequent evaluations", () => {
    const badCanonical = { value: "bad", source: "USER_CLAIM", status: "INDEPENDENTLY_VERIFIED" } as FactEvidence;
    const verified = ver("WBAZZZ8VZM1234567");
    let state: FactEvidenceState | null = validState(badCanonical, [badCanonical, verified]);
    for (let i = 0; i < 3; i++) {
      const r = evaluateFactEvidence(state, ev(`claim-${i}`, "USER_CLAIM"));
      assert.equal(r.decision, "INVALID_STATE");
      assert.ok(r.state.history.some((e) => e.source === "TRUSTED_VERIFICATION" && e.value === "WBAZZZ8VZM1234567"),
        `verified evidence must be preserved at step ${i}`);
      state = r.state;
    }
    assert.equal(state!.validity, "INVALID");
  });

  it("C: missing canonical property → INVALID_STATE", () => {
    const r = evaluateFactEvidence({ validity: "VALID", history: [] } as never, ev("y", "USER_CLAIM"));
    assert.equal(r.decision, "INVALID_STATE");
    assert.match(r.reason, /missing canonical/i);
    assert.equal(r.state.canonical, null);
  });

  it("D: canonical: undefined → INVALID_STATE", () => {
    const r = evaluateFactEvidence(
      { validity: "VALID", canonical: undefined, history: [] } as never,
      ev("y", "USER_CLAIM")
    );
    assert.equal(r.decision, "INVALID_STATE");
    assert.match(r.reason, /undefined/i);
  });

  it("E: missing/unknown validity discriminator → INVALID_STATE", () => {
    const missing = evaluateFactEvidence(
      { canonical: null, history: [] } as never,
      ev("y", "USER_CLAIM")
    );
    assert.equal(missing.decision, "INVALID_STATE");
    assert.match(missing.reason, /discriminator/);
    const unknown = evaluateFactEvidence(
      { validity: "WEIRD", canonical: null, history: [] } as never,
      ev("y", "USER_CLAIM")
    );
    assert.equal(unknown.decision, "INVALID_STATE");
    assert.match(unknown.reason, /discriminator/);
  });

  it("F: VALID + canonical:null + verified history → INVALID_STATE", () => {
    const r = evaluateFactEvidence(
      validState(null, [ver("WBAZZZ8VZM1234567")]),
      ev("y", "USER_CLAIM")
    );
    assert.equal(r.decision, "INVALID_STATE");
    assert.match(r.reason, /canonical-capable evidence/);
    assert.equal(r.state.canonical, null, "a new claim must never silently become canonical");
    assert.ok(r.state.history.some((e) => e.source === "TRUSTED_VERIFICATION"), "verified evidence preserved");
  });

  it("G: VALID + canonical:null + ordinary evidence history → INVALID_STATE (not contract-produced)", () => {
    for (const source of ["USER_CLAIM", "USER_CORRECTION", "DOCUMENT_OBSERVATION", "VISUAL_OBSERVATION", "EXISTING_PERSISTED_VALUE"] as FactEvidence["source"][]) {
      const r = evaluateFactEvidence(
        validState(null, [ev("62", source)]),
        ev("64", "USER_CLAIM")
      );
      assert.equal(r.decision, "INVALID_STATE", `${source} history without canonical must not accept a new claim`);
      assert.equal(r.state.canonical, null);
    }
  });

  it("H: VALID + canonical:null + model-inference-only history remains valid and accepts credible evidence later", () => {
    const s1 = evalOnce(null, ev("x", "MODEL_INFERENCE"));
    assert.equal(s1.decision, "INSUFFICIENT_EVIDENCE");
    assert.equal(s1.state.validity, "VALID");
    assert.equal(s1.state.canonical, null);
    const s2 = evaluateFactEvidence(s1.state, ev("62", "USER_CLAIM"));
    assert.equal(s2.decision, "ACCEPT_EVIDENCE", "inference-only history is a legitimate noncanonical state");
    assert.equal(s2.state.canonical?.value, "62");
  });

  it("I: every decision result feeds into the next evaluation with closure", () => {
    const cases: Array<{ name: string; state: FactEvidenceState | null; incoming: unknown; options?: Parameters<typeof evaluateFactEvidence>[2]; decision: FactDecision }> = [
      { name: "ACCEPT_EVIDENCE", state: null, incoming: ev("62", "USER_CLAIM"), decision: "ACCEPT_EVIDENCE" },
      { name: "SAME_VALUE", state: validState(ev("62", "DOCUMENT_OBSERVATION"), [ev("62", "DOCUMENT_OBSERVATION")]), incoming: ev("62", "USER_CLAIM"), decision: "SAME_VALUE" },
      { name: "ACCEPT_CORRECTION", state: validState(ev("kaunas", "USER_CLAIM"), [ev("kaunas", "USER_CLAIM")]), incoming: ev("vilnius", "USER_CLAIM"), options: { isExplicitCorrection: true }, decision: "ACCEPT_CORRECTION" },
      { name: "CONFLICT", state: validState(ev("62", "DOCUMENT_OBSERVATION"), [ev("62", "DOCUMENT_OBSERVATION")]), incoming: ev("64", "USER_CLAIM"), decision: "CONFLICT" },
      { name: "INSUFFICIENT_EVIDENCE", state: null, incoming: ev("x", "MODEL_INFERENCE"), decision: "INSUFFICIENT_EVIDENCE" },
      { name: "REJECT_UNSUPPORTED_INFERENCE", state: validState(ev("62", "DOCUMENT_OBSERVATION"), [ev("62", "DOCUMENT_OBSERVATION")]), incoming: ev("64", "MODEL_INFERENCE"), decision: "REJECT_UNSUPPORTED_INFERENCE" },
      { name: "ACCEPT_VERIFICATION", state: validState(ver("A"), [ver("A")]), incoming: ver("B"), options: VERIFIED_OPTIONS, decision: "ACCEPT_VERIFICATION" },
      { name: "REQUIRES_REVERIFICATION", state: validState(ver("A"), [ver("A")]), incoming: ev("B", "USER_CLAIM"), options: { isExplicitCorrection: true }, decision: "REQUIRES_REVERIFICATION" },
      { name: "INVALID_STATE", state: invalidState([ver("A")], "boom"), incoming: ev("B", "USER_CLAIM"), decision: "INVALID_STATE" },
    ];
    for (const c of cases) {
      const r = evaluateFactEvidence(c.state, c.incoming, c.options ?? {});
      assert.equal(r.decision, c.decision, c.name);
      const next = evaluateFactEvidence(r.state, ev("after", "USER_CLAIM"));
      if (c.decision === "INVALID_STATE") {
        assert.equal(next.decision, "INVALID_STATE", `${c.name} must stay INVALID`);
        assert.equal(next.state.validity, "INVALID");
      } else {
        assert.notEqual(next.decision, "INVALID_STATE", `${c.name} must re-validate as VALID (got: ${next.reason})`);
        assert.equal(next.state.validity, "VALID");
      }
    }
  });

  it("J: state/result immutability and cumulative history remain intact with the discriminator", () => {
    const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("64", "USER_CLAIM"));
    assertFrozenMutationRejected(r.state, (x) => { (x as { validity?: string }).validity = "INVALID"; }, () => assert.equal(r.state.validity, "VALID"));
    assertFrozenMutationRejected(r.state, (x) => { x.canonical = null; }, () => assert.equal(r.state.canonical?.value, "62"));
    const inv = evaluateFactEvidence(
      validState({ value: "bad", source: "USER_CLAIM", status: "INDEPENDENTLY_VERIFIED" } as FactEvidence, [ver("A")]),
      ev("y", "USER_CLAIM")
    );
    assert.equal(inv.state.validity, "INVALID");
    assert.ok(typeof (inv.state as { error?: string }).error === "string" && (inv.state as { error: string }).error.length > 0, "INVALID carries an explicit error");
    const cumulative = evaluateFactEvidence(
      validState(ev("62", "DOCUMENT_OBSERVATION"), [ev("62", "DOCUMENT_OBSERVATION")]),
      ev("64", "USER_CLAIM")
    );
    assert.equal(cumulative.state.history.length, 2);
  });
});

describe("Blocker 1 — non-trusted sources can never mint or carry INDEPENDENTLY_VERIFIED", () => {
  for (const source of NON_TRUSTED_SOURCES) {
    it(`incoming ${source} + INDEPENDENTLY_VERIFIED fails closed`, () => {
      const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("64", source, "INDEPENDENTLY_VERIFIED"));
      assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
      assert.equal(r.state.canonical?.value, "62");
      assert.notEqual(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
    });

    it(`current ${source} + INDEPENDENTLY_VERIFIED → INVALID_STATE (never authority)`, () => {
      const bad = ev("x", source, "INDEPENDENTLY_VERIFIED");
      const r = evaluateFactEvidence(validState(bad, [bad]), ev("y", "USER_CLAIM"));
      assert.equal(r.decision, "INVALID_STATE");
      assert.equal(r.state.canonical, null);
    });
  }

  it("all non-trusted sources + verified status + every option combination stays unverified", () => {
    for (const source of NON_TRUSTED_SOURCES) {
      for (const opts of [{}, { isExplicitCorrection: true }, { isHumanConfirmation: true }, { isHumanConfirmation: true, isExplicitCorrection: true }]) {
        const r = evalOnce(null, ev("v", source, "INDEPENDENTLY_VERIFIED"), opts);
        assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE", `${source} with ${JSON.stringify(opts)}`);
        assert.notEqual(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
      }
    }
  });
});

describe("Blocker 2 — TRUSTED_VERIFICATION is semantic input, not authentication", () => {
  it("without the authenticated flag fails closed", () => {
    const r = evalOnce(null, ver("WBAZZZ8VZM1234567"));
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.match(r.reason, /authenticated verification/i);
  });

  it("with a non-verified status fails closed", () => {
    const r = evalOnce(null, ev("WBAZZZ8VZM1234567", "TRUSTED_VERIFICATION", "HUMAN_CONFIRMED"), VERIFIED_OPTIONS);
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
  });
});

describe("Blocker 3/4 — verification vs correction semantics", () => {
  it("different value + verification → ACCEPT_VERIFICATION, prior retained", () => {
    const r = evalOnce(ver("WBAZZZ8VZM1234567"), ver("VF3XXXXXXXXX99999"), VERIFIED_OPTIONS);
    assert.equal(r.decision, "ACCEPT_VERIFICATION");
    assert.equal(r.state.canonical?.value, "VF3XXXXXXXXX99999");
    assert.ok(r.state.history.some((e) => e.value === "WBAZZZ8VZM1234567" && e.status === "INDEPENDENTLY_VERIFIED"));
  });

  it("explicit correction against verified evidence → REQUIRES_REVERIFICATION, both preserved", () => {
    const prior = ver("WBAZZZ8VZM1234567");
    const r = evalOnce(prior, ev("VF3XXXXXXXXX99999", "USER_CLAIM"), { isExplicitCorrection: true });
    assert.equal(r.decision, "REQUIRES_REVERIFICATION");
    assert.equal(r.state.canonical?.value, "WBAZZZ8VZM1234567");
    assert.equal(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
    assert.ok(r.state.history.some((e) => e.source === "USER_CORRECTION" && e.value === "VF3XXXXXXXXX99999"));
  });
});

describe("Remaining semantic rules", () => {
  it("same normalized value keeps the existing canonical regardless of incoming source kind", () => {
    const r1 = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("62", "EXISTING_PERSISTED_VALUE"));
    assert.equal(r1.decision, "SAME_VALUE");
    assert.equal(r1.state.canonical?.source, "DOCUMENT_OBSERVATION");
    const r2 = evalOnce(ev("62", "USER_CLAIM"), ev("62", "DOCUMENT_OBSERVATION"));
    assert.equal(r2.decision, "SAME_VALUE");
    assert.equal(r2.state.canonical?.source, "USER_CLAIM");
  });

  it("arbitrary incoming status never upgrades the canonical", () => {
    const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("62", "USER_CLAIM", "HUMAN_CONFIRMED"));
    assert.equal(r.state.canonical?.status, "UNCONFIRMED");
  });

  it("explicit human-confirmation flag is a legitimate transition", () => {
    const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("62", "USER_CLAIM"), { isHumanConfirmation: true });
    assert.equal(r.state.canonical?.status, "HUMAN_CONFIRMED");
  });

  it("empty / whitespace / non-string values are rejected", () => {
    assert.equal(evalOnce(null, ev("", "USER_CLAIM")).decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(evalOnce(null, ev("   ", "USER_CLAIM")).decision, "REJECT_UNSUPPORTED_INFERENCE");
    const r = evalOnce(null, { value: 123, source: "USER_CLAIM", status: "UNCONFIRMED" });
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.match(r.reason, /not a string/);
  });

  it("unknown incoming source/status fail closed", () => {
    assert.equal(evalOnce(null, { value: "v", source: "HACKED" as FactEvidence["source"], status: "UNCONFIRMED" }).decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(evalOnce(null, { value: "v", source: "USER_CLAIM", status: "MAGIC" as FactEvidence["status"] }).decision, "REJECT_UNSUPPORTED_INFERENCE");
  });

  it("persistence and canonical are not verification", () => {
    const r1 = evalOnce(null, ev("62", "EXISTING_PERSISTED_VALUE"));
    assert.equal(r1.state.canonical?.status, "UNCONFIRMED");
    const r2 = evalOnce(null, ev("62", "USER_CLAIM"), { isHumanConfirmation: true });
    assert.equal(r2.state.canonical?.status, "HUMAN_CONFIRMED");
    assert.notEqual(r2.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("correction intent is never inferred from a differing value alone", () => {
    assert.equal(evalOnce(ev("kaunas", "USER_CLAIM"), ev("vilnius", "USER_CLAIM")).decision, "CONFLICT");
  });

  it("model inference cannot establish, overwrite or verify", () => {
    assert.equal(evalOnce(null, ev("x", "MODEL_INFERENCE")).decision, "INSUFFICIENT_EVIDENCE");
    const r = evalOnce(ev("A", "USER_CLAIM", "HUMAN_CONFIRMED"), ev("B", "MODEL_INFERENCE"));
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(r.state.canonical?.value, "A");
  });

  it("visual observations remain observations", () => {
    const r = evalOnce(null, ev("wood", "VISUAL_OBSERVATION"));
    assert.equal(r.state.canonical?.status, "UNCONFIRMED");
  });

  it("never mutates its inputs (deep-frozen)", () => {
    const current = Object.freeze({ ...ev("62", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "doc.pdf") });
    const incoming = Object.freeze({ ...ev("64", "USER_CLAIM") });
    evaluateFactEvidence(validState(current, [current]), incoming);
    assert.deepEqual(current, { value: "62", source: "DOCUMENT_OBSERVATION", status: "UNCONFIRMED", reason: "doc.pdf" });
    assert.deepEqual(incoming, { value: "64", source: "USER_CLAIM", status: "UNCONFIRMED" });
  });

  it("deterministic repeated execution produces identical results", () => {
    const args = () => evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("64", "USER_CLAIM"));
    assert.deepEqual(args(), args());
  });

  it("normalization is supplied by the caller — the contract never normalizes", () => {
    assert.equal(evalOnce(ev("62 m²", "DOCUMENT_OBSERVATION"), ev("62m2", "USER_CLAIM")).decision, "CONFLICT");
    assert.equal(evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("62", "USER_CLAIM")).decision, "SAME_VALUE");
  });
});

describe("Mandatory adversarial sequences A–H (cross-vertical flow proofs)", () => {
  it("A: USER_CLAIM → same-value authenticated verification → later different user claim", () => {
    const s1 = evaluateFactEvidence(null, ev("WBAZZZ8VZM1234567", "USER_CLAIM"), { isHumanConfirmation: true });
    assert.equal(s1.decision, "ACCEPT_EVIDENCE");
    const s2 = evaluateFactEvidence(s1.state, ver("WBAZZZ8VZM1234567"), VERIFIED_OPTIONS);
    assert.equal(s2.decision, "SAME_VALUE");
    assert.equal(s2.state.canonical?.source, "TRUSTED_VERIFICATION");
    const s3 = evaluateFactEvidence(s2.state, ev("VF3XXXXXXXXX99999", "USER_CLAIM"));
    assert.equal(s3.decision, "CONFLICT", "verified canonical preserved; the differing claim conflicts");
    assert.equal(s3.state.canonical?.value, "WBAZZZ8VZM1234567");
    assert.equal(s3.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("B: DOCUMENT_OBSERVATION → human confirmation → same-value verification → explicit correction", () => {
    const s1 = evaluateFactEvidence(null, ev("62", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "ntr.pdf"));
    const s2 = evaluateFactEvidence(s1.state, ev("62", "USER_CLAIM"), { isHumanConfirmation: true });
    assert.equal(s2.decision, "SAME_VALUE");
    assert.equal(s2.state.canonical?.status, "HUMAN_CONFIRMED");
    const s3 = evaluateFactEvidence(s2.state, ver("62"), VERIFIED_OPTIONS);
    assert.equal(s3.decision, "SAME_VALUE");
    assert.equal(s3.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
    const s4 = evaluateFactEvidence(s3.state, ev("64", "USER_CLAIM"), { isExplicitCorrection: true });
    assert.equal(s4.decision, "REQUIRES_REVERIFICATION");
    assert.equal(s4.state.canonical?.value, "62");
    assert.equal(s4.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("C: reused evidence object added twice to history", () => {
    const reused = ev("62", "DOCUMENT_OBSERVATION");
    const s1 = evaluateFactEvidence(null, reused);
    const s2 = evaluateFactEvidence(s1.state, reused);
    assert.equal(s2.state.history.length, 2);
    assert.notEqual(s2.state.history[0], s2.state.history[1]);
    assert.notEqual(s2.state.history[0], reused);
  });

  it("D: malformed canonical + valid verified history + new user claim → INVALID_STATE", () => {
    const bad = { value: "bad", source: "USER_CLAIM", status: "INDEPENDENTLY_VERIFIED" } as FactEvidence;
    const verified = ver("WBAZZZ8VZM1234567");
    const r = evaluateFactEvidence(validState(bad, [bad, verified]), ev("y", "USER_CLAIM"));
    assert.equal(r.decision, "INVALID_STATE");
    assert.equal(r.state.canonical, null);
    assert.ok(r.state.history.some((e) => e.source === "TRUSTED_VERIFICATION"));
  });

  it("E: valid canonical absent from history → INVALID_STATE", () => {
    const r = evaluateFactEvidence(validState(ev("62", "DOCUMENT_OBSERVATION"), []), ev("64", "USER_CLAIM"));
    assert.equal(r.decision, "INVALID_STATE");
  });

  it("F: non-trusted INDEPENDENTLY_VERIFIED entry hidden inside history → INVALID_STATE", () => {
    const hidden = { value: "x", source: "MODEL_INFERENCE", status: "INDEPENDENTLY_VERIFIED" } as FactEvidence;
    const r = evaluateFactEvidence(validState(null, [ev("62", "DOCUMENT_OBSERVATION"), hidden]), ev("64", "USER_CLAIM"));
    assert.equal(r.decision, "INVALID_STATE");
  });

  it("G: attempted mutation of every returned nested object is rejected or ineffective", () => {
    const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("64", "USER_CLAIM"));
    assertFrozenMutationRejected(r, (x) => { x.decision = "SAME_VALUE" as FactDecision; }, () => assert.equal(r.decision, "CONFLICT"));
    assertFrozenMutationRejected(r.state, (x) => { (x as { canonical: unknown }).canonical = null; }, () => assert.equal(r.state.canonical?.value, "62"));
    assertFrozenMutationRejected(r.state.canonical!, (x) => { x.value = "X"; }, () => assert.equal(r.state.canonical?.value, "62"));
    assertFrozenMutationRejected(r.state.history, (x) => { (x as FactEvidence[])[0] = ev("j", "USER_CLAIM"); }, () => assert.equal(r.state.history[0].value, "62"));
    assertFrozenMutationRejected(r.state.history[0], (x) => { x.value = "X"; }, () => assert.equal(r.state.history[0].value, "62"));
    assertFrozenMutationRejected(r.conflictWith!, (x) => { x.value = "X"; }, () => assert.equal(r.conflictWith?.value, "64"));
    const again = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("64", "USER_CLAIM"));
    assert.equal(again.decision, "CONFLICT");
    assert.equal(again.state.canonical?.value, "62");
    assert.equal(again.conflictWith?.value, "64");
  });

  it("H: every returned decision state feeds into the next evaluation as valid input", () => {
    const scenarios: Array<{ state: FactEvidenceState | null; incoming: unknown; options?: Parameters<typeof evaluateFactEvidence>[2]; expectDecision: FactDecision }> = [
      { state: null, incoming: ev("62", "USER_CLAIM"), expectDecision: "ACCEPT_EVIDENCE" },
      { state: null, incoming: ev("62", "DOCUMENT_OBSERVATION"), expectDecision: "ACCEPT_EVIDENCE" },
      { state: null, incoming: ev("62", "EXISTING_PERSISTED_VALUE"), expectDecision: "ACCEPT_EVIDENCE" },
      { state: null, incoming: ev("62", "VISUAL_OBSERVATION"), expectDecision: "ACCEPT_EVIDENCE" },
      { state: null, incoming: ev("x", "MODEL_INFERENCE"), expectDecision: "INSUFFICIENT_EVIDENCE" },
      { state: null, incoming: ver("WBAZZZ8VZM1234567"), options: VERIFIED_OPTIONS, expectDecision: "ACCEPT_VERIFICATION" },
    ];
    for (const sc of scenarios) {
      const r = evaluateFactEvidence(sc.state, sc.incoming, sc.options ?? {});
      assert.equal(r.decision, sc.expectDecision);
      const next = evaluateFactEvidence(r.state, ev("64", "USER_CLAIM"));
      assert.notEqual(next.decision, "INVALID_STATE",
        `state produced by ${r.decision} must re-validate (got INVALID_STATE: ${next.reason})`);
    }
  });
});
