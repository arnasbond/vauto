/**
 * VAUTO AI Core v2.5 — owner test entry composition (READ-only).
 *
 * Proves the owner entry is READ-only at composition level: the read-only
 * registry exposes only searchListings + listingDetails, and any request for a
 * mutation/publish capability resolves to an unknown capability and fails
 * closed (never executed).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createReadOnlyBuyerRegistry, runBuyerTurn, type BuyerSession } from "../journey/conversation.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";
import type { AuthorityVerifier } from "../loop/authority-verifier.js";
import type { ReasoningDecision, ReasoningProvider } from "../reasoning/reasoning-contract.js";

const verifyAll: AuthorityVerifier = async () => "VERIFIED_USER_INTENT";

function scripted(decisions: ReasoningDecision[]): ReasoningProvider {
  let i = 0;
  return async () => decisions[Math.min(i++, decisions.length - 1)] ?? {};
}

function session(): BuyerSession {
  return { state: emptyMarketplaceState(), history: [], resultContext: { listings: [] } };
}

describe("v2.5 — owner entry READ-only composition", () => {
  it("read-only registry exposes only searchListings + listingDetails", () => {
    const names = createReadOnlyBuyerRegistry({ listings: [] }).describe().map((c) => c.name);
    assert.deepEqual(names.sort(), ["listingDetails", "searchListings"]);
    assert.equal(names.includes("publishListing"), false, "publish is not reachable");
  });

  it("a publishListing request fails closed (unknown capability, never executed)", async () => {
    const s = session();
    const rec = await runBuyerTurn(s, "Paskelbk mano skelbimą", {
      provider: scripted([
        { text: "Paskelbsiu jūsų skelbimą.", capabilityRequest: { capability: "publishListing", args: {} } },
        { text: "Negaliu — skaitymo režimas." },
      ]),
      verifier: verifyAll,
      buildRegistry: createReadOnlyBuyerRegistry,
    });
    assert.equal(rec.capabilityCalls.length, 1);
    assert.equal(rec.capabilityCalls[0]!.ok, false);
    assert.equal(rec.capabilityCalls[0]!.error, "unknown_capability");
  });
});
