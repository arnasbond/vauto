/**
 * VAUTO AI Core v2.5 — conversational buyer journey orchestrator.
 *
 * A stateful, multi-turn wrapper around the existing bounded reasoning loop.
 * It owns the authoritative conversation state, the history, and the grounded
 * result context across turns, and guards listingDetails so the model can only
 * inspect a listing that was actually returned by a prior grounded search
 * (no invented targets). Advisory vs search remains model-driven; this layer
 * only validates and executes.
 */
import { runMultiStepLoop, type CapabilityCallRecord } from "../loop/multi-step-loop.js";
import { CapabilityRegistry } from "../capability/registry.js";
import { searchListingsCapability } from "../capability/capabilities/search-listings.js";
import { listingDetailsCapability, type ListingDetailsArgs, type ListingDetailsData } from "../capability/capabilities/listing-details.js";
import { webResearchCapability } from "../capability/capabilities/web-research.js";
import { prepareListingDraftCapability } from "../capability/capabilities/prepare-listing-draft.js";
import { publishListingCapability } from "../capability/capabilities/publish-listing.js";
import { analyzePhotoCapability } from "../capability/capabilities/analyze-photo.js";
import type {
  CapabilityContext,
  CapabilityContract,
} from "../capability/capability.js";
import type {
  ReasoningDecision,
  ReasoningInput,
  ReasoningProvider,
} from "../reasoning/reasoning-contract.js";
import type { AuthorityVerifier } from "../loop/authority-verifier.js";
import type { MarketplaceState } from "../state/marketplace-state.js";
import {
  EMPTY_RESULT_CONTEXT,
  resolveListingReference,
  resultContextFromSearch,
  type ResultContext,
} from "./result-context.js";
import type { SearchListingsData } from "../capability/capabilities/search-listings.js";

export interface BuyerSession {
  state: MarketplaceState;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  resultContext: ResultContext;
}

export interface BuyerTurnRecord {
  userTurn: string;
  decision: ReasoningDecision;
  stateBefore: MarketplaceState;
  stateAfter: MarketplaceState;
  capabilityCalls: CapabilityCallRecord[];
  assistantText: string;
  resultContext: ResultContext;
}

export interface BuyerTurnDeps {
  provider: ReasoningProvider;
  verifier: AuthorityVerifier;
  capabilityContext?: CapabilityContext;
  /** Registry factory (defaults to the real marketplace registry). Injectable for tests. */
  buildRegistry?: (resultContext: ResultContext) => CapabilityRegistry;
  diagnosticContext?: { threadId?: string; turnId?: string };
}

/**
 * Registry for the buyer journey: READ + PREPARE + CONSEQUENTIAL capabilities,
 * where listingDetails is reference-guarded against the current result context.
 */
export function createGuardedListingDetails(
  resultContext: ResultContext,
  base: CapabilityContract<ListingDetailsArgs, ListingDetailsData> = listingDetailsCapability
): CapabilityContract<ListingDetailsArgs, ListingDetailsData> {
  return {
    ...base,
    execute: async (args, ctx) => {
      const resolved = resolveListingReference(args.idOrSlug, resultContext);
      if (resolved == null) {
        return {
          ok: false,
          failureKind: "not_found",
          error: "listing not in grounded result set",
        };
      }
      return base.execute({ idOrSlug: resolved }, ctx);
    },
  };
}

export function createBuyerRegistry(resultContext: ResultContext): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.register(searchListingsCapability);
  registry.register(createGuardedListingDetails(resultContext));
  registry.register(webResearchCapability);
  registry.register(analyzePhotoCapability);
  registry.register(prepareListingDraftCapability);
  registry.register(publishListingCapability);
  return registry;
}

/**
 * READ-only registry for the owner test entry: searchListings + guarded
 * listingDetails only. Mutations / publish / transactions are absent, so any
 * request for them resolves to an unknown capability and fails closed.
 */
export function createReadOnlyBuyerRegistry(resultContext: ResultContext): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.register(searchListingsCapability);
  registry.register(createGuardedListingDetails(resultContext));
  return registry;
}

export async function runBuyerTurn(
  session: BuyerSession,
  userTurn: string,
  deps: BuyerTurnDeps
): Promise<BuyerTurnRecord> {
  const stateBefore = session.state;
  const buildRegistry = deps.buildRegistry ?? createBuyerRegistry;
  const registry = buildRegistry(session.resultContext);

  const input: ReasoningInput = {
    userTurn,
    history: session.history,
    state: session.state,
    capabilities: registry.describe(),
    priorResults: session.resultContext.listings.map((l) => ({ id: l.id, title: l.title })),
  };

  const result = await runMultiStepLoop({
    provider: deps.provider,
    registry,
    input,
    authorityVerifier: deps.verifier,
    capabilityContext: deps.capabilityContext,
    diagnosticContext: deps.diagnosticContext,
  });

  const searchData = result.capabilityCalls
    .filter((c) => c.name === "searchListings" && c.ok)
    .map((c) => c.data as SearchListingsData | undefined)
    .filter((d): d is SearchListingsData => d != null)
    .at(-1);
  const resultContext = searchData
    ? resultContextFromSearch(searchData)
    : session.resultContext;

  const assistantText =
    result.decision.text?.trim() || result.decision.clarification?.trim() || "";
  if (!assistantText) {
    throw new Error("core_v2_empty_visible_response");
  }

  session.state = result.finalState;
  session.history.push({ role: "user", text: userTurn });
  if (assistantText) session.history.push({ role: "assistant", text: assistantText });
  session.resultContext = resultContext;

  return {
    userTurn,
    decision: result.decision,
    stateBefore,
    stateAfter: result.finalState,
    capabilityCalls: result.capabilityCalls,
    assistantText,
    resultContext,
  };
}
