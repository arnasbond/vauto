/**
 * VAUTO AI Core v2 — public surface.
 *
 * This package is the CLEAN, shadow-only foundation. It is physically
 * separated from the legacy orchestrator and depends only on stable
 * marketplace/tool infrastructure (repository, category registry). It does
 * NOT depend on the legacy planner/orchestrator, and the legacy Core must
 * NOT depend on it.
 */
export * from "./state/marketplace-state.js";
export * from "./state/state-patch.js";
export * from "./state/state-transitions.js";
export * from "./capability/capability.js";
export * from "./capability/registry.js";
export * from "./capability/capabilities/search-listings.js";
export * from "./capability/capabilities/listing-details.js";
export * from "./reasoning/reasoning-contract.js";
export * from "./reasoning/reasoning-loop.js";
export * from "./loop/multi-step-loop.js";
export * from "./loop/grounding.js";
export * from "./loop/authority-verifier.js";
export * from "./provider/prompt.js";
export * from "./provider/schema.js";
export * from "./provider/gemini-provider.js";
export * from "./shadow/shadow-runner.js";
export * from "./harness/semantic-harness.js";
