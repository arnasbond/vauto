import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyVinExtractionCandidate,
  applyVinManualEntryCandidate,
  applyVinStructuredReviewAction,
  confirmVin,
  deriveVinReviewState,
} from "../vin-review.js";

/**
 * Phase 2C — client/server contract parity (REQUIRED 30).
 *
 * The SINGLE authoritative implementation lives at repo-root `shared/vin-review.ts`
 * (+ `shared/vin-utils.ts`); the client imports it directly via
 * `@vauto/shared/vin-review`. The server uses the committed mirror at
 * `server/src/shared/vin-review.ts` (server tsc rootDir cannot reach outside
 * `server/src/`, matching the existing marketplace-domain mirror pattern).
 *
 * This test enforces the mirror CANNOT drift:
 *  1. byte-identity: the mirror must be character-identical to the root source
 *     (after CRLF→LF normalization), so both trees execute identical logic; and
 *  2. a deterministic scenario matrix run against the server module proves the
 *     reducer behavior the client will see (the client loads the same bytes).
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../../");

function lfNormalized(file: string): string {
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

describe("Phase 2C contract parity — enforced no-drift mirror", () => {
  for (const name of ["vin-review.ts", "vin-utils.ts"]) {
    test(`shared/${name} and server/src/shared/${name} are byte-identical (LF-normalized)`, () => {
      const root = lfNormalized(join(repoRoot, "shared", name));
      const mirror = lfNormalized(join(repoRoot, "server", "src", "shared", name));
      assert.equal(mirror, root, `${name} mirror drifted from the authoritative root copy`);
    });
  }
});

const VALID_A = "WBAZZZ8VZM1234567";
const VALID_B = "VF3XXXXXXXXX99999";

describe("Phase 2C contract parity — deterministic scenario matrix (server mirror == client module)", () => {
  test("photo candidate → confirmed → publish-readable canonical; client reducer path is identical", () => {
    const attrs = applyVinExtractionCandidate(
      {},
      { value: VALID_A, source: "photo_ocr", confidence: 0.9 }
    );
    assert.equal(deriveVinReviewState(attrs).status, "candidate");
    assert.equal(attrs.vin, undefined);
    const confirmed = confirmVin(attrs, {
      type: "confirm",
      value: VALID_A,
      reviewId: attrs.vinReviewId ?? "",
    });
    assert.equal(confirmed.outcome, "applied");
    assert.equal(confirmed.attrs.vin, VALID_A);
  });

  test("manual typing → candidate with fresh generation → stale confirm of the older generation is a no-op", () => {
    const typed = applyVinManualEntryCandidate({}, VALID_A, "user_entered");
    assert.ok(typed.vinReviewId);
    const edited = applyVinManualEntryCandidate(typed, VALID_B, "user_entered");
    assert.notEqual(edited.vinReviewId, typed.vinReviewId);
    const stale = applyVinStructuredReviewAction(edited, {
      type: "confirm",
      value: VALID_A,
      reviewId: typed.vinReviewId ?? "",
    });
    assert.equal(stale.outcome, "stale_review");
    assert.equal(stale.attrs.vin, undefined);
  });

  test("conflict matrix: photo A + document B → conflict; confirm B → canonical B", () => {
    const a = applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" });
    const conflicted = applyVinExtractionCandidate(a, { value: VALID_B, source: "document_ocr" });
    assert.equal(deriveVinReviewState(conflicted).status, "conflict");
    const resolved = applyVinStructuredReviewAction(conflicted, {
      type: "confirm",
      value: VALID_B,
      reviewId: conflicted.vinReviewId ?? "",
    });
    assert.equal(resolved.outcome, "applied");
    assert.equal(resolved.attrs.vin, VALID_B);
  });
});
