"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TopAiCommandChrome } from "@/components/layout/TopAiCommandChrome";
import { GuestFashionCabinet } from "@/components/clothing/GuestFashionCabinet";
import { useVauto } from "@/context/VautoContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { notifyWardrobeBulkImportOpened } from "@/lib/vauto-agent-client";
import {
  WARDROBE_BULK_IMPORT_CHIPS,
  WARDROBE_CONTINUOUS_FLOW_GREETING,
} from "@/lib/agent-wardrobe-bulk-dialogue";

export default function FashionPage() {
  const router = useRouter();
  const { activateWardrobeSpinta, authHydrated, isAuthenticated } = useVauto();
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
    activateWardrobeSpinta();
    trackEvent("spinta_enter", { pathname: "/fashion" });
  }, [authHydrated, isAuthenticated, activateWardrobeSpinta, trackEvent, router]);

  return (
    <AppShell variant="plain">
      <TopAiCommandChrome variant="wardrobe" />
      <GuestFashionCabinet />
    </AppShell>
  );
}
