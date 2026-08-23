import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAiVertical } from "@/lib/ai-vertical-adapter";

// Stage 18.1 MEDIUM-1 — vertical detection is an adapter over the canonical 13A
// registry, not an independent keyword truth source. These verify the adapter
// still resolves the same NL queries with correct precedence and fail-closed.
test("18.1: real estate query resolves to the canonical real_estate category", () => {
  assert.equal(resolveAiVertical("2 kambarių butas Vilniuje iki 120000"), "real_estate");
  assert.equal(resolveAiVertical("Ieškau namo Kaune"), "real_estate");
});

test("18.1: vehicle query resolves to the canonical transport segment (vehicles)", () => {
  assert.equal(resolveAiVertical("ekonomiškas dyzelinis universalas iki 7000"), "vehicles");
  assert.equal(resolveAiVertical("Toyota Corolla 2015"), "vehicles");
});

test("18.1: electronics example still resolves", () => {
  assert.equal(resolveAiVertical("MacBook Pro M3 Max"), "electronics");
});

test("18.1: services / jobs / clothing resolve via the adapter", () => {
  assert.equal(resolveAiVertical("Reikia elektriko Kaune"), "services");
  // Audit example: heavy-equipment rental is a service/rental intent, must resolve.
  assert.equal(resolveAiVertical("ekskavatoriaus nuoma Kaune"), "services");
  assert.equal(resolveAiVertical("ieškau darbo vairuotoju"), "jobs");
  assert.equal(resolveAiVertical("Nike sportbačiai 42 dydis"), "clothing");
});

test("18.1: rental intent disambiguates real-estate from equipment-service by noun", () => {
  // "butas nuomai" carries a residential noun → real estate, never hijacked away.
  assert.equal(resolveAiVertical("butas nuomai Vilniuje"), "real_estate");
  // "sklypos nuomai" → a plot is real estate too.
  assert.equal(resolveAiVertical("sklypo nuoma Kaune"), "real_estate");
  // Equipment rental ("ekskavatoriaus nuoma") with no residential noun → service.
  assert.equal(resolveAiVertical("technikos nuoma Vilniuje"), "services");
});

test("18.1: unknown query fails closed to all (no invented vertical)", () => {
  assert.equal(resolveAiVertical(""), "all");
  assert.equal(resolveAiVertical("qwertz uiopasdf ghjk"), "all");
});
