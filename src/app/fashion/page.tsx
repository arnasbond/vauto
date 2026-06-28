"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { GuestFashionCabinet } from "@/components/clothing/GuestFashionCabinet";
import { useVauto } from "@/context/VautoContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";

export default function FashionPage() {
  const { activateWardrobeSpinta, authHydrated } = useVauto();
  const { trackEvent } = useUserBehavior();

  useEffect(() => {
    if (authHydrated) {
      activateWardrobeSpinta();
      trackEvent("spinta_enter", { pathname: "/fashion" });
    }
  }, [authHydrated, activateWardrobeSpinta, trackEvent]);

  return (
    <AppShell variant="plain">
      <GuestFashionCabinet />
    </AppShell>
  );
}
