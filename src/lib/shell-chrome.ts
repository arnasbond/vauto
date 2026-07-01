import type { AgentFlowPhase } from "@/lib/agent-flow-phase";
import { shouldShowFlowAgentComposer } from "@/lib/agent-flow-phase";
import type { SellerFlowStep } from "@/lib/types";

export type CommandBarPlacement = "hero" | "top" | "inline" | "wizard" | "none";

const TOP_COMMAND_PREFIXES = ["/", "/search", "/discover", "/fashion"];

function isTopCommandRoute(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  return TOP_COMMAND_PREFIXES.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`))
  );
}

export interface ShellChromeState {
  /** Sticky top AI command on browse routes (home, search, discover, fashion). */
  showTopCommand: boolean;
  /** Full home hero (logo + greeting) — only idle home without active search. */
  showHomeHero: boolean;
  /** Collapsed wizard FAB during listing flow. */
  showWizardBubble: boolean;
  hideBottomNav: boolean;
  hideSiteFooter: boolean;
  contentBottomClass: string;
}

export function resolveShellChrome(opts: {
  pathname: string;
  sellerStep: SellerFlowStep;
  phase: AgentFlowPhase;
  searchQuery: string;
  agentSheetOpen: boolean;
}): ShellChromeState {
  const homeHasSearch = opts.searchQuery.trim().length >= 3;
  const isHome = opts.pathname === "/" || opts.pathname === "";
  const wizardBubble = shouldShowFlowAgentComposer(opts.phase);
  const browseIdle = opts.sellerStep === "idle" && !opts.agentSheetOpen;

  const showTopCommand = browseIdle && isTopCommandRoute(opts.pathname);
  const showHomeHero =
    isHome && browseIdle && !homeHasSearch;

  const hideBottomNav =
    wizardBubble ||
    opts.agentSheetOpen ||
    opts.sellerStep === "processing" ||
    opts.sellerStep === "confirmation";

  const hideSiteFooter = wizardBubble || opts.sellerStep === "confirmation";

  const contentBottomClass = wizardBubble
    ? "pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
    : opts.agentSheetOpen
      ? "pb-[calc(7rem+env(safe-area-inset-bottom))]"
      : hideBottomNav
        ? "pb-[calc(2rem+env(safe-area-inset-bottom))]"
        : "pb-28";

  return {
    showTopCommand,
    showHomeHero,
    showWizardBubble: wizardBubble,
    hideBottomNav,
    hideSiteFooter,
    contentBottomClass,
  };
}
