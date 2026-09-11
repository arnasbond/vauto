/**
 * R2.8 — preserve confirmed-description authority through unrelated AI
 * processing.
 *
 * The runAiProcessing preservation branch must carry the preserved
 * description's confirmationToken + provenanceToken + truthful origin
 * (MODEL_INFERENCE) together with the text — never drop the authority, never
 * relabel to USER_CLAIM.
 *
 * Source-contract test: the merge branch is a React closure and the repo has no
 * component renderer, so we assert the exact production code path carries the
 * authority. The publish-decision semantics are separately covered by the
 * server-side pipeline-b-provenance-token-r24 suite.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const SELLER_SRC = readFileSync(
  new URL("../../context/SellerFlowContext.tsx", import.meta.url),
  "utf8"
);

function preservationBranch(): string {
  const marker = "human authority preservation";
  const idx = SELLER_SRC.indexOf(marker);
  assert.ok(idx !== -1, "preservation branch marker not found");
  return SELLER_SRC.slice(idx, idx + 4500);
}

describe("R2.8 — preservation branch keeps confirmed authority + truthful origin", () => {
  it("carries over the preserved confirmationToken", () => {
    const branch = preservationBranch();
    assert.match(branch, /preservedAttrs\.confirmationToken = prevConfirmation/);
  });

  it("carries over the preserved provenanceToken (AI lineage)", () => {
    const branch = preservationBranch();
    assert.match(branch, /preservedAttrs\.provenanceToken = prevProvenance/);
  });

  it("keeps AI-origin as MODEL_INFERENCE (never relabels to USER_CLAIM)", () => {
    const branch = preservationBranch();
    assert.match(branch, /"MODEL_INFERENCE"/);
    assert.ok(
      !/"USER_CLAIM"/.test(branch),
      "preservation branch must not relabel to USER_CLAIM"
    );
  });
});
