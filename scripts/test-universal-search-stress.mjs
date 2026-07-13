#!/usr/bin/env node
/**
 * Universal classifieds intent stress test — Stress Test 1 (job search).
 *
 * Verifies VAUTO treats "ieskau darbo" as jobs category intent, not furniture keyword match.
 *
 *   node scripts/test-universal-search-stress.mjs
 *   node scripts/test-universal-search-stress.mjs --local
 *
 * Requires: npm run server:build
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "server", "dist");

const STRESS_QUERY = "ieskau darbo bet kokio 50 km spinduliu";

let failures = 0;
function check(cond, label) {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${label}`);
}

function distImport(...segments) {
  return import(pathToFileURL(join(dist, ...segments)).href);
}

async function runStressTest1() {
  console.log("\n== Stress Test 1: Conversational job search (universal platform) ==");
  console.log(`Query: "${STRESS_QUERY}"\n`);

  const {
    isJobSearchQuery,
    inferUniversalListingCategory,
    buildJobSearchConversationalReply,
    extractSearchRadiusKm,
    jobSearchKeywordQuery,
  } = await distImport("ai", "universal-search-intent.js");
  const { normalizeProductSearchQuery, inferSearchCategory } = await distImport(
    "ai",
    "product-search-query.js"
  );
  const { isConversationalSearchIntent } = await distImport("ai", "search-agent.js");
  const { resolveSupervisorFinalReply, isGenericEmptySearchReply } = await distImport(
    "ai",
    "supervisor-tool-runner.js"
  );

  check(isJobSearchQuery(STRESS_QUERY), "isJobSearchQuery → true (employment intent)");
  check(
    inferUniversalListingCategory(STRESS_QUERY) === "jobs",
    'inferUniversalListingCategory → "jobs"'
  );
  check(inferSearchCategory(STRESS_QUERY) === "jobs", 'inferSearchCategory → "jobs"');
  check(extractSearchRadiusKm(STRESS_QUERY) === 50, "extractSearchRadiusKm → 50");
  check(
    jobSearchKeywordQuery(STRESS_QUERY) === "",
    "jobSearchKeywordQuery → empty (category-only search, no furniture keyword)"
  );
  check(
    normalizeProductSearchQuery(STRESS_QUERY) === "",
    "normalizeProductSearchQuery → empty (no blind darbo token)"
  );
  check(
    !isConversationalSearchIntent(STRESS_QUERY),
    "isConversationalSearchIntent → false (routes to category search)"
  );

  const reply = buildJobSearchConversationalReply(STRESS_QUERY, 2);
  check(
    /matau.*ieškote darbo/i.test(reply),
    "conversational reply mentions job search intent"
  );
  check(
    /tikrinu darbo skelbimų kategoriją/i.test(reply),
    'conversational reply contains "tikrinu darbo skelbimų kategoriją"'
  );
  check(!/^rasta \d+ skelbim/i.test(reply), "reply is NOT dry Rasta X skelbimų");

  const supervisorReply = resolveSupervisorFinalReply({
    draftText: "Rasta 2 skelbimų.",
    toolCalls: [
      {
        name: "searchListings",
        result: { count: 2, summary: reply },
      },
    ],
    searchToolCount: 2,
    lastUserQuery: STRESS_QUERY,
    sideEffect: { type: "search", searchQuery: "", listingIds: [] },
  });
  check(
    /tikrinu darbo skelbimų kategoriją/i.test(supervisorReply),
    "resolveSupervisorFinalReply uses conversational job reply"
  );
  check(
    isGenericEmptySearchReply("Rasta 2 skelbimų."),
    'dry "Rasta 2 skelbimų." flagged as generic (replaced)'
  );

  const supervisorSearchFallback = resolveSupervisorFinalReply({
    draftText: "Rasta 2 skelbimų.",
    toolCalls: [{ name: "searchListings", result: { count: 2, summary: "Rasta 2 skelbimų." } }],
    searchToolCount: 2,
    lastUserQuery: STRESS_QUERY,
    sideEffect: { type: "search", searchQuery: "", listingIds: ["a", "b"] },
  });
  check(
    /tikrinu darbo skelbimų kategoriją/i.test(supervisorSearchFallback),
    "job reply wins over generic search sideEffect fallback"
  );

  check(
    !isJobSearchQuery("ergonominė darbo kėdė"),
    "furniture title alone is NOT job search"
  );
}

async function main() {
  console.log("VAUTO universal search stress test");
  await runStressTest1();

  console.log(
    failures === 0
      ? "\nUniversal search stress test: OK"
      : `\nUniversal search stress test: ${failures} failure(s)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
