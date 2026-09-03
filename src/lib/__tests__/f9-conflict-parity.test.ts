/**
 * F9 — conflict-marker mirror parity:
 *  - root shared sanitizer == server shared sanitizer (modulo .js import
 *    rewrites) and BOTH drop all six fact-conflict markers at persistence;
 *  - the server model-visible slice hides them;
 *  - the client draft-state isolation keeps them ALIVE across round-trips
 *    (draft-only), while public spec rendering never shows them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EPHEMERAL_LISTING_ATTR_KEYS } from "@vauto/shared/listing-attributes-sanitize";
import {
  FACT_CONFLICT_DRAFT_STATE_KEYS,
  allowedAttributeKeysForCategory,
} from "@/lib/listing-attribute-isolation";
import { isPublicDynamicAttributeKey } from "@/lib/listing-dynamic-attributes";
import { FACT_CONFLICT_MARKER_KEYS } from "@vauto/shared/fact-conflict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..");

function rootSharedText(name: string): string {
  return readFileSync(path.join(ROOT, "shared", name), "utf8");
}

function serverSharedText(name: string): string {
  return readFileSync(path.join(ROOT, "server", "src", "shared", name), "utf8");
}

describe("F9 — konfliktų markerių paritetas", () => {
  it("visi šeši markeriai dropinami persistence sanitizatoriuje (root)", () => {
    for (const key of FACT_CONFLICT_MARKER_KEYS) {
      assert.equal(
        EPHEMERAL_LISTING_ATTR_KEYS.has(key),
        true,
        `root sanitizer must drop ${key}`
      );
    }
  });

  it("root ir server sanitizatoriai yra mirror (po .js importo normalizavimo)", () => {
    const rootRaw = rootSharedText("listing-attributes-sanitize.ts");
    const serverRaw = serverSharedText("listing-attributes-sanitize.ts");
    // The sync script rewrites local imports to NodeNext `.js`; the rest
    // must be byte-identical.
    const normalize = (s: string) =>
      s.replace(/from "(\.\.?\/[^"]+)\.js";/g, 'from "$1";').replace(/from '(\.\.?\/[^']+)\.js';/g, "from '$1';");
    assert.equal(normalize(serverRaw), rootRaw);
    for (const key of FACT_CONFLICT_MARKER_KEYS) {
      assert.equal(
        serverRaw.includes(`"${key}"`),
        true,
        `server sanitizer must drop ${key}`
      );
    }
  });

  it("model-visible slice slepia visus šešis markerius (root ir server)", () => {
    const rootSlice = rootSharedText("llm-context-slice.ts");
    const serverSlice = serverSharedText("llm-context-slice.ts");
    for (const key of FACT_CONFLICT_MARKER_KEYS) {
      assert.equal(rootSlice.includes(`"${key}"`), true, `root slice must hide ${key}`);
      assert.equal(serverSlice.includes(`"${key}"`), true, `server slice must hide ${key}`);
    }
  });

  it("kliento draft-state izoliacija išlaiko markerius, vieši spec'ai jų nerodo", () => {
    for (const key of FACT_CONFLICT_MARKER_KEYS) {
      assert.equal(
        (FACT_CONFLICT_DRAFT_STATE_KEYS as readonly string[]).includes(key),
        true,
        `draft-state keys must include ${key}`
      );
      assert.equal(isPublicDynamicAttributeKey(key), false, `${key} must never be a public spec`);
    }
    // Category-neutral: an electronics draft keeps conflict markers alive.
    const allowed = allowedAttributeKeysForCategory("electronics");
    for (const key of FACT_CONFLICT_MARKER_KEYS) {
      assert.equal(allowed.has(key), true, `electronics draft must keep ${key}`);
    }
  });
});
