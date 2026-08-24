import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveViewMode } from "@/lib/marketplace-view";

/**
 * Stage 22A.1-A — responsive automatic view default.
 *
 * The canonical viewMode stays authoritative; `explicit` marks a deliberate
 * user/AI selection. When no explicit selection exists and the viewport is
 * narrow (mobile), the readable single-column LIST is the automatic default
 * instead of the dense 2-column GRID.
 */
test("22A.1-A: no explicit choice on mobile => LIST (safe readable default)", () => {
  assert.equal(effectiveViewMode("grid", false, true), "list");
});

test("22A.1-A: no explicit choice on desktop => grid (canonical default preserved)", () => {
  assert.equal(effectiveViewMode("grid", false, false), "grid");
});

test("22A.1-A: explicit GRID on mobile is respected", () => {
  assert.equal(effectiveViewMode("grid", true, true), "grid");
});

test("22A.1-A: explicit LIST on mobile is respected", () => {
  assert.equal(effectiveViewMode("list", true, true), "list");
});

test("22A.1-A: explicit MAP on mobile is respected", () => {
  assert.equal(effectiveViewMode("map", true, true), "map");
});

test("22A.1-A: no explicit choice on desktop with list mode => list (mode is default)", () => {
  // A mode of "list" with no explicit flag only occurs transiently; the helper
  // still returns it verbatim so the canonical mode is never corrupted.
  assert.equal(effectiveViewMode("list", false, false), "list");
});

test("22A.1-A: viewport change alone never corrupts canonical state", () => {
  // The helper is pure: same inputs always produce the same output and it
  // never mutates mode/explicit — resizing cannot persist anything.
  const before = effectiveViewMode("grid", false, true);
  const after = effectiveViewMode("grid", false, false);
  assert.equal(before, "list");
  assert.equal(after, "grid");
});
