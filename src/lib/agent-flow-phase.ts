import type { SellerFlowStep } from "@/lib/types";

/**
 * P7b — unified agent + seller flow phase machine.
 * P7c — extends toward AI-first search (see ai-first-search-vision.ts + SearchRefinementHost).
 */
export type AgentFlowPhase =
  | "idle"
  | "agent_chat"
  | "listing_processing"
  | "listing_wizard"
  | "listing_published";

export function resolveAgentFlowPhase(
  sellerStep: SellerFlowStep,
  opts?: { agentSheetOpen?: boolean }
): AgentFlowPhase {
  switch (sellerStep) {
    case "processing":
      return "listing_processing";
    case "confirmation":
      return "listing_wizard";
    case "published":
      return "listing_published";
    case "idle":
    default:
      return opts?.agentSheetOpen ? "agent_chat" : "idle";
  }
}

/** Persistent bottom composer — seller wizard/processing on any route (incl. /add overlay). */
export function shouldShowFlowAgentComposer(phase: AgentFlowPhase): boolean {
  return phase === "listing_wizard" || phase === "listing_processing";
}

const BROWSE_AI_PATH_PREFIXES = ["/", "/search", "/discover", "/fashion"];

function isBrowseAiRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return BROWSE_AI_PATH_PREFIXES.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`))
  );
}

/** P7c-full — AI-first browse dock when seller flow is idle on marketplace routes. */
export function shouldShowBrowseAgentComposer(
  pathname: string,
  sellerStep: SellerFlowStep,
  phase: AgentFlowPhase,
  opts?: { homeHasSearch?: boolean }
): boolean {
  if (sellerStep !== "idle") return false;
  if (phase === "listing_wizard" || phase === "listing_processing") return false;

  if (pathname === "/" || pathname === "") {
    return Boolean(opts?.homeHasSearch);
  }

  return isBrowseAiRoute(pathname);
}

/** Hide static upload/import CTAs while agent drives the form. */
export function isSellerFlowBlockingStaticUi(phase: AgentFlowPhase): boolean {
  return (
    phase === "listing_wizard" ||
    phase === "listing_processing" ||
    phase === "listing_published"
  );
}
