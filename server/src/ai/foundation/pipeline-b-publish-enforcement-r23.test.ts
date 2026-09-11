/**
 * R2.3 — description provenance AUTHORITY (not just a label).
 *
 * MODEL_INFERENCE is a non-canonical proposal. It must be explicitly promoted
 * (user edit/acceptance → USER_CORRECTION) before it may become canonical
 * listing content. The authoritative server publish boundary must reject an
 * unpromoted MODEL_INFERENCE description.
 *
 * Tests cross the boundary as far as practical without a full HTTP harness:
 * the pure authority predicate/promotion helpers + a source-contract that the
 * real POST /listings handler consumes them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  isUnpromotedModelInference,
  promoteDescriptionSourceForUserEdit,
} from "../../shared/description-provenance.js";

const API_SRC = readFileSync(
  new URL("../../routes/api.ts", import.meta.url),
  "utf8"
);

describe("R2.3 — description provenance authority (predicate)", () => {
  it("MODEL_INFERENCE is unpromoted (must not publish canonically)", () => {
    assert.equal(isUnpromotedModelInference("MODEL_INFERENCE"), true);
  });

  it("grounded / user-authorized / absent sources are NOT unpromoted", () => {
    for (const s of ["USER_CLAIM", "USER_CORRECTION", "HUMAN_CONFIRMED", "DOCUMENT_OBSERVATION", "VISUAL_OBSERVATION", undefined, null, ""]) {
      assert.equal(isUnpromotedModelInference(s), false, String(s));
    }
  });

  it("a user edit/acceptance promotes to USER_CORRECTION", () => {
    assert.equal(promoteDescriptionSourceForUserEdit(), "USER_CORRECTION");
  });
});

describe("R2.3/R2.4 — server publish boundary consumes the provenance guard", () => {
  it("POST /listings derives authority from the server-issued token, not the label", () => {
    assert.match(API_SRC, /resolveDescriptionPublishDecision/, "handler must use the decision function");
    assert.match(API_SRC, /description_unpromoted/, "handler must emit a rejection code");
    assert.match(API_SRC, /description_provenance_invalid/, "handler must reject tampered tokens");
    assert.ok(!/isUnpromotedModelInference\(/.test(API_SRC), "handler must not rely on the mutable descriptionSource label");
  });
});
