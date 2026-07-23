"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";

/**
 * Legacy /add route — thin redirect into home AI seller chat (4-step flow).
 * Barcode / manual shells are deprecated; bottom "+" and Header "Įdėti" open
 * the assistant directly via openAiSellerListingChat.
 */
function AddRedirectShell({
  statusHint,
}: {
  statusHint?: string | null;
}) {
  return (
    <VautoAdaptiveLayout>
      <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg">
        <HeroSection>
          <div className="md:hidden">
            <Header />
          </div>
          <div className="mt-10 flex flex-col items-center gap-3 px-4 text-center">
            <Sparkles className="h-8 w-8 text-[var(--vauto-primary)]" aria-hidden />
            <h2 className="font-display text-xl font-bold text-[var(--vauto-text-main)]">
              Atidarome VAUTO asistentą…
            </h2>
            <p className="max-w-md text-sm text-[var(--vauto-text-muted)]">
              Skelbimą keliate pokalbyje — 4 žingsniai su AI.
            </p>
            {statusHint ? (
              <p
                className="flex items-center gap-2 text-xs font-medium text-[var(--vauto-text-muted)]"
                role="status"
                aria-live="polite"
              >
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-[var(--vauto-primary)]"
                  aria-hidden
                />
                {statusHint}
              </p>
            ) : null}
          </div>
        </HeroSection>
      </div>
    </VautoAdaptiveLayout>
  );
}

function AddPageInner() {
  const searchParams = useSearchParams();
  const isFashion = searchParams.get("vertical") === "fashion";
  const { isAuthenticated, authHydrated, requireAuthForListing } = useVauto();
  const { openAiSellerListingChat } = useVautoAgent();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      requireAuthForListing(isFashion ? "/add?vertical=fashion" : "/add");
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void openAiSellerListingChat({
      fashion: isFashion,
      navigateHome: true,
    });
  }, [
    authHydrated,
    isAuthenticated,
    isFashion,
    openAiSellerListingChat,
    requireAuthForListing,
  ]);

  if (!authHydrated) {
    return <AddRedirectShell statusHint="Jungiamasi…" />;
  }

  if (!isAuthenticated) {
    return (
      <VautoAdaptiveLayout>
        <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg">
          <HeroSection>
            <Header />
            <h2 className="mt-6 text-center text-xl font-bold text-[var(--vauto-text-main)]">
              {isFashion ? "Spinta — naujas drabužis" : "Naujas skelbimas"}
            </h2>
            <p className="mt-3 px-6 text-center text-sm text-[var(--vauto-text-muted)]">
              Prisijunkite, kad galėtumėte kelti skelbimą per asistentą.
            </p>
          </HeroSection>
        </div>
      </VautoAdaptiveLayout>
    );
  }

  return <AddRedirectShell statusHint="Atidarome AI asistentą…" />;
}

export default function AddPage() {
  return (
    <Suspense fallback={<AddRedirectShell statusHint="Jungiamasi…" />}>
      <AddPageInner />
    </Suspense>
  );
}
