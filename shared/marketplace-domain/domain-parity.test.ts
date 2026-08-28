/**
 * RT-01 parity gate — one canonical category source of truth.
 *
 * Proves:
 *  - `shared/category-registry.ts` is the single hand-maintained listing-category
 *    registry (11 persisted DB/API slugs).
 *  - `src/lib/types.ts` / `src/lib/db/models.ts` re-export the canonical type
 *    instead of maintaining a competing union (no second hand-written union).
 *  - `server/src/shared/category-registry.ts` is byte-identical to the root
 *    registry modulo the ESM `.js` import transform (which does not apply here).
 *  - Every canonical vertical maps through the canonical adapter and every
 *    legacy listing category resolves back onto a canonical vertical — no
 *    orphan category IDs and no competing vertical IDs.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_VERTICALS,
  VERTICAL_IDS,
  listingCategoriesForVertical,
  resolveVerticalId,
} from "./index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT_REGISTRY = join(ROOT, "shared/category-registry.ts");
const SERVER_REGISTRY = join(ROOT, "server/src/shared/category-registry.ts");
const FRONTEND_TYPES = join(ROOT, "src/lib/types.ts");
const DB_MODELS = join(ROOT, "src/lib/db/models.ts");
const ADAPTIVE_TYPES = join(ROOT, "src/lib/adaptive-categories/types.ts");

const IMPORT_TRANSFORMED_SERVER_COPY =
  /\nimport\s*\{[^}]*\}\s*from\s*["']\.\/category-registry\.js["'];|from\s*["']\.\/category-registry\.js["']/;

describe("RT-01 domain parity (single source of truth)", () => {
  it("A — root registry exists and is the single hand-maintained listing-category union", () => {
    assert.equal(existsSync(ROOT_REGISTRY), true, "missing shared/category-registry.ts");
    const src = readFileSync(ROOT_REGISTRY, "utf8");
    assert.match(src, /single source of truth/);
    assert.match(src, /export const LISTING_CATEGORY_IDS/);
  });

  it("B — frontend types.ts re-exports, does not re-declare the union", () => {
    const src = readFileSync(FRONTEND_TYPES, "utf8");
    assert.match(
      src,
      /RegistryListingCategory as ListingCategory/,
      "types.ts must alias the canonical registry type"
    );
    assert.doesNotMatch(
      src,
      /\bvehicles"\s*\|\s*"transport"\s*\|\s*"real_estate"/,
      "types.ts must not hand-maintain a competing union"
    );
  });

  it("C — db/models.ts re-exports, does not re-declare the union", () => {
    const src = readFileSync(DB_MODELS, "utf8");
    assert.match(
      src,
      /RegistryListingCategory as ListingCategory/,
      "db/models.ts must alias the canonical registry type"
    );
    assert.doesNotMatch(
      src,
      /\bvehicles"\s*\|\s*"transport"\s*\|\s*"real_estate"/,
      "db/models.ts must not hand-maintain a competing union"
    );
  });

  it("D — server copy is byte-identical to root registry (modulo .js import transform)", () => {
    const root = readFileSync(ROOT_REGISTRY, "utf8");
    const server = readFileSync(SERVER_REGISTRY, "utf8");
    const transformedRoot = root.replace(/\.\.?\/[^"']+\.ts/g, (m) => m.replace(/\.ts$/, ".js"));
    assert.equal(
      server.trim(),
      transformedRoot.trim(),
      "server/src/shared/category-registry.ts must stay synced with shared/category-registry.ts"
    );
  });

  it("E — exactly 6 canonical root verticals with unique IDs", () => {
    assert.equal(CANONICAL_VERTICALS.length, 6);
    assert.equal(VERTICAL_IDS.length, 6);
    assert.equal(new Set(VERTICAL_IDS).size, 6);
  });

  it("F — canonical verticals map to valid listing categories; legacy-only slugs stay fail-closed", () => {
    const { LISTING_CATEGORY_IDS } = requireRootRegistry();
    // Canonical verticals always map onto persisted listing categories.
    const home = listingCategoriesForVertical("HOME_GARDEN");
    assert.ok(home.includes("home"), "HOME_GARDEN → home");
    const transport = listingCategoriesForVertical("TRANSPORT");
    assert.ok(transport.includes("vehicles"), "TRANSPORT → vehicles alias");
    // The 6 canonical verticals are the ONLY resolvable category space.
    const resolvable = new Set<string>();
    for (const id of VERTICAL_IDS) {
      for (const slug of listingCategoriesForVertical(id)) {
        resolvable.add(slug);
        assert.equal(resolveVerticalId(slug), id, `${slug} → ${id}`);
      }
    }
    // Presentation/legacy-only slugs (clothing, tools, rental, other) are NOT
    // canonical verticals — they stay fail-closed (existing product behavior).
    const LEGACY_ONLY = ["clothing", "tools", "rental", "other"];
    for (const slug of LEGACY_ONLY) {
      assert.equal(resolvable.has(slug), false, `${slug} is not canonical`);
      assert.equal(resolveVerticalId(slug), null, `${slug} must stay fail-closed`);
    }
    // Every persisted listing category belongs to exactly one of the two sets.
    for (const slug of LISTING_CATEGORY_IDS) {
      assert.ok(
        resolvable.has(slug) || LEGACY_ONLY.includes(slug),
        `unclassified persisted slug ${slug}`
      );
    }
  });

  it("G — no competing root vertical IDs anywhere in canonical module", () => {
    const ids = new Set(VERTICAL_IDS);
    const names = [
      "OTHER_GOODS",
      "FASHION",
      "GOODS",
      "TRANSPORTATION",
      "AUTO",
      "REALESTATE",
    ];
    for (const name of names) {
      assert.equal(ids.has(name as never), false, `${name} is not a canonical root ID`);
    }
    assert.equal(ids.has("HOME_GARDEN" as never), true, "HOME_GARDEN is canonical");
  });

  it("H — adaptive categories remain a derived presentation layer (not a registry)", () => {
    const src = readFileSync(ADAPTIVE_TYPES, "utf8");
    assert.match(src, /AdaptiveCategoryKey/);
    // Adaptive keys are presentation-level; they must include "universal" and
    // must NOT claim to be the listing-category registry.
    assert.doesNotMatch(src, /single source of truth/);
    assert.doesNotMatch(src, /LISTING_CATEGORY_IDS/);
  });
});

function requireRootRegistry(): { LISTING_CATEGORY_IDS: readonly string[] } {
  const src = readFileSync(ROOT_REGISTRY, "utf8");
  const match = src.match(/export const LISTING_CATEGORY_IDS = \[([\s\S]*?)\] as const;/);
  assert.ok(match, "LISTING_CATEGORY_IDS const must exist");
  const ids = match[1]
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  assert.equal(ids.length, 11, "must be exactly 11 persisted listing categories");
  return { LISTING_CATEGORY_IDS: ids };
}
