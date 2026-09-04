import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasDeliveryCapability,
  isShippableGoods,
  primaryCapability,
} from "@/lib/listing-capabilities";
import type { Listing } from "@/lib/types";

function makeListing(partial: Partial<Listing>): Listing {
  return {
    id: "x",
    title: "T",
    price: 1,
    location: "Vilnius",
    category: "other",
    sellerId: "s1",
    ...partial,
  } as Listing;
}

// Stage 18E — capability-driven cards.
test("18E: Omniva/delivery ONLY applies to canonical shippable physical goods", () => {
  assert.equal(hasDeliveryCapability(makeListing({ category: "electronics", allowPastomatas: true })), true);
  assert.equal(hasDeliveryCapability(makeListing({ category: "home", allowPastomatas: true })), true);
  // F12 — clothing is a canonical shippable physical-good vertical.
  assert.equal(hasDeliveryCapability(makeListing({ category: "clothing", allowPastomatas: true })), true);
  // Non-canonical goods (tools/rental) are fail-closed — no Omniva.
  assert.equal(hasDeliveryCapability(makeListing({ category: "tools", allowPastomatas: true })), false);
  // Real estate / services / jobs / vehicles must NEVER show delivery.
  assert.equal(hasDeliveryCapability(makeListing({ category: "real_estate", allowPastomatas: true })), false);
  assert.equal(hasDeliveryCapability(makeListing({ category: "services", allowPastomatas: true })), false);
  assert.equal(hasDeliveryCapability(makeListing({ category: "jobs", allowPastomatas: true })), false);
  assert.equal(hasDeliveryCapability(makeListing({ category: "vehicles", allowPastomatas: true })), false);
  assert.equal(hasDeliveryCapability(makeListing({ category: "transport", allowPastomatas: true })), false);
});

test("18E: isShippableGoods is derived from the canonical capability model (fail-closed)", () => {
  for (const cat of ["electronics", "home", "clothing"]) {
    assert.equal(isShippableGoods(cat as never), true, cat);
  }
  // Canonical model declares supportsShipping=false (or unknown→fail-closed) for these.
  for (const cat of ["tools", "rental", "other", "real_estate", "services", "jobs", "vehicles", "transport"]) {
    assert.equal(isShippableGoods(cat as never), false, cat);
  }
  assert.equal(isShippableGoods(undefined), false);
});

test("18E: physical good primary capability is delivery", () => {
  const cap = primaryCapability(makeListing({ category: "electronics", allowPastomatas: true }));
  assert.ok(cap);
  assert.equal(cap!.id, "delivery");
});

test("18E: real estate primary capability is location, never delivery", () => {
  const cap = primaryCapability(makeListing({ category: "real_estate", location: "Vilnius" }));
  assert.ok(cap);
  assert.equal(cap!.id, "location");
  assert.equal(cap!.label, "Vilnius");
});

test("18E: remote service shows remote capability", () => {
  const cap = primaryCapability(
    makeListing({ category: "services", attributes: { remote: "Nuotoliniu" } as never })
  );
  assert.ok(cap);
  assert.equal(cap!.id, "remote");
});
