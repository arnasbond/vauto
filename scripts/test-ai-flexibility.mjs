#!/usr/bin/env node
/**
 * AI flexibility / error-tolerance test harness.
 *
 * Simulates "ugly" user input: typos, slang, missing Lithuanian diacritics,
 * abbreviations, mixed LT/EN, and very short brand queries. Verifies the AI
 * pipeline interprets intent instead of rejecting the user.
 *
 * Modes:
 *   node scripts/test-ai-flexibility.mjs            # offline guard checks + remote Gemini probe
 *   node scripts/test-ai-flexibility.mjs --local    # offline guard checks only (no network / no keys)
 *   node scripts/test-ai-flexibility.mjs --strict    # fail if remote Gemini interpretation fails
 *   node scripts/test-ai-flexibility.mjs https://vauto-api.onrender.com
 *
 * Requires: npm run server:build (for offline guard imports).
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "server", "dist");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const localOnly = process.argv.includes("--local");
const strict = process.argv.includes("--strict");
const base =
  args[0]?.replace(/\/$/, "") ||
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";

function distImport(...segments) {
  return import(pathToFileURL(join(dist, ...segments)).href);
}

let failures = 0;
function check(cond, label) {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${label}`);
}

/** "Ugly" queries — messy on purpose. Each should resolve to a usable product. */
const MESSY_QUERIES = [
  { q: "volwo v70", expect: /volvo/i, note: "typo + no diacritics" },
  { q: "ieskau suknele 38 dydzio", expect: /suknel/i, note: "no diacritics" },
  { q: "bemvė e46", expect: /bmw/i, note: "slang brand" },
  { q: "mersas dyzelis", expect: /mercedes|dyzel|dīzel|dyzelis/i, note: "slang + fuel" },
  { q: "iphon 12", expect: /iphone|12/i, note: "typo" },
  { q: "batai 42 dydzio", expect: /bat/i, note: "no diacritics" },
  { q: "noriu nusipirkt dress", expect: /dress|suknel|drabuž/i, note: "mixed LT/EN" },
  { q: "nt vilnius 2 kambariu", expect: /but|kambar|nt|nekilnoj/i, note: "abbrev" },
  { q: "vw golf 4", expect: /vw|golf|volkswagen/i, note: "short brand + model" },
  { q: "skudurai atpigo", expect: /drabuž|skudur/i, note: "slang for clothes" },
];

async function runOfflineGuards() {
  console.log("\n== Offline guard checks (no Gemini) ==");
  const { isTooShortSecretaryQuery } = await distImport(
    "ai",
    "secretary-guards.js"
  );
  const { hasMeaningfulShortToken } = await distImport(
    "ai",
    "secretary-persona.js"
  );
  const { isConversationalSearchIntent } = await distImport("ai", "search-agent.js");

  // Short brand/product tokens must NOT be rejected as noise.
  for (const short of ["vw", "bmw", "kia", "a4", "nike", "tv"]) {
    check(
      !isTooShortSecretaryQuery(short),
      `short brand "${short}" is accepted (not noise)`
    );
    check(hasMeaningfulShortToken(short), `"${short}" recognized as meaningful token`);
  }

  // True noise must still be rejected.
  check(isTooShortSecretaryQuery("a"), `single char "a" is noise`);
  check(isTooShortSecretaryQuery(""), `empty string is noise`);

  // Conversational vs product search routing.
  check(
    isConversationalSearchIntent("labas"),
    `greeting "labas" is conversational`
  );
  check(
    !isConversationalSearchIntent("ieskau volvo"),
    `"ieskau volvo" routes to product search, not chit-chat`
  );
}

async function runRemoteInterpretation() {
  console.log(`\n== Remote Gemini interpretation via ${base} ==`);
  console.log("(messy input should yield a non-empty cleanQuery)\n");

  let interpreted = 0;
  let softFail = 0;
  for (const { q, expect, note } of MESSY_QUERIES) {
    try {
      const res = await fetch(`${base}/api/ai/analyze-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        softFail++;
        console.log(`  [WARN] "${q}" (${note}) → HTTP ${res.status} (Gemini busy?)`);
        continue;
      }
      const body = await res.json();
      const clean = String(body.cleanQuery ?? "").trim();
      const ok = clean.length > 0;
      const matched = expect.test(clean) || expect.test(body.category ?? "");
      if (ok) interpreted++;
      const tag = ok ? (matched ? "PASS" : "SOFT") : "FAIL";
      if (!ok && strict) failures++;
      console.log(
        `  [${tag}] "${q}" (${note}) → cleanQuery="${clean}" category=${body.category ?? "null"}`
      );
    } catch (e) {
      softFail++;
      console.log(`  [WARN] "${q}" (${note}) → ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(
    `\n  Interpreted ${interpreted}/${MESSY_QUERIES.length} messy queries (${softFail} network/Gemini soft-fails).`
  );
  if (strict && interpreted < MESSY_QUERIES.length) {
    console.error("  Strict mode: not all messy queries interpreted.");
    failures++;
  }
}

async function main() {
  console.log("VAUTO AI flexibility test");
  await runOfflineGuards();
  if (!localOnly) {
    await runRemoteInterpretation().catch((e) => {
      console.warn("Remote interpretation skipped:", e instanceof Error ? e.message : e);
    });
  }

  console.log(
    failures === 0
      ? "\nAI flexibility test: OK"
      : `\nAI flexibility test: ${failures} failure(s)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
