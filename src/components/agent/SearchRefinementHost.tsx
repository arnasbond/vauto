"use client";

/**
 * SearchRefinementHost — legacy proactive search refinement wrapper.
 *
 * Single-authority invariant (Core v2):
 * An authoritative Core v2 turn is complete and final until the human user
 * explicitly submits the next turn. This host does NOT autonomously issue
 * secondary sendAgentMessage requests in reaction to zero-result search state.
 */
export function SearchRefinementHost() {
  return null;
}
