#!/usr/bin/env node
/** Smoke tests for compiled server validation + VIN utils (no DB). */
import { validateAmount, validateListingPatch, validateServiceLeadCreate } from "../server/dist/validation.js";
import { moderateListingInput } from "../server/dist/lib/listing-moderation.js";
import { readConductorLineage, resolveConductorRequiresReviewFromLineage } from "../server/dist/lib/conductor-publish.js";
import { runListingAiModeration } from "../server/dist/lib/listing-ai-moderation.js";
import { PUBLIC_LISTING_VISIBILITY_SQL } from "../server/dist/repository.js";
import { isValidVin, normalizeVin } from "../server/dist/vehicle/vin-utils.js";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const amount = validateAmount({ amount: 25 }, "amount", 1, 500);
assert(amount.ok && amount.value === 25, "validateAmount accepts 25");

const badAmount = validateAmount({ amount: 0 }, "amount", 1, 500);
assert(!badAmount.ok, "validateAmount rejects 0");

const walletAmount = validateAmount({ amount: 10 }, "amount", 1, 500);
assert(walletAmount.ok && walletAmount.value === 10, "wallet top-up amount valid");

const lead = validateServiceLeadCreate({
  title: "Elektrikas Vilniuje",
  city: "Vilnius",
  category: "Elektrikas",
  summary: "Reikia pakeisti rozetę",
  hiddenContact: "+370 6•• •••••",
  contactPhone: "+370 612 34567",
});
assert(lead.ok, "validateServiceLeadCreate accepts minimal lead");

const banPatch = validateListingPatch({ banned: true });
assert(banPatch.ok && banPatch.value.banned === true, "validateListingPatch accepts banned");

const badPatch = validateListingPatch({ hacker: true });
assert(!badPatch.ok, "validateListingPatch rejects unknown fields");

assert(!isValidVin("NOT_A_VIN"), "isValidVin rejects invalid VIN");
assert(normalizeVin(" wvw-zzz ") === "WVWZZZ", "normalizeVin strips noise");

const modOk = moderateListingInput({ title: "Naudotas iPhone 13" });
assert(modOk.allowed, "moderateListingInput allows clean title");

const modBad = moderateListingInput({ title: "ginklas pardavimui" });
assert(!modBad.allowed, "moderateListingInput blocks weapons");

const lineage = readConductorLineage({
  conductorSources: "barcode,seller",
  conductorMergedAt: "1710000000000",
});
assert(lineage.sources.join(",") === "barcode,seller", "readConductorLineage parses sources");

assert(
  resolveConductorRequiresReviewFromLineage(lineage),
  "automated sources without manual require review"
);
assert(
  !resolveConductorRequiresReviewFromLineage({ sources: ["manual"], mergedAt: null }),
  "manual-only skips review"
);
assert(
  !resolveConductorRequiresReviewFromLineage({ sources: ["agent", "manual"], mergedAt: null }),
  "manual override skips review"
);

assert(
  PUBLIC_LISTING_VISIBILITY_SQL.includes("requires_review"),
  "public feed SQL excludes pending review"
);

const aiReject = await runListingAiModeration({
  id: "smoke-1",
  sellerId: "seller-1",
  title: "ginklas pardavimui",
  price: 100,
  location: "Vilnius",
  category: "other",
  images: [],
  tags: [],
  status: "active",
  createdAt: new Date().toISOString(),
});
assert(aiReject.action === "reject", "listing AI moderation rejects weapons");

console.log("Server validation smoke: OK");
