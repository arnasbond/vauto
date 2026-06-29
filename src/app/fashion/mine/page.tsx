"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { WardrobeCabinetSection } from "@/components/clothing/WardrobeCabinetSection";
import { useVauto } from "@/context/VautoContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { isBusinessProfile } from "@/lib/profile-type";

export default function FashionMinePage() {
  const router = useRouter();
  const {
    activateWardrobeSpinta,
    authHydrated,
    isAuthenticated,
    listings,
    chats,
    user,
    startEditListingFlow,
    markListingSold,
  } = useVauto();
  const { trackEvent } = useUserBehavior();

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      router.replace("/auth-gate/");
      return;
    }
    if (isBusinessProfile(user)) {
      router.replace("/profile/");
      return;
    }
    activateWardrobeSpinta();
    trackEvent("spinta_enter", { pathname: "/fashion/mine" });
  }, [
    authHydrated,
    isAuthenticated,
    user,
    activateWardrobeSpinta,
    trackEvent,
    router,
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
      <AppShell variant="plain">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">
          Kraunama…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell variant="plain">
      <div className="chameleon-wardrobe pb-8 pt-4 text-[var(--vauto-text-main)]">
        <WardrobeCabinetSection
          user={user}
          listings={myClothing}
          chats={chats}
          profileType="private"
          onEdit={startEditListingFlow}
          onMarkSold={(listing) => markListingSold(listing.id)}
        />
      </div>
    </AppShell>
  );
}
