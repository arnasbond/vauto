/**
 * F12/E2E-harness — canonical category parity regression (server side).
 *
 * 3. "should enforce 8 canonical categories parity across sell picker and
 *    home grid" — the sell picker vertical registry must match the 8
 *    user-visible categories of the canonical registry.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleCategoryOptions } from "../shared/category-registry.js";
import { CANONICAL_VERTICALS } from "../shared/marketplace-domain/registry.js";

describe("chat state machine — canonical category parity", () => {
  it("should enforce 8 canonical categories parity across sell picker and home grid", () => {
    const visible = visibleCategoryOptions().map((c) => c.label);
    const picker = CANONICAL_VERTICALS.map((v) => v.label);
    assert.equal(visible.length, 8, "canonical registry must have 8 visible categories");
    for (const label of visible) {
      assert.ok(
        picker.includes(label),
        `sell picker must include canonical category "${label}"`
      );
    }
  });
});
