import type { AgentFlowPhase } from "@/lib/agent-flow-phase";
import {
  shouldShowBrowseAgentComposer,
  shouldShowFlowAgentComposer,
} from "@/lib/agent-flow-phase";
import type { SellerFlowStep } from "@/lib/types";

export type CommandBarPlacement = "hero" | "dock" | "wizard" | "none";

export interface ShellChromeState {
  /** Fixed bottom AI command dock (browse or wizard). */
  showCommandDock: boolean;
  dockPlacement: "dock" | "wizard";
  /** Hero-only command bar on home (no active search). */
  showHeroCommand: boolean;
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
  const wizardDock = shouldShowFlowAgentComposer(opts.phase);
  const browseDock = shouldShowBrowseAgentComposer(
    opts.pathname,
    opts.sellerStep,
    opts.phase,
    { homeHasSearch }
  );

  const showCommandDock = wizardDock || browseDock;
  const showHeroCommand =
    isHome &&
    opts.sellerStep === "idle" &&
    !homeHasSearch &&
    !showCommandDock;

  const hideBottomNav =
    showCommandDock ||
    opts.agentSheetOpen ||
    opts.sellerStep === "processing" ||
    opts.sellerStep === "confirmation";

  const hideSiteFooter = showCommandDock || opts.sellerStep === "confirmation";

  const contentBottomClass = showCommandDock
    ? "pb-[calc(6.25rem+env(safe-area-inset-bottom))]"
    : hideBottomNav
      ? "pb-8"
      : "pb-28";

  return {
    showCommandDock,
    dockPlacement: wizardDock ? "wizard" : "dock",
    showHeroCommand,
    hideBottomNav,
    hideSiteFooter,
    contentBottomClass,
  };
}
