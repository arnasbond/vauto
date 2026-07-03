"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { TopAiCommandChrome } from "@/components/layout/TopAiCommandChrome";
import { WardrobeCabinetSection } from "@/components/clothing/WardrobeCabinetSection";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useChat } from "@/context/ChatContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { useVautoSearchDispatch } from "@/context/VautoSearchContext";
import { isBusinessProfile } from "@/lib/profile-type";
import { dispatchHomeReset } from "@/lib/home-reset";
import { WARDROBE_SPINTA_GREETING } from "@/lib/wardrobe-spinta-session";

export default function FashionMinePage() {
  const router = useRouter();
  const {
    activateWardrobeSpinta,
    authHydrated,
    isAuthenticated,
    listings,
    user,
    startEditListingFlow,
    markListingSold,
    clearVisualSearch,
  } = useVauto();
  const { openWithGreeting } = useVautoAgent();
  const {
    setSearchQuery,
    setSearchLoading,
    clearAgentPinnedListings,
    resetMarketplaceFilters,
    setSearchInputMode,
    setSearchVoiceMode,
  } = useVautoSearchDispatch();
  const { chats } = useChat();
  const { trackEvent } = useUserBehavior();
  const spintaEnteredRef = useRef(false);

  useEffect(() => {
    if (!authHydrated || spintaEnteredRef.current) return;
    if (!isAuthenticated) {
      router.replace("/auth-gate/");
      return;
    }
    if (isBusinessProfile(user)) {
      router.replace("/profile/");
      return;
    }
    spintaEnteredRef.current = true;
    activateWardrobeSpinta();
    setSearchQuery("");
    setSearchLoading(false);
    clearAgentPinnedListings();
    resetMarketplaceFilters();
    setSearchInputMode(null);
    setSearchVoiceMode(false);
    clearVisualSearch();
    dispatchHomeReset();
    openWithGreeting(WARDROBE_SPINTA_GREETING);
    trackEvent("spinta_enter", { pathname: "/fashion/mine" });
  }, [
    authHydrated,
    isAuthenticated,
    user,
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
    openWithGreeting,
  ]);

  const myClothing = useMemo(
    () =>
      listings.filter(
        (l) => l.category === "clothing" && l.sellerId === user.id && l.status !== "sold"
      ),
    [listings, user.id]
  );

  if (!authHydrated || !isAuthenticated) {
    return (
      <VautoAdaptiveLayout variant="plain">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">
          Kraunama…
        </div>
      </VautoAdaptiveLayout>
    );
  }

  return (
    <VautoAdaptiveLayout variant="plain">
      <TopAiCommandChrome variant="wardrobe" />
      <div className="chameleon-wardrobe pb-8 text-[var(--vauto-text-main)]">
        <WardrobeCabinetSection
          user={user}
          listings={myClothing}
          chats={chats}
          profileType="private"
          onEdit={startEditListingFlow}
          onMarkSold={(listing) => markListingSold(listing.id)}
        />
      </div>
    </VautoAdaptiveLayout>
  );
}
