import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_VERTICALS,
  FAIL_CLOSED_CAPABILITIES,
  LEGACY_MAPPING_FIXTURES,
  VERTICAL_IDS,
  canApply,
  canStartOffer,
  canUsePlatformPayment,
  canUseShipping,
  getCategoryCapabilities,
  getCategorySchema,
  listingWizardAttributeKeys,
  parseAddListingSearch,
  resolveVerticalId,
  simulateAddAuthRoundTrip,
  validateListingAttributes,
  type CategoryCapabilities,
} from "./index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DOMAIN_DIR = join(ROOT, "shared/marketplace-domain");
const CAPABILITY_KEYS = Object.keys(
  FAIL_CLOSED_CAPABILITIES
) as (keyof CategoryCapabilities)[];

const STAGE_13A_SOURCE_PATHS = [
  "shared/marketplace-domain/types.ts",
  "shared/marketplace-domain/capabilities.ts",
  "shared/marketplace-domain/attributes.ts",
  "shared/marketplace-domain/registry.ts",
  "shared/marketplace-domain/legacy.ts",
  "shared/marketplace-domain/validation.ts",
  "shared/marketplace-domain/queries.ts",
  "shared/marketplace-domain/listing-flow.ts",
  "shared/marketplace-domain/index.ts",
  "src/lib/marketplace-verticals.ts",
  "src/lib/start-ai-seller-listing.ts",
  "src/components/marketplace/CategorySchemaPreview.tsx",
  "src/components/home/HomeCategoryGrid.tsx",
  "src/app/add/page.tsx",
] as const;

describe("Stage 13A category domain", () => {
  it("A — exactly eight canonical root verticals", () => {
    assert.equal(CANONICAL_VERTICALS.length, 8);
    assert.equal(VERTICAL_IDS.length, 8);
    assert.deepEqual(
      CANONICAL_VERTICALS.map((v) => v.id),
      [...VERTICAL_IDS]
    );
  });

  it("B — unique vertical IDs and UI slugs", () => {
    const ids = CANONICAL_VERTICALS.map((v) => v.id);
    const slugs = CANONICAL_VERTICALS.map((v) => v.uiSlug);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("C — every vertical has explicit capabilities", () => {
    for (const vertical of CANONICAL_VERTICALS) {
      for (const key of CAPABILITY_KEYS) {
        assert.equal(
          typeof vertical.capabilities[key],
          "boolean",
          `${vertical.id}.${key} must be boolean`
        );
      }
    }
  });

  it("D — JOBS.supportsPlatformPayment === false", () => {
    const jobs = CANONICAL_VERTICALS.find((v) => v.id === "JOBS");
    assert.ok(jobs);
    assert.equal(jobs.capabilities.supportsPlatformPayment, false);
    assert.equal(canUsePlatformPayment("JOBS"), false);
    assert.equal(canUsePlatformPayment("jobs"), false);
  });

  it("E — REAL_ESTATE.supportsShipping === false", () => {
    const nt = CANONICAL_VERTICALS.find((v) => v.id === "REAL_ESTATE");
    assert.ok(nt);
    assert.equal(nt.capabilities.supportsShipping, false);
    assert.equal(canUseShipping("REAL_ESTATE"), false);
    assert.equal(canUseShipping("real_estate"), false);
  });

  it("F — ELECTRONICS shipping and pickup are true", () => {
    const electronics = CANONICAL_VERTICALS.find((v) => v.id === "ELECTRONICS");
    assert.ok(electronics);
    assert.equal(electronics.capabilities.supportsShipping, true);
    assert.equal(electronics.capabilities.supportsPickup, true);
    assert.equal(canUseShipping("electronics"), true);
  });

  it("G — attribute isolation across verticals", () => {
    const transport = listingWizardAttributeKeys("TRANSPORT");
    const jobs = listingWizardAttributeKeys("JOBS");
    const electronics = listingWizardAttributeKeys("ELECTRONICS");
    assert.equal(transport.includes("salaryMin"), false);
    assert.equal(transport.includes("salaryMax"), false);
    assert.equal(jobs.includes("vin"), false);
    assert.equal(electronics.includes("rooms"), false);
    assert.equal(electronics.includes("vin"), false);
    assert.equal(electronics.includes("mileage"), false);
  });

  it("H — validation rejects negative mileage, salary range, invalid enum", () => {
    const mileage = validateListingAttributes("TRANSPORT", {
      make: "BMW",
      mileage: -1,
    });
    assert.equal(mileage.ok, false);
    if (!mileage.ok) {
      assert.ok(mileage.issues.some((i) => i.key === "mileage" && i.code === "min"));
    }

    const salary = validateListingAttributes("JOBS", {
      jobTitle: "Vairuotojas",
      employmentType: "Pilnas etatas",
      location: "Vilnius",
      salaryMin: 2500,
      salaryMax: 1800,
    });
    assert.equal(salary.ok, false);
    if (!salary.ok) {
      assert.ok(salary.issues.some((i) => i.code === "range_order"));
    }

    const fuel = validateListingAttributes("TRANSPORT", {
      make: "Audi",
      fuelType: "Vanduo",
    });
    assert.equal(fuel.ok, false);
    if (!fuel.ok) {
      assert.ok(
        fuel.issues.some((i) => i.key === "fuelType" && i.code === "invalid_enum")
      );
    }
  });

  it("I — unknown category is fail-closed", () => {
    assert.equal(resolveVerticalId("nope"), null);
    // F12 — clothing/other ARE canonical verticals now (8-vertical parity).
    assert.equal(resolveVerticalId("clothing"), "CLOTHING");
    assert.equal(resolveVerticalId("other"), "OTHER");
    assert.equal(resolveVerticalId("tools"), null);
    assert.equal(resolveVerticalId("rental"), null);
    assert.equal(getCategorySchema("nope"), null);
    assert.equal(canUsePlatformPayment("nope"), false);
    assert.equal(canStartOffer("fashion"), false);
    assert.equal(canApply("tools"), false);
    assert.deepEqual(getCategoryCapabilities("unknown"), FAIL_CLOSED_CAPABILITIES);
    const unknown = validateListingAttributes("nope", {});
    assert.equal(unknown.ok, false);
    if (!unknown.ok) {
      assert.equal(unknown.issues[0]?.code, "unknown_category");
    }
  });

  it("J — LEGACY_MAPPING_FIXTURES are deterministic", () => {
    assert.ok(LEGACY_MAPPING_FIXTURES.length >= 10);
    for (const { from, to } of LEGACY_MAPPING_FIXTURES) {
      assert.equal(resolveVerticalId(from), to, `${from} → ${to}`);
    }
  });

  it("K — listing wizard keys differ by vertical", () => {
    const electronics = listingWizardAttributeKeys("ELECTRONICS");
    const transport = listingWizardAttributeKeys("TRANSPORT");
    const jobs = listingWizardAttributeKeys("JOBS");
    assert.ok(electronics.includes("manufacturer"));
    assert.ok(electronics.includes("deviceModel"));
    assert.equal(electronics.includes("vin"), false);
    assert.ok(transport.includes("vin"));
    assert.ok(transport.includes("mileage"));
    assert.equal(transport.includes("jobTitle"), false);
    assert.ok(jobs.includes("jobTitle"));
    assert.ok(jobs.includes("salaryMin"));
    assert.equal(jobs.includes("vin"), false);
    assert.equal(canUsePlatformPayment("JOBS"), false);
    assert.equal(canUseShipping("JOBS"), false);
  });

  it("L — frozen 11J boundary: 13A sources are outside payments", () => {
    for (const rel of STAGE_13A_SOURCE_PATHS) {
      assert.equal(
        rel.startsWith("server/src/payments/"),
        false,
        `${rel} must not live under payments`
      );
      const abs = join(ROOT, rel);
      assert.equal(existsSync(abs), true, `missing ${rel}`);
      const src = readFileSync(abs, "utf8");
      assert.equal(
        /server\/src\/payments/.test(src),
        false,
        `${rel} must not import payments`
      );
      assert.equal(
        /from\s+["'][^"']*payments/.test(src),
        false,
        `${rel} must not import a payments module`
      );
      assert.equal(
        /\b(058|059|060|061)\b/.test(src),
        false,
        `${rel} must not mention frozen payment migrations`
      );
    }

    const domainFiles = readdirSync(DOMAIN_DIR).filter((f) => f.endsWith(".ts"));
    assert.ok(domainFiles.includes("index.ts"));
    assert.equal(
      existsSync(join(ROOT, "server/src/payments/marketplace-domain.ts")),
      false
    );
  });

  it("M — /add auth round-trip retains ELECTRONICS schema without vehicle fields", () => {
    const trip = simulateAddAuthRoundTrip("electronics");
    assert.equal(trip.returnPath, "/add?vertical=electronics");
    assert.equal(trip.parsed.verticalId, "ELECTRONICS");
    assert.equal(trip.parsed.isFashion, false);
    const fromIdParam = parseAddListingSearch("?verticalId=ELECTRONICS");
    assert.equal(fromIdParam.verticalId, "ELECTRONICS");
    assert.ok(trip.context);
    assert.equal(trip.context.listingCategory, "electronics");
    assert.equal(trip.context.attributeKeys.includes("vin"), false);
    assert.equal(trip.context.attributeKeys.includes("mileage"), false);
    assert.equal(trip.context.attributeKeys.includes("rooms"), false);
    assert.ok(trip.context.attributeKeys.includes("manufacturer"));
    assert.ok(trip.context.attributeKeys.includes("deviceModel"));
    assert.equal(trip.context.capabilities.supportsShipping, true);
    assert.match(trip.context.welcome, /Elektronika/);
    assert.equal(/\bVIN\b/i.test(trip.context.welcome), false);
  });

  it("N — /add JOBS capability contract: no platform payment", () => {
    const trip = simulateAddAuthRoundTrip("jobs");
    assert.equal(trip.returnPath, "/add?vertical=jobs");
    assert.equal(trip.parsed.verticalId, "JOBS");
    assert.ok(trip.context);
    assert.equal(trip.context.listingCategory, "jobs");
    assert.equal(trip.context.listingKind, "JOB_POSTING");
    assert.equal(trip.context.capabilities.supportsPlatformPayment, false);
    assert.equal(trip.context.capabilities.supportsShipping, false);
    assert.equal(trip.context.capabilities.supportsApplications, true);
    assert.ok(trip.context.attributeKeys.includes("jobTitle"));
    assert.ok(trip.context.attributeKeys.includes("salaryMin"));
    assert.equal(trip.context.attributeKeys.includes("vin"), false);
    assert.match(trip.context.welcome, /platformos mokėjimas netaikomas/);
  });
});
