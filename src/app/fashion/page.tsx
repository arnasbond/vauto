"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TopAiCommandChrome } from "@/components/layout/TopAiCommandChrome";
import { GuestFashionCabinet } from "@/components/clothing/GuestFashionCabinet";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearchDispatch } from "@/context/VautoSearchContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { dispatchHomeReset } from "@/lib/home-reset";
import { notifyWardrobeBulkImportOpened } from "@/lib/vauto-agent-client";
import {
  WARDROBE_BULK_IMPORT_CHIPS,
  WARDROBE_CONTINUOUS_FLOW_GREETING,
} from "@/lib/agent-wardrobe-bulk-dialogue";
import { WARDROBE_SPINTA_GREETING } from "@/lib/wardrobe-spinta-session";

export default function FashionPage() {
  const router = useRouter();
  const { activateWardrobeSpinta, authHydrated, isAuthenticated, clearVisualSearch } =
    useVauto();
  const {
    setSearchQuery,
    setSearchLoading,
    clearAgentPinnedListings,
    resetMarketplaceFilters,
    setSearchInputMode,
    setSearchVoiceMode,
  } = useVautoSearchDispatch();
  const { trackEvent } = useUserBehavior();

  useEffect(() => {
    if (!authHydrated) return;
    if (isAuthenticated) {
      notifyWardrobeBulkImportOpened(WARDROBE_CONTINUOUS_FLOW_GREETING, {
        quickReplies: [...WARDROBE_BULK_IMPORT_CHIPS],
      });
      router.replace("/add?vertical=fashion");
      return;
    }
    setSearchQuery("");
    setSearchLoading(false);
    clearAgentPinnedListings();
    resetMarketplaceFilters();
    setSearchInputMode(null);
    setSearchVoiceMode(false);
    clearVisualSearch();
    dispatchHomeReset();
    activateWardrobeSpinta();
    trackEvent("spinta_enter", { pathname: "/fashion" });
    notifyWardrobeBulkImportOpened(WARDROBE_SPINTA_GREETING, {
      quickReplies: [...WARDROBE_BULK_IMPORT_CHIPS],
    });
  }, [
    authHydrated,
    isAuthenticated,
    activateWardrobeSpinta,
    trackEvent,
    router,
    setSearchQuery,
    setSearchLoading,
    clearAgentPinnedListings,
    resetMarketplaceFilters,
    setSearchInputMode,
    setSearchVoiceMode,
    clearVisualSearch,
  ]);

  return (
    <AppShell variant="plain">
      <TopAiCommandChrome variant="wardrobe" />
      <GuestFashionCabinet />
    </AppShell>
  );
}
