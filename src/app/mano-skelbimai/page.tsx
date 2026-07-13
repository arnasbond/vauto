"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { TopAiCommandChrome } from "@/components/layout/TopAiCommandChrome";
import { ManoSkelbimaiDashboard } from "@/components/dashboard/ManoSkelbimaiDashboard";
import { useVauto } from "@/context/VautoContext";

export default function ManoSkelbimaiPage() {
  const router = useRouter();
  const { authHydrated, isAuthenticated, listings, user } = useVauto();

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      router.replace("/auth-gate/");
    }
  }, [authHydrated, isAuthenticated, router]);

  const myListings = listings.filter((l) => l.sellerId === user.id);

  if (!authHydrated || !isAuthenticated) {
    return (
      <VautoAdaptiveLayout variant="plain">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--anonser-text-muted)]">
          Kraunama…
        </div>
      </VautoAdaptiveLayout>
    );
  }

  return (
    <VautoAdaptiveLayout variant="plain">
      <TopAiCommandChrome variant="wardrobe" />
      <ManoSkelbimaiDashboard listings={myListings} />
    </VautoAdaptiveLayout>
  );
}
