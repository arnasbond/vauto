/**
 * Demo-fixture identity regression.
 *
 * Demo catalog fixtures (INITIAL_LISTINGS) are explicitly marked `isDemo` at
 * construction so their expiry is re-baselined by `markListingDemoFlags` and
 * they never disappear because the real wall clock crossed a fixed createdAt
 * timestamp (e.g. the Volvo V70 fixtures dated 2026-06-20 expiring 2026-09-18).
 * Real listings must remain unmarked by ID shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_LISTINGS } from "@/data/mockListings";
import { isDemoListingId, markListingDemoFlags } from "@/lib/demo-catalog";
import { isListingActive } from "@/lib/listing-expiry";

test("every demo-catalog fixture is marked demo and stays active regardless of wall clock", () => {
  const flagged = markListingDemoFlags(INITIAL_LISTINGS);
  assert.ok(flagged.length > 0, "demo catalog must not be empty");

  for (const listing of flagged) {
    assert.equal(
      listing.isDemo,
      true,
      `${listing.id} must be explicitly marked demo`
    );
    assert.equal(
      isListingActive(listing),
      true,
      `${listing.id} demo fixture must not expire on the real wall clock`
    );
  }

  const volvo = flagged.find((l) => l.id === "lt-auto-v70-pnv");
  assert.ok(volvo, "lt-auto-v70-pnv must be present in the demo catalog");
  assert.equal(volvo.isDemo, true, "lt-auto-v70-pnv must be marked demo");
  assert.equal(isListingActive(volvo), true, "lt-auto-v70-pnv must remain active");
});

test("real (non-demo) listing IDs are not classified as demo by ID shape", () => {
  assert.equal(isDemoListingId("e2e-manual-1"), false, "user listing must not be demo");
  assert.equal(isDemoListingId("some-real-listing-id"), false, "plain id must not be demo");
  assert.equal(
    isDemoListingId("550e8400-e29b-41d4-a716-446655440000"),
    false,
    "uuid-style listing must not be demo"
  );
});
