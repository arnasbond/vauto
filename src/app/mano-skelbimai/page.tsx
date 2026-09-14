"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { TopAiCommandChrome } from "@/components/layout/TopAiCommandChrome";
import { AgentChatStrip } from "@/components/home/AgentChatStrip";
import { ManoSkelbimaiDashboard } from "@/components/dashboard/ManoSkelbimaiDashboard";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { isEmbeddedAgentChatVisible } from "@/lib/agent-chat-layout";

export default function ManoSkelbimaiPage() {
  return (
    <Suspense
      fallback={
        <VautoAdaptiveLayout variant="plain">
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--anonser-text-muted)]">
            Kraunama…
          </div>
        </VautoAdaptiveLayout>
      }
    >
      <ManoSkelbimaiPageContent />
    </Suspense>
  );
}

function ManoSkelbimaiPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetId = searchParams.get("id")?.trim() || undefined;
  const { authHydrated, isAuthenticated, listings, user } = useVauto();
  const { messages, busy } = useVautoAgent();
  const chatActive = isEmbeddedAgentChatVisible(messages, busy);
  const chatAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatActive) return;
    chatAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [chatActive]);

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
      <div ref={chatAnchorRef} />
      {!chatActive ? (
        <TopAiCommandChrome variant="wardrobe" />
      ) : (
        <div className="mb-3 w-full min-w-0">
          <AgentChatStrip />
        </div>
      )}
      <ManoSkelbimaiDashboard listings={myListings} targetId={targetId} />
    </VautoAdaptiveLayout>
  );
}
