/**
 * Universal Fact-Evidence Contract — balanced cross-vertical evaluation +
 * semantic hardening matrix (remediation).
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

function evalOnce(
  current: FactEvidence | null,
  incoming: unknown,
  options: Parameters<typeof evaluateFactEvidence>[2] = {}
) {
  return evaluateFactEvidence(current ? { canonical: current, history: [current] } : null, incoming, options);
}

const NON_TRUSTED_SOURCES: readonly FactEvidence["source"][] = [
  "USER_CLAIM",
  "USER_CORRECTION",
  "DOCUMENT_OBSERVATION",
  "VISUAL_OBSERVATION",
  "MODEL_INFERENCE",
  "EXISTING_PERSISTED_VALUE",
];

describe("Universal fact-evidence contract — balanced cross-vertical scenarios", () => {
  it("real_estate: document 62 m² vs user claim 64 m² → CONFLICT, neither silently wins", () => {
    const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "ntr-registras.pdf"), ev("64", "USER_CLAIM"));
    assert.equal(r.decision, "CONFLICT");
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

describe("Blocker 1 — non-trusted sources can never mint or carry INDEPENDENTLY_VERIFIED", () => {
  for (const source of NON_TRUSTED_SOURCES) {
    it(`incoming ${source} + INDEPENDENTLY_VERIFIED fails closed`, () => {
      const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("64", source, "INDEPENDENTLY_VERIFIED"));
      assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
      assert.equal(r.state.canonical?.value, "62", "existing evidence untouched");
      assert.notEqual(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
    });

    it(`current ${source} + INDEPENDENTLY_VERIFIED is untrusted, never authority`, () => {
      const r = evalOnce(ev("x", source, "INDEPENDENTLY_VERIFIED"), ev("y", "USER_CLAIM"));
      assert.equal(r.state.canonical?.value, "y", "corrupted current cannot block or verify");
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
  it("TRUSTED_VERIFICATION without the authenticated flag fails closed", () => {
    const r = evalOnce(null, ver("WBAZZZ8VZM1234567"));
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.match(r.reason, /authenticated verification/i);
    assert.equal(r.state.canonical, null);
  });

  it("TRUSTED_VERIFICATION with a non-verified status fails closed", () => {
    const r = evalOnce(null, ev("WBAZZZ8VZM1234567", "TRUSTED_VERIFICATION", "HUMAN_CONFIRMED"), VERIFIED_OPTIONS);
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
  });

  it("TRUSTED_VERIFICATION consumes an authenticated result and does not authenticate it itself", () => {
    const r = evalOnce(null, ver("WBAZZZ8VZM1234567"), VERIFIED_OPTIONS);
    assert.equal(r.decision, "ACCEPT_VERIFICATION");
    assert.equal(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
    // The contract's own comments document that authentication happened upstream;
    // the flag is the caller's attestation of that upstream boundary.
  });
});

describe("Blocker 3 — trusted verification of a different value is never SAME_VALUE", () => {
  it("same normalized value + verification → SAME_VALUE with a verified upgrade", () => {
    const r = evalOnce(ev("WBAZZZ8VZM1234567", "USER_CLAIM", "HUMAN_CONFIRMED"), ver("WBAZZZ8VZM1234567"), VERIFIED_OPTIONS);
    assert.equal(r.decision, "SAME_VALUE");
    assert.equal(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("different normalized value + verification → ACCEPT_VERIFICATION, prior evidence retained", () => {
    const prior = ver("WBAZZZ8VZM1234567");
    const r = evalOnce(prior, ver("VF3XXXXXXXXX99999"), VERIFIED_OPTIONS);
    assert.equal(r.decision, "ACCEPT_VERIFICATION");
    assert.equal(r.state.canonical?.value, "VF3XXXXXXXXX99999");
    assert.equal(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
    assert.ok(r.state.history.some((e) => e.value === "WBAZZZ8VZM1234567" && e.status === "INDEPENDENTLY_VERIFIED"),
      "prior verified evidence retained in history");
  });

  it("first trusted verification is ACCEPT_VERIFICATION, never SAME_VALUE", () => {
    const r = evalOnce(null, ver("WBAZZZ8VZM1234567"), VERIFIED_OPTIONS);
    assert.equal(r.decision, "ACCEPT_VERIFICATION");
  });
});

describe("Blocker 4 — explicit correction never silently displaces verified evidence", () => {
  it("correction aimed at verified evidence → REQUIRES_REVERIFICATION, both preserved", () => {
    const prior = ver("WBAZZZ8VZM1234567");
    const r = evalOnce(prior, ev("VF3XXXXXXXXX99999", "USER_CLAIM"), { isExplicitCorrection: true });
    assert.equal(r.decision, "REQUIRES_REVERIFICATION");
    assert.equal(r.state.canonical?.value, "WBAZZZ8VZM1234567", "verified value must not be displaced");
    assert.equal(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED", "verified status must not be downgraded");
    assert.ok(r.state.history.some((e) => e.value === "VF3XXXXXXXXX99999" && e.source === "USER_CORRECTION"),
      "correction retained with provenance");
    assert.equal(r.state.history.filter((e) => e.status === "INDEPENDENTLY_VERIFIED").length, 1,
      "verified evidence is neither erased nor duplicated");
  });

  it("correction with human confirmation still does not displace verified evidence", () => {
    const prior = ver("WBAZZZ8VZM1234567");
    const r = evalOnce(prior, ev("VF3XXXXXXXXX99999", "USER_CLAIM"), { isExplicitCorrection: true, isHumanConfirmation: true });
    assert.equal(r.decision, "REQUIRES_REVERIFICATION");
    assert.equal(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("correction of NON-verified evidence still works as ACCEPT_CORRECTION", () => {
    const r = evalOnce(ev("kaunas", "USER_CLAIM"), ev("vilnius", "USER_CLAIM"), { isExplicitCorrection: true });
    assert.equal(r.decision, "ACCEPT_CORRECTION");
  });
});

describe("Blocker 5 — cumulative immutable state and deep independence", () => {
  it("history accumulates across three sequential evaluations", () => {
    let state: FactEvidenceState | null = null;
    const r1 = evaluateFactEvidence(state, ev("62", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "doc"));
    state = r1.state;
    const r2 = evaluateFactEvidence(state, ev("64", "USER_CLAIM"));
    state = r2.state;
    const r3 = evaluateFactEvidence(state, ev("62", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "doc2"));

    assert.equal(r3.state.history.length, 3, "cumulative history across all evaluations");
    assert.equal(r3.state.history[0].value, "62");
    assert.equal(r3.state.history[1].value, "64");
    assert.equal(r3.state.history[2].value, "62");
    assert.equal(r1.state.history.length, 1, "earlier states are not retroactively rebuilt");
    assert.equal(r2.state.history.length, 2);
  });

  it("outputs never share mutable identity with inputs", () => {
    const inputState: FactEvidenceState = {
      canonical: { value: "62", source: "DOCUMENT_OBSERVATION", status: "UNCONFIRMED" },
      history: [{ value: "62", source: "DOCUMENT_OBSERVATION", status: "UNCONFIRMED" }],
    };
    const incoming = { value: "64", source: "USER_CLAIM", status: "UNCONFIRMED" } as FactEvidence;
    const snapshotState = JSON.parse(JSON.stringify(inputState));
    const snapshotIncoming = JSON.parse(JSON.stringify(incoming));

    const r = evaluateFactEvidence(inputState, incoming);

    // Mutate every returned object — nothing else may change.
    r.state.canonical!.value = "MUTATED";
    (r.state.history as FactEvidence[])[0].value = "MUTATED";
    (r.state.history as FactEvidence[]).push({ value: "junk", source: "USER_CLAIM", status: "UNCONFIRMED" });

    assert.deepEqual(inputState, snapshotState, "input state unchanged after output mutation");
    assert.deepEqual(incoming, snapshotIncoming, "input evidence unchanged after output mutation");

    const again = evaluateFactEvidence(inputState, incoming);
    assert.equal(again.state.canonical?.value, "62");
    assert.equal(again.state.history.length, 2);
    assert.deepEqual(inputState, snapshotState, "inputs still unchanged after a second evaluation");
  });
});

describe("Blocker 6 — no universal source-strength hierarchy", () => {
  it("same normalized value keeps the existing canonical regardless of incoming source kind", () => {
    // Persisted must NOT displace a document observation on agreement.
    const r1 = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("62", "EXISTING_PERSISTED_VALUE"));
    assert.equal(r1.decision, "SAME_VALUE");
    assert.equal(r1.state.canonical?.source, "DOCUMENT_OBSERVATION", "existing canonical source preserved");
    // And a document observation must not displace an existing user claim on agreement.
    const r2 = evalOnce(ev("62", "USER_CLAIM"), ev("62", "DOCUMENT_OBSERVATION"));
    assert.equal(r2.decision, "SAME_VALUE");
    assert.equal(r2.state.canonical?.source, "USER_CLAIM", "existing canonical source preserved");
  });

  it("arbitrary incoming status never upgrades the canonical", () => {
    const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("62", "USER_CLAIM", "HUMAN_CONFIRMED"));
    assert.equal(r.decision, "SAME_VALUE");
    assert.equal(r.state.canonical?.status, "UNCONFIRMED",
      "status upgrades only through legitimate transitions");
  });

  it("the explicit human-confirmation flag is a legitimate transition", () => {
    const r = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("62", "USER_CLAIM"), { isHumanConfirmation: true });
    assert.equal(r.state.canonical?.status, "HUMAN_CONFIRMED");
  });
});

describe("Blocker 7 — runtime validation", () => {
  it("empty string value is rejected", () => {
    const r = evalOnce(null, ev("", "USER_CLAIM"));
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
  });

  it("whitespace-only value is rejected", () => {
    const r = evalOnce(null, ev("   ", "USER_CLAIM"));
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
  });

  it("non-string value is rejected", () => {
    const r = evalOnce(null, { value: 123, source: "USER_CLAIM", status: "UNCONFIRMED" });
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.match(r.reason, /not a string/);
  });

  it("non-object incoming is rejected", () => {
    const r = evalOnce(null, "some-string" as unknown);
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
  });

  it("malformed current state: corrupted canonical becomes absent, never authority", () => {
    const r = evaluateFactEvidence(
      { canonical: { value: "bad", source: "USER_CLAIM", status: "INDEPENDENTLY_VERIFIED" } as FactEvidence, history: [] },
      ev("y", "USER_CLAIM")
    );
    assert.equal(r.state.canonical?.value, "y", "corrupted verified-claim cannot block new evidence");
  });

  it("malformed history entries are dropped safely", () => {
    const r = evaluateFactEvidence(
      {
        canonical: ev("62", "DOCUMENT_OBSERVATION"),
        history: [
          ev("62", "DOCUMENT_OBSERVATION"),
          { value: "", source: "USER_CLAIM", status: "UNCONFIRMED" } as FactEvidence,
          { value: "x", source: "HACKED" as FactEvidence["source"], status: "UNCONFIRMED" } as FactEvidence,
        ],
      },
      ev("64", "USER_CLAIM")
    );
    assert.equal(r.decision, "CONFLICT");
    assert.equal(r.state.history.length, 2, "only valid history entries survive");
  });

  it("unknown incoming source and status still fail closed", () => {
    const r1 = evalOnce(null, { value: "v", source: "HACKED" as FactEvidence["source"], status: "UNCONFIRMED" });
    assert.equal(r1.decision, "REJECT_UNSUPPORTED_INFERENCE");
    const r2 = evalOnce(null, { value: "v", source: "USER_CLAIM", status: "MAGIC" as FactEvidence["status"] });
    assert.equal(r2.decision, "REJECT_UNSUPPORTED_INFERENCE");
  });
});

describe("Blocker 8 — full negative matrix and semantic rules that must remain", () => {
  it("persistence is not verification", () => {
    const r = evalOnce(null, ev("62", "EXISTING_PERSISTED_VALUE"));
    assert.equal(r.state.canonical?.status, "UNCONFIRMED");
  });

  it("canonical is not verification", () => {
    const r = evalOnce(null, ev("62", "USER_CLAIM", "HUMAN_CONFIRMED"), { isHumanConfirmation: true });
    assert.equal(r.state.canonical?.status, "HUMAN_CONFIRMED");
    assert.notEqual(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("correction intent is never inferred from a differing value alone", () => {
    const r = evalOnce(ev("kaunas", "USER_CLAIM"), ev("vilnius", "USER_CLAIM"));
    assert.equal(r.decision, "CONFLICT");
  });

  it("model inference cannot establish, overwrite or verify", () => {
    const r1 = evalOnce(null, ev("x", "MODEL_INFERENCE"));
    assert.equal(r1.decision, "INSUFFICIENT_EVIDENCE");
    const r2 = evalOnce(ev("verified-value-1", "USER_CLAIM", "HUMAN_CONFIRMED"), ev("other", "MODEL_INFERENCE"));
    assert.equal(r2.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(r2.state.canonical?.value, "verified-value-1");
  });

  it("visual observations remain observations", () => {
    const r = evalOnce(null, ev("wood", "VISUAL_OBSERVATION"));
    assert.equal(r.state.canonical?.status, "UNCONFIRMED");
    assert.notEqual(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("never mutates its inputs (deep-frozen)", () => {
    const current = Object.freeze({ ...ev("62", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "doc.pdf") });
    const incoming = Object.freeze({ ...ev("64", "USER_CLAIM") });
    evaluateFactEvidence({ canonical: current, history: [current] }, incoming);
    assert.deepEqual(current, { value: "62", source: "DOCUMENT_OBSERVATION", status: "UNCONFIRMED", reason: "doc.pdf" });
    assert.deepEqual(incoming, { value: "64", source: "USER_CLAIM", status: "UNCONFIRMED" });
  });

  it("deterministic repeated execution produces identical results", () => {
    const args = () => evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("64", "USER_CLAIM"));
    assert.deepEqual(args(), args());
  });

  it("normalization is supplied by the caller — the contract never normalizes", () => {
    const unnormalized = evalOnce(ev("62 m²", "DOCUMENT_OBSERVATION"), ev("62m2", "USER_CLAIM"));
    assert.equal(unnormalized.decision, "CONFLICT", "contract must not hide normalization");
    const normalized = evalOnce(ev("62", "DOCUMENT_OBSERVATION"), ev("62", "USER_CLAIM"));
    assert.equal(normalized.decision, "SAME_VALUE");
  });

  it("explicit correction of verified evidence never erases verified provenance", () => {
    const prior = ver("WBAZZZ8VZM1234567");
    const r = evalOnce(prior, ev("VF3XXXXXXXXX99999", "USER_CLAIM"), { isExplicitCorrection: true });
    assert.equal(r.decision, "REQUIRES_REVERIFICATION");
    assert.equal(r.state.history[0].value, "WBAZZZ8VZM1234567");
    assert.equal(r.state.history[0].status, "INDEPENDENTLY_VERIFIED");
  });
});
