/**
 * F2.2 — structured fact-evidence projection through the real server path:
 *
 *   mergeFieldCandidates → buildSellDraft → SellDraftSchema → sellDraftToIntelDraft
 *
 * The cumulative F2.1 `FactEvidenceState` must survive every hop: canonical
 * value, provenance, status, cumulative history, last decision, the competing
 * value+source of an active conflict, and the human-review signal. The schema
 * validates fail-closed; the intel projection keeps conflicts/provenance/
 * review; legacy drafts without the optional state stay compatible; the
 * structured state never reaches the model-visible context slice.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeFieldCandidates, type FieldCandidate } from "../field-merge.js";
import { buildSellDraft } from "../visual-sell-engine.js";
import { parseSellDraft } from "../sell-draft-schema.js";
import { sellDraftToIntelDraft } from "../sell-to-intel.js";
import { slimListingDraftForLlm } from "../../../shared/llm-context-slice.js";
import type { SellFieldSource } from "../sell-types.js";
import type { FactEvidenceState } from "../../../shared/fact-evidence.js";

function candidate<T>(
  value: T,
  source: SellFieldSource,
  confidence = 0.9,
  evidence?: string[]
): FieldCandidate<T> {
  return { value, source, confidence, evidence };
}

function validStateOf(
  r: ReturnType<typeof mergeFieldCandidates<unknown>>
): FactEvidenceState {
  assert.ok(r.factEvidence, "structured projection must be present");
  assert.equal(r.factEvidence.state.validity, "VALID");
  return r.factEvidence.state;
}

const NO_TRUSTED_MARKERS = (json: string) =>
  !/TRUSTED_VERIFICATION/.test(json) &&
  !/INDEPENDENTLY_VERIFIED/.test(json);

describe("F2.2 — 7-vertical structured projection matrix (merge boundary)", () => {
  const VERTICALS = [
    {
      vertical: "transportas",
      key: "attributes.mileage",
      same: ["120000", "120000"] as [string, string],
      different: ["120000", "95000"] as [string, string],
    },
    {
      vertical: "nekilnojamasis turtas",
      key: "attributes.area",
      same: ["62", "62"] as [string, string],
      different: ["62", "75"] as [string, string],
    },
    {
      vertical: "elektronika",
      key: "attributes.storageGb",
      same: [128, 128] as [number, number],
      different: [128, 256] as [number, number],
    },
    {
      vertical: "drabužiai",
      key: "attributes.size",
      same: ["M", "  m "] as [string, string],
      different: ["M", "L"] as [string, string],
    },
    {
      vertical: "bendros prekės",
      key: "title",
      same: ["Sofa kampinė", "sofa kampinė"] as [string, string],
      different: ["Sofa kampinė", "Lova dvigulė"] as [string, string],
    },
    {
      vertical: "paslaugos",
      key: "attributes.workType",
      same: ["santechnika", "Santechnika "] as [string, string],
      different: ["santechnika", "elektros instaliacija"] as [string, string],
    },
    {
      vertical: "darbai",
      key: "attributes.salary",
      same: [2000, 2000] as [number, number],
      different: [2000, 2500] as [number, number],
    },
  ] as const;

  for (const v of VERTICALS) {
    it(`${v.vertical}: two equal normalized values do NOT create a conflict`, () => {
      const r = mergeFieldCandidates(
        v.key,
        [
          candidate(v.same[0], "TEXT", 0.9),
          candidate(v.same[1], "VISION", 0.8),
        ] as Array<FieldCandidate<string | number>>
      );
      assert.equal(r.conflict, false, "equal values must not conflict");
      const state = validStateOf(r as ReturnType<typeof mergeFieldCandidates<unknown>>);
      assert.ok(state.canonical, "canonical must exist");
      assert.equal(state.canonical!.source, "USER_CLAIM", "TEXT wins precedence");
      assert.ok(
        r.factEvidence!.lastDecision === "SAME_VALUE" ||
          r.factEvidence!.lastDecision === "ACCEPT_EVIDENCE",
        r.factEvidence!.lastDecision
      );
      assert.equal(r.factEvidence!.conflictWith, undefined);
    });

    it(`${v.vertical}: differing credible values create a persistent conflict`, () => {
      const r = mergeFieldCandidates(
        v.key,
        [
          candidate(v.different[0], "TEXT", 0.9),
          candidate(v.different[1], "VISION", 0.8),
        ] as Array<FieldCandidate<string | number>>
      );
      assert.equal(r.conflict, true);
      const state = validStateOf(r as ReturnType<typeof mergeFieldCandidates<unknown>>);
      assert.ok(state.canonical, "canonical must exist");
      assert.equal(
        state.canonical!.source,
        "USER_CLAIM",
        "higher-precedence value stays canonical"
      );
      assert.ok(r.factEvidence!.conflictWith, "competing evidence must be carried");
      // String values are trim/lowercased by the merge normalization; primitive
      // values carry their type token ("number:256") per the F2.1 contract.
      const expectedCompeting =
        typeof v.different[1] === "string"
          ? v.different[1].trim().toLowerCase()
          : `number:${String(v.different[1])}`;
      assert.equal(
        r.factEvidence!.conflictWith!.value,
        expectedCompeting,
        "competing value preserved"
      );
      assert.equal(r.factEvidence!.reviewRequired, true);
      assert.equal(r.field.requiresConfirmation, true);
    });
  }

  it("canonical value is never silently overwritten by the losing candidate", () => {
    const r = mergeFieldCandidates("attributes.mileage", [
      candidate("120000", "TEXT", 0.9),
      candidate("95000", "VISION", 0.95),
    ]);
    assert.equal(r.field.value, "120000");
    const state = validStateOf(r as ReturnType<typeof mergeFieldCandidates<unknown>>);
    assert.equal(state.canonical!.value, "120000");
  });
});

describe("F2.2 — authority rules through the projection", () => {
  it("model inference cannot gain human or verified status", () => {
    const r = mergeFieldCandidates("brand", [candidate("BMW", "COMBINED", 0.95)]);
    const state = validStateOf(r as ReturnType<typeof mergeFieldCandidates<unknown>>);
    // Lone inference establishes NO canonical authority (contract rule).
    assert.equal(state.canonical, null);
    for (const entry of state.history) {
      assert.equal(entry.source, "MODEL_INFERENCE");
      assert.equal(entry.status, "UNCONFIRMED");
    }
  });

  it("manual entry can only be HUMAN_CONFIRMED, never INDEPENDENTLY_VERIFIED", () => {
    const r = mergeFieldCandidates("brand", [candidate("BMW", "USER_PROVIDED", 0.95)]);
    const state = validStateOf(r as ReturnType<typeof mergeFieldCandidates<unknown>>);
    assert.equal(state.canonical?.status, "HUMAN_CONFIRMED");
    assert.notEqual(state.canonical?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("no source can mint TRUSTED_VERIFICATION through the merge seam", () => {
    const sources: SellFieldSource[] = [
      "USER_PROVIDED",
      "TEXT",
      "VOICE",
      "COMBINED",
      "VISION",
      "OCR_UNTRUSTED",
    ];
    for (const source of sources) {
      const r = mergeFieldCandidates("brand", [candidate("BMW", source, 0.9)]);
      if (r.factEvidence) {
        assert.notEqual(
          r.factEvidence.state.canonical?.source,
          "TRUSTED_VERIFICATION",
          source
        );
      }
    }
  });
});

describe("F2.2 — full path: buildSellDraft → schema → sellDraftToIntelDraft", () => {
  it("conflict projection survives the real path and the intel draft keeps it", async () => {
    process.env.AI_MODEL_VISION = "foundation-vision-alias";
    process.env.AI_MODEL_FALLBACK = "foundation-fallback-alias";

    const draft = await buildSellDraft({
      input: {
        text: "Parduodu BMW e46",
        imageUrls: ["https://cdn.example.com/car.jpg"],
      },
      visionExtractor: async () => ({ visualBrand: "Audi", confidence: 0.8 }),
      imageSafetyProvider: async () => ({ safe: true, reasons: [] }),
    });

    const projection = draft.factEvidence?.brand;
    assert.ok(projection, "brand projection must exist");
    assert.equal(projection.state.validity, "VALID");
    assert.equal(projection.state.canonical?.value, "bmw");
    assert.ok(projection.conflictWith, "conflicting evidence carried");
    assert.equal(projection.conflictWith!.value, "audi");
    assert.equal(projection.lastDecision, "CONFLICT");
    assert.equal(projection.reviewRequired, true);

    // Schema validation passes on the engine-produced structured state.
    const reparsed = parseSellDraft(draft as unknown as Record<string, unknown>);
    assert.ok(reparsed.factEvidence?.brand, "schema keeps the projection");

    // The whole draft never contains trusted-verification authority.
    assert.ok(
      NO_TRUSTED_MARKERS(JSON.stringify(draft)),
      "no TRUSTED_VERIFICATION / INDEPENDENTLY_VERIFIED anywhere in the draft"
    );

    const intel = sellDraftToIntelDraft(draft);
    const brandIntel = intel.fields.brand;
    assert.ok(brandIntel, "intel field exists");
    assert.ok(brandIntel.conflicts.length >= 1, "conflict preserved in intel draft");
    const conflict = brandIntel.conflicts[brandIntel.conflicts.length - 1]!;
    assert.equal(conflict.fieldKey, "brand");
    assert.equal(conflict.candidates.length, 2);
    assert.match(conflict.message, /bmw.*audi/i);
    assert.equal(brandIntel.requiresReview, true, "review signal preserved");
    assert.equal(brandIntel.reviewState, "NEEDS_REVIEW");
    assert.equal(brandIntel.provenance, "USER_TEXT", "legacy provenance preserved");
    assert.equal(intel.requiresReview, true);
  });

  it("legacy drafts without the optional state remain fully compatible", () => {
    const legacy = parseSellDraft({
      category: {
        value: "vehicles",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: false,
      },
      title: {
        value: "BMW e46",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: false,
      },
      attributes: {},
      missing: ["price"],
      warnings: [],
      requiresUserConfirmation: true,
      autoPublish: false,
      foundationVersion: "F2",
    });
    assert.equal(legacy.factEvidence, undefined, "optional state absent");
    const intel = sellDraftToIntelDraft(legacy);
    assert.equal(intel.fields.title?.value, "BMW e46");
    assert.equal(intel.fields.title?.conflicts.length, 0);
    assert.equal(intel.requiresReview, true, "legacy HITL gate intact");
  });
});

describe("F2.2 — schema fail-closed validation", () => {
  const baseDraft = () =>
    ({
      category: {
        value: "vehicles",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: false,
      },
      title: {
        value: "BMW e46",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: false,
      },
      attributes: {},
      missing: ["price"],
      warnings: [],
      requiresUserConfirmation: true,
      autoPublish: false,
      foundationVersion: "F2",
    }) as Record<string, unknown>;

  const evidence = (over: Record<string, unknown> = {}) => ({
    value: "bmw",
    source: "USER_CLAIM",
    status: "UNCONFIRMED",
    ...over,
  });

  const validProjection = (over: Record<string, unknown> = {}) => ({
    state: {
      validity: "VALID",
      canonical: evidence({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
      history: [evidence({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" })],
    },
    lastDecision: "ACCEPT_EVIDENCE",
    reviewRequired: false,
    ...over,
  });

  it("accepts a well-formed structured projection", () => {
    const draft = parseSellDraft({
      ...baseDraft(),
      factEvidence: { brand: validProjection() },
    });
    assert.equal(draft.factEvidence?.brand?.lastDecision, "ACCEPT_EVIDENCE");
  });

  it("rejects unknown source variants", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: validProjection({
            state: {
              validity: "VALID",
              canonical: evidence({ source: "HACKER_SOURCE" }),
              history: [evidence({ source: "HACKER_SOURCE" })],
            },
          }),
        },
      })
    );
  });

  it("rejects an untrusted source declaring INDEPENDENTLY_VERIFIED", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: validProjection({
            state: {
              validity: "VALID",
              canonical: evidence({ status: "INDEPENDENTLY_VERIFIED" }),
              history: [evidence({ status: "INDEPENDENTLY_VERIFIED" })],
            },
          }),
        },
      })
    );
  });

  it("rejects a VALID state with null canonical over canonical-capable history", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: validProjection({
            state: {
              validity: "VALID",
              canonical: null,
              history: [evidence({ source: "USER_CLAIM" })],
            },
          }),
        },
      })
    );
  });

  it("rejects a VALID state whose canonical is not represented in history", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: validProjection({
            state: {
              validity: "VALID",
              canonical: evidence({ value: "audi" }),
              history: [evidence({ value: "bmw" })],
            },
          }),
        },
      })
    );
  });

  it("rejects an INVALID state with a non-null canonical", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: validProjection({
            state: {
              validity: "INVALID",
              canonical: evidence(),
              history: [],
              error: "boom",
            },
          }),
        },
      })
    );
  });

  it("rejects unknown decision variants", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: { brand: validProjection({ lastDecision: "PUBLISH" }) },
      })
    );
  });

  it("rejects unbounded history (more than 24 records)", () => {
    const history = Array.from({ length: 25 }, (_, i) =>
      evidence({ value: `v${i}`, source: "MODEL_INFERENCE" })
    );
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: validProjection({
            state: { validity: "VALID", canonical: null, history },
          }),
        },
      })
    );
  });
});

describe("F2.2 — trusted verification authority boundary (Atlas blocker 1)", () => {
  const baseDraft = () =>
    ({
      category: {
        value: "vehicles",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: false,
      },
      title: {
        value: "BMW e46",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: false,
      },
      attributes: {},
      missing: ["price"],
      warnings: [],
      requiresUserConfirmation: true,
      autoPublish: false,
      foundationVersion: "F2",
    }) as Record<string, unknown>;

  const evidence = (over: Record<string, unknown> = {}) => ({
    value: "bmw",
    source: "USER_CLAIM",
    status: "UNCONFIRMED",
    ...over,
  });

  const trustedEvidence = () =>
    evidence({ source: "TRUSTED_VERIFICATION", status: "INDEPENDENTLY_VERIFIED" });

  it("rejects a forged trusted pair in canonical", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: {
            state: {
              validity: "VALID",
              canonical: trustedEvidence(),
              history: [trustedEvidence()],
            },
            lastDecision: "ACCEPT_EVIDENCE",
            reviewRequired: false,
          },
        },
      })
    );
  });

  it("rejects a forged trusted pair in history", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: {
            state: {
              validity: "VALID",
              canonical: evidence({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
              history: [evidence({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }), trustedEvidence()],
            },
            lastDecision: "ACCEPT_EVIDENCE",
            reviewRequired: false,
          },
        },
      })
    );
  });

  it("rejects a forged trusted pair in conflictWith", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: {
            state: {
              validity: "VALID",
              canonical: evidence({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
              history: [evidence({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }), evidence({ value: "audi", source: "VISUAL_OBSERVATION" })],
            },
            lastDecision: "CONFLICT",
            conflictWith: trustedEvidence(),
            conflictOriginalValue: "Audi",
            reviewRequired: true,
          },
        },
      })
    );
  });

  it("rejects ACCEPT_VERIFICATION even with a well-formed state", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: {
            state: {
              validity: "VALID",
              canonical: evidence({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
              history: [evidence({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" })],
            },
            lastDecision: "ACCEPT_VERIFICATION",
            reviewRequired: false,
          },
        },
      })
    );
  });

  it("rejects INDEPENDENTLY_VERIFIED status even when reviewRequired is false", () => {
    assert.throws(() =>
      parseSellDraft({
        ...baseDraft(),
        factEvidence: {
          brand: {
            state: {
              validity: "VALID",
              canonical: evidence({ source: "USER_CLAIM", status: "INDEPENDENTLY_VERIFIED" }),
              history: [evidence({ source: "USER_CLAIM", status: "INDEPENDENTLY_VERIFIED" })],
            },
            lastDecision: "ACCEPT_EVIDENCE",
            reviewRequired: false,
          },
        },
      })
    );
  });

  it("verification is never conflated with human confirmation at the intel layer", () => {
    const draft = parseSellDraft({
      ...baseDraft(),
      factEvidence: {
        title: {
          state: {
            validity: "VALID",
            canonical: evidence({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
            history: [evidence({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" })],
          },
          lastDecision: "ACCEPT_EVIDENCE",
          reviewRequired: false,
        },
      },
    });
    const intel = sellDraftToIntelDraft(draft);
    assert.equal(intel.fields.title?.reviewState, "AI_SUGGESTED");
    assert.notEqual(intel.fields.title?.reviewState, "HUMAN_CONFIRMED");
  });
});

describe("F2.2 — typed conflict values in the intel layer (Atlas blocker 2)", () => {
  const baseDraft = () =>
    ({
      category: {
        value: "jobs",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: false,
      },
      title: {
        value: "Pardavėjas",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: false,
      },
      attributes: {},
      missing: ["price"],
      warnings: [],
      requiresUserConfirmation: true,
      autoPublish: false,
      foundationVersion: "F2",
    }) as Record<string, unknown>;

  const ev = (over: Record<string, unknown> = {}) => ({
    value: "number:2000",
    source: "USER_CLAIM",
    status: "UNCONFIRMED",
    ...over,
  });

  it("numeric conflicts keep number values and never leak normalization tokens", () => {
    const draft = parseSellDraft({
      ...baseDraft(),
      attributes: {
        salary: {
          value: 2000,
          confidence: 0.9,
          source: "TEXT",
          requiresConfirmation: true,
          evidence: ["salary"],
        },
      },
      factEvidence: {
        "attributes.salary": {
          state: {
            validity: "VALID",
            canonical: ev({ value: "number:2000", source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
            history: [
              ev({ value: "number:2000", source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
              ev({ value: "number:2500", source: "VISUAL_OBSERVATION" }),
            ],
          },
          lastDecision: "CONFLICT",
          conflictWith: ev({ value: "number:2500", source: "VISUAL_OBSERVATION" }),
          conflictOriginalValue: 2500,
          reviewRequired: true,
        },
      },
    });
    const intel = sellDraftToIntelDraft(draft);
    const field = intel.fields["attributes.salary"]!;
    assert.ok(field.conflicts.length >= 1);
    const candidates = field.conflicts[field.conflicts.length - 1]!.candidates;
    assert.equal(typeof candidates[0].value, "number");
    assert.equal(candidates[0].value, 2000);
    assert.equal(typeof candidates[1].value, "number");
    assert.equal(candidates[1].value, 2500);
    assert.ok(!/number:/.test(JSON.stringify(intel)), "no internal tokens in intel layer");
    assert.ok(!/reference:/.test(JSON.stringify(intel)));
    assert.ok(!/number:/.test(field.conflicts[0]!.message), "no tokens in conflict message");
  });

  it("string conflicts keep the safe original values", () => {
    const draft = parseSellDraft({
      ...baseDraft(),
      attributes: {},
      title: {
        value: "Sofa kampinė",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: true,
        evidence: ["title"],
      },
      factEvidence: {
        title: {
          state: {
            validity: "VALID",
            canonical: ev({ value: "sofa kampinė", source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
            history: [
              ev({ value: "sofa kampinė", source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
              ev({ value: "lova", source: "VISUAL_OBSERVATION" }),
            ],
          },
          lastDecision: "CONFLICT",
          conflictWith: ev({ value: "lova", source: "VISUAL_OBSERVATION" }),
          conflictOriginalValue: "Lova dvigulė",
          reviewRequired: true,
        },
      },
    });
    const intel = sellDraftToIntelDraft(draft);
    const field = intel.fields.title!;
    const candidates = field.conflicts[field.conflicts.length - 1]!.candidates;
    assert.equal(candidates[0].value, "Sofa kampinė");
    assert.equal(candidates[1].value, "Lova dvigulė");
    assert.match(field.conflicts[0]!.message, /Sofa kampinė.*Lova dvigulė/i);
  });

  it("object-like original values fail closed: null candidate + forced review", () => {
    const draft = parseSellDraft({
      ...baseDraft(),
      factEvidence: {
        title: {
          state: {
            validity: "VALID",
            canonical: ev({ value: "reference:1", source: "MODEL_INFERENCE", status: "UNCONFIRMED" }),
            history: [
              ev({ value: "reference:1", source: "MODEL_INFERENCE", status: "UNCONFIRMED" }),
              ev({ value: "reference:2", source: "MODEL_INFERENCE", status: "UNCONFIRMED" }),
            ],
          },
          lastDecision: "CONFLICT",
          conflictWith: ev({ value: "reference:2", source: "MODEL_INFERENCE", status: "UNCONFIRMED" }),
          reviewRequired: true,
        },
      },
    });
    const intel = sellDraftToIntelDraft(draft);
    const field = intel.fields.title!;
    const candidates = field.conflicts[field.conflicts.length - 1]!.candidates;
    assert.equal(candidates[1].value, null, "no invented typed value");
    assert.equal(field.requiresReview, true);
    assert.equal(field.reviewState, "NEEDS_REVIEW");
  });
});

describe("F2.2 — evidence reason bound (Atlas blocker 4)", () => {
  it("long evidence from the adapter is bounded, schema-accepted, unicode-safe", () => {
    const longEvidence = (n: number, char: string) =>
      Array.from({ length: n }, () => char.repeat(100));

    // 2 and 12 long entries through the REAL merge → adapter boundary.
    for (const count of [2, 12]) {
      const r = mergeFieldCandidates(
        "title",
        [
          {
            value: "Sofa",
            source: "TEXT",
            confidence: 0.9,
            evidence: longEvidence(count, "ž"),
          },
          {
            value: "Sofa",
            source: "VISION",
            confidence: 0.8,
            evidence: longEvidence(count, "😀"),
          },
        ]
      );
      assert.ok(r.factEvidence, "projection present");
      for (const entry of r.factEvidence.state.history) {
        if (entry.reason !== undefined) {
          assert.ok(entry.reason.length <= 240, `reason ${entry.reason.length} > 240`);
          assert.ok(!entry.reason.includes("\uFFFD"), "no unicode corruption");
        }
      }
      // The bounded reason passes the schema boundary (draft stays legal).
      const draft = parseSellDraft({
        category: {
          value: "goods",
          confidence: 0.9,
          source: "TEXT",
          requiresConfirmation: false,
        },
        title: {
          value: "Sofa",
          confidence: 0.9,
          source: "TEXT",
          requiresConfirmation: true,
          evidence: ["x"],
        },
        attributes: {},
        missing: ["price"],
        warnings: [],
        requiresUserConfirmation: true,
        autoPublish: false,
        foundationVersion: "F2",
        factEvidence: { title: r.factEvidence },
      });
      assert.ok(draft.factEvidence?.title, "schema accepts bounded reason");
    }
  });
});

describe("F2.2 — conflictOriginalValue fail-closed type boundary (final Atlas blocker)", () => {
  const baseDraft = () =>
    ({
      category: {
        value: "goods",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: false,
      },
      title: {
        value: "Sofa kampinė",
        confidence: 0.9,
        source: "TEXT",
        requiresConfirmation: true,
        evidence: ["title"],
      },
      attributes: {},
      missing: ["price"],
      warnings: [],
      requiresUserConfirmation: true,
      autoPublish: false,
      foundationVersion: "F2",
    }) as Record<string, unknown>;

  const ev = (over: Record<string, unknown> = {}) => ({
    value: "sofa kampinė",
    source: "USER_CLAIM",
    status: "UNCONFIRMED",
    ...over,
  });

  const projectionWith = (conflictOriginalValue: unknown) => ({
    state: {
      validity: "VALID",
      canonical: ev({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
      history: [
        ev({ source: "USER_CLAIM", status: "HUMAN_CONFIRMED" }),
        ev({ value: "lova", source: "VISUAL_OBSERVATION" }),
      ],
    },
    lastDecision: "CONFLICT",
    conflictWith: ev({ value: "lova", source: "VISUAL_OBSERVATION" }),
    conflictOriginalValue,
    reviewRequired: true,
  });

  it("schema rejects objects, arrays, NaN, ±Infinity and null as conflictOriginalValue", () => {
    const rejected = [
      {},
      { nested: "value" },
      [],
      ["x"],
      NaN,
      Infinity,
      -Infinity,
      null,
    ];
    for (const bad of rejected) {
      assert.throws(
        () =>
          parseSellDraft({
            ...baseDraft(),
            factEvidence: { title: projectionWith(bad) },
          }),
        `turi būti atmesta: ${JSON.stringify(bad)}`
      );
    }
  });

  it("schema accepts string, finite number and boolean conflictOriginalValue", () => {
    const accepted: unknown[] = ["Lova dvigulė", 2500, true];
    for (const good of accepted) {
      const draft = parseSellDraft({
        ...baseDraft(),
        factEvidence: { title: projectionWith(good) },
      });
      assert.equal(draft.factEvidence?.title?.conflictOriginalValue, good);
    }
    // Absence of the optional field stays legal.
    const absent = parseSellDraft({
      ...baseDraft(),
      factEvidence: { title: { ...projectionWith(undefined), conflictOriginalValue: undefined } },
    });
    assert.equal(absent.factEvidence?.title?.conflictOriginalValue, undefined);
  });

  it("merge omits unsupported original values from the projection (fail-closed)", () => {
    const r = mergeFieldCandidates(
      "title",
      [
        { value: { a: 1 }, source: "TEXT", confidence: 0.9 },
        { value: { b: 2 }, source: "VISION", confidence: 0.8 },
      ] as Array<FieldCandidate<unknown>>
    );
    assert.equal(r.conflict, true);
    assert.ok(r.factEvidence, "projection present");
    assert.equal(
      "conflictOriginalValue" in r.factEvidence,
      false,
      "unsupported original value must be omitted, never invented"
    );
  });

  it("unsupported original values reach the intel layer as null + NEEDS_REVIEW without tokens", () => {
    const draft = parseSellDraft({
      ...baseDraft(),
      factEvidence: {
        title: {
          state: {
            validity: "VALID",
            canonical: ev({ value: "reference:1", source: "MODEL_INFERENCE", status: "UNCONFIRMED" }),
            history: [
              ev({ value: "reference:1", source: "MODEL_INFERENCE", status: "UNCONFIRMED" }),
              ev({ value: "reference:2", source: "MODEL_INFERENCE", status: "UNCONFIRMED" }),
            ],
          },
          lastDecision: "CONFLICT",
          conflictWith: ev({ value: "reference:2", source: "MODEL_INFERENCE", status: "UNCONFIRMED" }),
          reviewRequired: true,
        },
      },
    });
    const intel = sellDraftToIntelDraft(draft);
    const field = intel.fields.title!;
    const candidates = field.conflicts[field.conflicts.length - 1]!.candidates;
    assert.equal(candidates[1].value, null, "null candidate, never a token or object");
    assert.equal(field.requiresReview, true);
    assert.equal(field.reviewState, "NEEDS_REVIEW");
    assert.ok(!/number:|reference:/.test(JSON.stringify(intel)), "no normalization tokens");
    assert.ok(!/number:|reference:/.test(field.conflicts[0]!.message), "no tokens in the message");
  });
});

describe("F2.2 — structured state never reaches the model-visible slice", () => {
  it("slimListingDraftForLlm excludes factEvidence and verified vocabulary", async () => {
    process.env.AI_MODEL_VISION = "foundation-vision-alias";
    process.env.AI_MODEL_FALLBACK = "foundation-fallback-alias";

    const draft = await buildSellDraft({
      input: {
        text: "Parduodu BMW e46",
        imageUrls: ["https://cdn.example.com/car.jpg"],
      },
      visionExtractor: async () => ({ visualBrand: "Audi", confidence: 0.8 }),
      imageSafetyProvider: async () => ({ safe: true, reasons: [] }),
    });

    const slim = slimListingDraftForLlm(draft as unknown as Record<string, unknown>);
    assert.ok(slim, "slim slice produced");
    const json = JSON.stringify(slim);
    assert.ok(!json.includes("factEvidence"), "no structured state in slim slice");
    assert.ok(!json.includes("conflictWith"), "no competing evidence in slim slice");
    assert.ok(
      NO_TRUSTED_MARKERS(json),
      "no verification vocabulary in the model-visible slice"
    );
  });
});
