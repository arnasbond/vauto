#!/usr/bin/env node
/**
 * Business (B2B cabinet) AI partner flow test harness.
 *
 * Verifies the business-client assistant behaves like a real, step-by-step
 * business partner:
 *   insights -> leads -> pricing -> promotion (Smart Boost) -> monetization gating
 * plus edge cases (zero metrics, empty leads, free-B2B Pro gating) and confirms
 * the deterministic business logic never crashes and never over-constrains.
 *
 * Modes:
 *   node scripts/test-business-flow.mjs            # offline logic + remote agent reachability probe
 *   node scripts/test-business-flow.mjs --local    # offline logic only (no network / no keys)
 *   node scripts/test-business-flow.mjs https://vauto-api.onrender.com
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

async function runOffline() {
  console.log("\n== Offline business logic (deterministic, no Gemini) ==");

  const {
    buildBusinessInsightsSummary,
    formatServiceLeadsMessage,
  } = await distImport("ai", "business-agent-tools.js");
  const {
    resolveMonetizationState,
    resolveSmartBoostPrice,
    inferMicroPaymentProduct,
    defaultPriceForProduct,
    requiresBusinessProForRegionStats,
    shouldOfferSmartBoost,
    SMART_BOOST_B2B,
    SMART_BOOST_C2C,
    B2B_LEAD_PRICE,
  } = await distImport("ai", "monetization-engine.js");
  const { summarizeMyListings } = await distImport("ai", "user-agent-context.js");

  // --- Insights: empty account never crashes and still guides the partner. ---
  const empty = buildBusinessInsightsSummary({
    userName: "Jonas Verslas",
    myListings: [],
    metrics: { views: 0, callClicks: 0, chatStarts: 0, saves: 0, interestScore: 0 },
    serviceLeadCount: 0,
    unopenedLeadCount: 0,
  });
  check(empty.activeListings === 0, "empty account: activeListings=0");
  check(
    /prad|skelbim/i.test(empty.message),
    "empty account: message nudges to start a listing (proactive, not blank)"
  );
  check(
    Array.isArray(empty.quickReplies) && empty.quickReplies.includes("Įkelti skelbimą"),
    "empty account: offers 'Įkelti skelbimą' quick reply"
  );

  // --- Insights: many views, low interest -> concrete pricing/photo advice. ---
  const stale = buildBusinessInsightsSummary({
    userName: "Jonas",
    myListings: [
      { id: "1", title: "BMW 320d", price: 9000, category: "cars", location: "Vilnius", status: "active" },
    ],
    metrics: { views: 120, callClicks: 1, chatStarts: 0, saves: 1, interestScore: 8 },
    serviceLeadCount: 0,
    unopenedLeadCount: 0,
  });
  check(
    /nuotrauk|kain/i.test(stale.message),
    "high views/low interest -> advises photo/price fix"
  );

  // --- Insights: low visibility -> boost/title suggestion. ---
  const lowVis = buildBusinessInsightsSummary({
    userName: "Jonas",
    myListings: [
      { id: "1", title: "Servisas", price: 50, category: "services", location: "Kaunas", status: "active" },
    ],
    metrics: { views: 2, callClicks: 0, chatStarts: 0, saves: 0, interestScore: 0 },
    serviceLeadCount: 0,
    unopenedLeadCount: 0,
  });
  check(/boost|matomum|antrašt/i.test(lowVis.message), "low visibility -> suggests boost/titles");

  // --- Leads: empty and populated both produce actionable, safe output. ---
  const noLeads = formatServiceLeadsMessage("Jonas", []);
  check(
    /nėra/i.test(noLeads.message) && noLeads.quickReplies.length > 0,
    "no leads -> friendly message + quick replies (no dead end)"
  );
  const withLeads = formatServiceLeadsMessage("Jonas", [
    { id: "a", query: "auto remontas", city: "Vilnius", opened: false },
    { id: "b", query: "padangų keitimas", city: "Kaunas", opened: true },
  ]);
  check(
    /radau 2/i.test(withLeads.message) && /neatidaryt/i.test(withLeads.message),
    "leads -> counts total + unopened, previews queries"
  );

  // --- Monetization audience + pricing integrity. ---
  const b2b = resolveMonetizationState({ userRole: "business" });
  const c2c = resolveMonetizationState({ userRole: "seller" });
  check(b2b.audience === "b2b", "business role resolves to b2b audience");
  check(c2c.audience === "c2c", "seller role resolves to c2c audience");
  check(
    resolveSmartBoostPrice(b2b) === SMART_BOOST_B2B && SMART_BOOST_B2B === 29.99,
    "b2b Smart Boost price = 29.99 (anti dumping)"
  );
  check(
    resolveSmartBoostPrice(c2c) === SMART_BOOST_C2C && SMART_BOOST_C2C === 2.99,
    "c2c Smart Boost price = 2.99"
  );

  // --- Micro-payment intent classification (voice/free text). ---
  check(inferMicroPaymentProduct("Noriu iškelti skelbimą, matomumas") === "smart_boost", "intent -> smart_boost");
  check(inferMicroPaymentProduct("duok tikslinį klientą leadą") === "b2b_lead", "intent -> b2b_lead");
  check(inferMicroPaymentProduct("regiono paklausos statistika") === "region_stats", "intent -> region_stats");
  check(defaultPriceForProduct("b2b_lead", b2b) === B2B_LEAD_PRICE, "b2b lead price = 14.99");

  // --- Pro gating must upsell, not silently block. ---
  const freeB2B = resolveMonetizationState({ userRole: "business", billingPlan: "free" });
  const proB2B = resolveMonetizationState({ userRole: "business", billingPlan: "pro" });
  check(requiresBusinessProForRegionStats(freeB2B) === true, "free B2B needs Pro for region stats (upsell)");
  check(requiresBusinessProForRegionStats(proB2B) === false, "Pro B2B unlocks region stats");

  // --- Smart Boost only offered when price is above market (not nagging). ---
  check(shouldOfferSmartBoost(freeB2B, 12000, 9000) === true, "boost offered when price > market");
  check(shouldOfferSmartBoost(freeB2B, 8500, 9000) === false, "boost NOT offered when price fair");
  check(shouldOfferSmartBoost(proB2B, 12000, 9000) === false, "Pro account not nagged with boost");

  // --- Empty-account guidance is role-aware (business != wardrobe framing). ---
  const bizEmpty = summarizeMyListings([], "Jonas", "business");
  const privEmpty = summarizeMyListings([], "Ieva", "buyer");
  check(
    /versl|skydel|lead|partner/i.test(bizEmpty) && !/Spinta tuščia/i.test(bizEmpty),
    "empty business account gets business-partner guidance (not 'Spinta tuščia')"
  );
  check(/Spinta/i.test(privEmpty), "empty private account keeps wardrobe framing");
}

async function runRemote() {
  console.log(`\n== Remote business agent reachability via ${base} ==`);

  // Agent endpoint must respond (even unauth) without crashing (no 5xx).
  try {
    const res = await fetch(`${base}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(30_000),
    });
    check(res.status < 500, `health endpoint reachable, no 5xx (got ${res.status})`);
    const body = await res.json().catch(() => ({}));
    if (body && typeof body === "object") {
      console.log(`        health ok=${JSON.stringify(body.ok ?? body.status ?? "n/a")}`);
    }
  } catch (e) {
    console.log(`  [WARN] health probe: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  console.log("VAUTO business (B2B cabinet) partner flow test");
  await runOffline();
  if (!localOnly) {
    await runRemote().catch((e) =>
      console.warn("Remote probe skipped:", e instanceof Error ? e.message : e)
    );
  }
  console.log(
    failures === 0
      ? "\nBusiness flow test: OK"
      : `\nBusiness flow test: ${failures} failure(s)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
