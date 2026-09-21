/**
 * VAUTO AI Core v2.5 — shadow buyer-journey product harness.
 *
 * Exercises the complete conversational buyer journey WITHOUT production
 * routing and WITHOUT paid inference. A scripted reasoning provider walks a
 * representative journey; swap in `createGeminiSemanticClaimProvider` bridged
 * to a ReasoningProvider for a live conversational evaluation.
 *
 *   npx tsx src/ai-core-v2/harness/buyer-journey.ts
 */
import { runBuyerTurn, type BuyerSession } from "../journey/conversation.js";
import { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContract } from "../capability/capability.js";
import type { AuthorityVerifier } from "../loop/authority-verifier.js";
import type { ReasoningDecision, ReasoningProvider } from "../reasoning/reasoning-contract.js";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";
import type { SearchListingsData, SearchListingsListing } from "../capability/capabilities/search-listings.js";
import { createGuardedListingDetails } from "../journey/conversation.js";
import type { ResultContext } from "../journey/result-context.js";

const verifyAll: AuthorityVerifier = async () => "VERIFIED_USER_INTENT";

const DEMO: SearchListingsListing[] = [
  { id: "l1", title: "Toyota Corolla 2018", price: 12000, location: "Vilnius" },
  { id: "l2", title: "Toyota Corolla 2020", price: 15000, location: "Kaunas" },
  { id: "l3", title: "Toyota Corolla Hybrid", price: 18000, location: "Klaipėda" },
];

function mockSearch(): CapabilityContract<unknown, SearchListingsData> {
  return {
    name: "searchListings",
    description: "ieškoti",
    operation: "READ",
    validate: (a) => a,
    execute: async () => ({ ok: true, data: { count: DEMO.length, listings: DEMO }, provenance: "TOOL_DERIVED" as const }),
  };
}

function registryFactory(ctx: ResultContext): CapabilityRegistry {
  const r = new CapabilityRegistry();
  r.register(mockSearch());
  r.register(createGuardedListingDetails(ctx, {
    name: "listingDetails",
    description: "detales",
    operation: "READ",
    validate: (a) => a as { idOrSlug: string },
    execute: async (args) => ({ ok: true, data: { id: args.idOrSlug, title: "x", price: 1, location: "x", category: "vehicles" }, provenance: "TOOL_DERIVED" as const }),
  }));
  return r;
}

function scripted(decisions: ReasoningDecision[]): ReasoningProvider {
  let i = 0;
  return async () => decisions[Math.min(i++, decisions.length - 1)] ?? {};
}

async function main(): Promise<void> {
  const session: BuyerSession = { state: emptyMarketplaceState(), history: [], resultContext: { listings: [] } };

  const turns: Array<{ user: string; provider: ReasoningProvider }> = [
    {
      user: "Ieškau Toyota Corolla.",
      provider: scripted([
        { statePatches: [{ op: "setSearchSubject", subject: "Toyota Corolla", provenance: provenance("USER_STATED") }], capabilityRequest: { capability: "searchListings", args: {} } },
        { text: "Radau tris Toyota Corolla variantus." },
      ]),
    },
    {
      user: "Papasakok apie antrąjį.",
      provider: scripted([
        { capabilityRequest: { capability: "listingDetails", args: { idOrSlug: "2" } } },
        { text: "Antrasis — 2020 metų, Kaune, 15000 €." },
      ]),
    },
    {
      user: "Biudžetas iki 16000.",
      provider: scripted([
        { text: "Supratau, filtrą pakoregavau.", statePatches: [{ op: "setHard", key: "priceMax", value: 16000, provenance: provenance("USER_STATED") }] },
      ]),
    },
  ];

  for (const t of turns) {
    const rec = await runBuyerTurn(session, t.user, { provider: t.provider, verifier: verifyAll, buildRegistry: registryFactory });
    console.log(`\n=== TURN: "${t.user}" ===`);
    console.log(`state before: ${JSON.stringify(rec.stateBefore.hardConstraints)} subject=${rec.stateBefore.searchSubject ?? "-"}`);
    console.log(`decision: text="${rec.decision.text ?? ""}" patches=${rec.decision.statePatches?.map((p) => p.op).join(",") || "-"} cap=${rec.decision.capabilityRequest?.capability ?? "-"}`);
    console.log(`capability calls: [${rec.capabilityCalls.map((c) => `${c.name}(${c.ok ? "ok" : c.error})`).join(", ") || "none"}]`);
    console.log(`assistant: "${rec.assistantText}"`);
    console.log(`state after: ${JSON.stringify(rec.stateAfter.hardConstraints)} subject=${rec.stateAfter.searchSubject ?? "-"}`);
    console.log(`result context: [${rec.resultContext.listings.map((l) => `${l.id}:${l.title}`).join(", ") || "empty"}]`);
  }
  console.log("\nDone. Swap the scripted provider for a live Gemini provider to evaluate conversationally.");
}

main().catch((e) => {
  console.error("RUNNER ERROR:", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
