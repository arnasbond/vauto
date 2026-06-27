import type { CategoryAttributeFilters } from "@/lib/category-attribute-filters";
import { EMPTY_CATEGORY_ATTRIBUTE_FILTERS } from "@/lib/category-attribute-filters";
import {
  mergeAgentIntoMarketplaceFilters,
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
} from "@/lib/marketplace-view";
import type { VoiceUiCommand } from "@/lib/voice-ui-commands";
import { voiceUiCommandReply } from "@/lib/voice-ui-commands";

export interface VoiceUiActionDeps {
  activeListingId?: string;
  marketplaceFilters: MarketplaceFilterState;
  setMarketplaceFilters: (filters: MarketplaceFilterState) => void;
  toggleSave: (id: string) => void;
  showToast: (msg: string, type: "success" | "info" | "error") => void;
}

export function applyVoiceUiCommand(
  cmd: VoiceUiCommand,
  deps: VoiceUiActionDeps
): { handled: boolean; reply?: string } {
  if (cmd.type === "none") return { handled: false };

  if (cmd.type === "apply_filter") {
    const merged = mergeAgentIntoMarketplaceFilters(deps.marketplaceFilters, cmd.filters, {
      resetAbsentGeo: false,
      resetAbsentCondition: false,
    });
    deps.setMarketplaceFilters(
      normalizeMarketplaceFilters({
        ...merged,
        categoryAttributes: {
          ...EMPTY_CATEGORY_ATTRIBUTE_FILTERS,
          ...merged.categoryAttributes,
          ...(cmd.categoryAttributes ?? {}),
        },
      })
    );
    const reply = voiceUiCommandReply(cmd) ?? undefined;
    if (reply) deps.showToast(reply, "success");
    document.getElementById("listing-results")?.scrollIntoView({ behavior: "smooth" });
    return { handled: true, reply };
  }

  if (cmd.type === "add_favorite") {
    const id = cmd.listingId ?? deps.activeListingId;
    if (!id) {
      deps.showToast("Nėra aktyvaus skelbimo — atidarykite skelbimą ir bandykite dar kartą.", "info");
      return { handled: true, reply: "Nėra aktyvaus skelbimo." };
    }
    deps.toggleSave(id);
    const reply = voiceUiCommandReply(cmd) ?? undefined;
    if (reply) deps.showToast(reply, "success");
    return { handled: true, reply };
  }

  if (cmd.type === "dismiss_listing") {
    if (cmd.mode === "next") {
      window.dispatchEvent(new CustomEvent("vauto:listing-next"));
      document.getElementById("listing-results")?.scrollBy({ top: 420, behavior: "smooth" });
    } else {
      window.dispatchEvent(new CustomEvent("vauto:listing-dismiss"));
      window.history.back();
    }
    const reply = voiceUiCommandReply(cmd) ?? undefined;
    if (reply) deps.showToast(reply, "info");
    return { handled: true, reply };
  }

  return { handled: false };
}

export function mergeVoiceUiFilters(
  current: MarketplaceFilterState,
  categoryAttributes?: CategoryAttributeFilters,
  filters?: import("@/lib/vauto-agent-client").AgentSearchFilters
): MarketplaceFilterState {
  const merged = mergeAgentIntoMarketplaceFilters(current, filters, {
    resetAbsentGeo: false,
    resetAbsentCondition: false,
  });
  if (!categoryAttributes || !Object.keys(categoryAttributes).length) return merged;
  return normalizeMarketplaceFilters({
    ...merged,
    categoryAttributes: {
      ...EMPTY_CATEGORY_ATTRIBUTE_FILTERS,
      ...merged.categoryAttributes,
      ...categoryAttributes,
    },
  });
}
