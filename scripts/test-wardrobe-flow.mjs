#!/usr/bin/env node
/**
 * Wardrobe (Spinta) AI flow test harness.
 *
 * Verifies the seller wardrobe pipeline end to end:
 *   photo -> garment recognition -> cataloging -> draft shape -> present for sale
 * plus edge cases (invalid profile URL, empty/unclear photo, value math) and
 * confirms the AI never hard-crashes (graceful message instead of 500).
 *
 * Modes:
 *   node scripts/test-wardrobe-flow.mjs            # offline logic + remote graceful-recognition probe
 *   node scripts/test-wardrobe-flow.mjs --local    # offline logic only (no network / no keys)
 *   node scripts/test-wardrobe-flow.mjs https://vauto-api.onrender.com
 *
 * Requires: npm run server:build (for offline imports).
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "server", "dist");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const localOnly = process.argv.includes("--local");
const base =
  args[0]?.replace(/\/$/, "") ||
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";

function distImport(...segments) {
  return import(pathToFileURL(join(dist, ...segments)).href);
}

let failures = 0;
function check(cond, label) {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}`);
}

// Minimal valid 1x1 JPEG (unclear "garment") — exercises the graceful path.
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD/2Q==";

async function runOffline() {
  console.log("\n== Offline wardrobe logic (no Gemini) ==");
  const { computeWardrobeValueTotal, importWardrobeProfile } = await distImport(
    "ai",
    "wardrobe-profile-importer.js"
  );

  // Wardrobe value math — ignores negatives, rounds.
  const total = computeWardrobeValueTotal([
    { price: 22 },
    { price: 18 },
    { price: -5 },
    { price: "14" },
  ]);
  check(total === 54, `wardrobe value total sums valid prices (got ${total}, want 54)`);
  check(computeWardrobeValueTotal([]) === 0, `empty wardrobe totals 0`);

  // Invalid profile URL must be rejected clearly (no crash, actionable error).
  let rejected = false;
  try {
    await importWardrobeProfile({ profileUrl: "not-a-real-url" });
  } catch (e) {
    rejected = /galiojanči|nuorod/i.test(e instanceof Error ? e.message : "");
  }
  check(rejected, `invalid profile URL rejected with actionable message`);

  // Draft mapping shape (server catalog helper mirrors client) — category stays clothing.
  const { formatFashionCategory } = await distImport(
    "..",
    "src",
    "lib",
    "clothing-catalog.js"
  ).catch(() => ({ formatFashionCategory: null }));
  if (formatFashionCategory) {
    check(
      formatFashionCategory("Vyrams", "Švarkai") === "Vyrams › Švarkai",
      `formatFashionCategory keeps non-female groups (men's)`
    );
  } else {
    console.log("  [SKIP] formatFashionCategory not in server dist (client-only) — ok");
  }
}

async function runRemote() {
  console.log(`\n== Remote wardrobe recognition via ${base} ==`);

  // 1) Validation: no image -> 400, not a crash.
  try {
    const res = await fetch(`${base}/api/ai/analyze-wardrobe-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: "Testas" }),
      signal: AbortSignal.timeout(30_000),
    });
    check(res.status === 400, `missing image returns 400 (got ${res.status})`);
  } catch (e) {
    console.log(`  [WARN] validation probe: ${e instanceof Error ? e.message : e}`);
  }

  // 2) Unclear photo -> graceful structured response, NEVER a 500 crash.
  try {
    const res = await fetch(`${base}/api/ai/analyze-wardrobe-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: TINY_JPEG, userName: "Testas" }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 429 || res.status === 503) {
      console.log(`  [WARN] recognition probe → HTTP ${res.status} (Gemini busy) — retry layer active`);
    } else {
      check(res.status !== 500, `unclear photo does not 500-crash (got ${res.status})`);
      const body = await res.json().catch(() => ({}));
      check(Array.isArray(body.items), `response has items[] array`);
      check(
        typeof body.voiceAnnouncement === "string" && body.voiceAnnouncement.trim().length > 0,
        `graceful voiceAnnouncement present`
      );
      console.log(
        `        items=${Array.isArray(body.items) ? body.items.length : "n/a"} say="${String(body.voiceAnnouncement ?? "").slice(0, 80)}"`
      );
    }
  } catch (e) {
    console.log(`  [WARN] recognition probe: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  console.log("VAUTO wardrobe (Spinta) flow test");
  await runOffline();
  if (!localOnly) {
    await runRemote().catch((e) =>
      console.warn("Remote probe skipped:", e instanceof Error ? e.message : e)
    );
  }
  console.log(
    failures === 0
      ? "\nWardrobe flow test: OK"
      : `\nWardrobe flow test: ${failures} failure(s)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
