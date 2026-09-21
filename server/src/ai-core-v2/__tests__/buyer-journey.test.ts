/**
 * VAUTO AI Core v2.5 — conversational buyer journey (deterministic, no network).
 *
 * Proves the mechanics the code controls: multi-turn state continuity, grounded
 * result-reference validation, no invented listingDetails target, execution-safe
 * search arguments, and zero-result continuation.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveListingReference,
  resultContextFromSearch,
  type ResultContext,
} from "../journey/result-context.js";
import {
  createGuardedListingDetails,
  runBuyerTurn,
  type BuyerSession,
} from "../journey/conversation.js";
import { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContract } from "../capability/capability.js";
import type { AuthorityVerifier } from "../loop/authority-verifier.js";
import type { ReasoningDecision, ReasoningProvider } from "../reasoning/reasoning-contract.js";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";
import type { SearchListingsData, SearchListingsListing } from "../capability/capabilities/search-listings.js";
import type { ListingDetailsData } from "../capability/capabilities/listing-details.js";

const verifyAll: AuthorityVerifier = async () => "VERIFIED_USER_INTENT";

function scripted(decisions: ReasoningDecision[]): ReasoningProvider {
  let i = 0;
  return async () => decisions[Math.min(i++, decisions.length - 1)] ?? {};
}

const L1: SearchListingsListing = { id: "a1", title: "Toyota Corolla 2018", price: 12000, location: "Vilnius" };
const L2: SearchListingsListing = { id: "b2", title: "Toyota Corolla 2020", price: 15000, location: "Kaunas" };

function mockSearch(listings: SearchListingsListing[]): CapabilityContract<unknown, SearchListingsData> {
  return {
    name: "searchListings",
    description: "x",
    operation: "READ",
    validate: (a) => a,
    execute: async () => ({ ok: true, data: { count: listings.length, listings }, provenance: "TOOL_DERIVED" as const }),
  };
}

function mockDetails(captured: string[]): CapabilityContract<{ idOrSlug: string }, ListingDetailsData> {
  return {
    name: "listingDetails",
    description: "x",
    operation: "READ",
    validate: (a) => a as { idOrSlug: string },
    execute: async (args) => {
      captured.push(args.idOrSlug);
      return { ok: true, data: { id: args.idOrSlug, title: "x", price: 1, location: "x", category: "vehicles" }, provenance: "TOOL_DERIVED" as const };
    },
  };
}

function buildRegistry(listings: SearchListingsListing[], detailsCaptured: string[]) {
  return (ctx: ResultContext): CapabilityRegistry => {
    const r = new CapabilityRegistry();
    r.register(mockSearch(listings));
    r.register(createGuardedListingDetails(ctx, mockDetails(detailsCaptured)));
    return r;
  };
}

function session(): BuyerSession {
  return { state: emptyMarketplaceState(), history: [], resultContext: { listings: [] } };
}

describe("v2.5 — result reference continuity", () => {
  const ctx: ResultContext = { listings: [{ id: "a1", title: "A", price: 1, location: "x" }, { id: "b2", title: "B", price: 2, location: "y" }] };

  it("resolves exact id and 1-based numeric index; rejects invented references", () => {
    assert.equal(resolveListingReference("a1", ctx), "a1");
    assert.equal(resolveListingReference("1", ctx), "a1");
    assert.equal(resolveListingReference("2", ctx), "b2");
    assert.equal(resolveListingReference("99", ctx), null, "out of range");
    assert.equal(resolveListingReference("zzz", ctx), null, "invented id");
    assert.equal(resolveListingReference("", ctx), null);
  });

  it("builds result context from a grounded search", () => {
    const rc = resultContextFromSearch({ count: 2, listings: [L1, L2] });
    assert.equal(rc.listings.length, 2);
    assert.equal(rc.listings[0]!.id, "a1");
  });

  it("guarded listingDetails resolves a reference and delegates; rejects invented target", async () => {
    const captured: string[] = [];
    const guarded = createGuardedListingDetails(ctx, mockDetails(captured));
    const okRes = await guarded.execute({ idOrSlug: "2" }, {});
    assert.equal(okRes.ok, true);
    assert.deepEqual(captured, ["b2"], "delegated with the resolved grounded id");

    const bad = await guarded.execute({ idOrSlug: "zzz" }, {});
    assert.equal(bad.ok, false);
    assert.equal(bad.failureKind, "not_found");
    assert.equal(captured.length, 1, "invented target never reaches the base");
  });
});

describe("v2.5 — conversational buyer journey (multi-turn)", () => {
  it("preserves state across turns: changed constraint replaces, unspecified persists", async () => {
    const s = session();
    await runBuyerTurn(s, "Ieškau Toyota Corolla iki 15000", {
      provider: scripted([{
        text: "Radau variantų.",
        statePatches: [
          { op: "setSearchSubject", subject: "Toyota Corolla", provenance: provenance("USER_STATED") },
          { op: "setHard", key: "priceMax", value: 15000, provenance: provenance("USER_STATED") },
        ],
      }]),
      verifier: verifyAll,
    });
    assert.equal(s.state.searchSubject, "Toyota Corolla");
    assert.equal(s.state.hardConstraints.priceMax, 15000);

    await runBuyerTurn(s, "Biudžetą galiu didinti iki 20000", {
      provider: scripted([{ text: "Atnaujinau.", statePatches: [{ op: "setHard", key: "priceMax", value: 20000, provenance: provenance("USER_STATED") }] }]),
      verifier: verifyAll,
    });
    assert.equal(s.state.hardConstraints.priceMax, 20000, "changed constraint replaced");
    assert.equal(s.state.searchSubject, "Toyota Corolla", "unspecified relevant state preserved");
  });

  it("extracts grounded result context and resolves a follow-up reference", async () => {
    const captured: string[] = [];
    const s = session();
    await runBuyerTurn(s, "Ieškau Toyota Corolla", {
      provider: scripted([
        { statePatches: [{ op: "setSearchSubject", subject: "Toyota Corolla", provenance: provenance("USER_STATED") }], capabilityRequest: { capability: "searchListings", args: {} } },
        { text: "Radau du skelbimus." },
      ]),
      verifier: verifyAll,
      buildRegistry: buildRegistry([L1, L2], captured),
    });
    assert.equal(s.resultContext.listings.length, 2);

    await runBuyerTurn(s, "Papasakok apie antrąjį", {
      provider: scripted([
        { capabilityRequest: { capability: "listingDetails", args: { idOrSlug: "2" } } },
        { text: "Antrasis — 2020 metų." },
      ]),
      verifier: verifyAll,
      buildRegistry: buildRegistry([L1, L2], captured),
    });
    assert.deepEqual(captured, ["b2"], "reference resolved to the second grounded listing id");
  });

  it("zero results does not collapse the conversation", async () => {
    const s = session();
    const rec = await runBuyerTurn(s, "Ieškau reto dalyko", {
      provider: scripted([
        { statePatches: [{ op: "setSearchSubject", subject: "retas", provenance: provenance("USER_STATED") }], capabilityRequest: { capability: "searchListings", args: {} } },
        { text: "Deja, atitikmenų neradau." },
      ]),
      verifier: verifyAll,
      buildRegistry: buildRegistry([], []),
    });
    assert.equal(s.resultContext.listings.length, 0);
    assert.equal(rec.assistantText, "Deja, atitikmenų neradau.");
    assert.equal(s.state.searchSubject, "retas", "user need preserved");

    // Conversation continues normally after zero results.
    const next = await runBuyerTurn(s, "O gal kitokios spalvos?", {
      provider: scripted([{ text: "Pabandykime platesnę paiešką." }]),
      verifier: verifyAll,
      buildRegistry: buildRegistry([], []),
    });
    assert.equal(next.assistantText, "Pabandykime platesnę paiešką.");
  });
});
