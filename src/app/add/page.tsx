"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { HeroSection } from "@/components/HeroSection";
import { SellerListingSteps } from "@/components/home/SellerListingSteps";
import { HomeCategoryGrid } from "@/components/home/HomeCategoryGrid";
import { CategorySchemaPreview } from "@/components/marketplace/CategorySchemaPreview";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  addListingReturnPath,
  getVertical,
  parseAddListingSearch,
  resolveVerticalId,
} from "@vauto/shared/marketplace-domain";

/**
 * Legacy /add route — thin redirect into home AI seller chat (4-step flow).
 * Barcode / manual shells are deprecated; bottom "+" and Header "Įdėti" open
 * the assistant directly via openAiSellerListingChat.
 *
 * Intentionally avoids Suspense + useSearchParams — that combo can stick on
 * "Jungiamasi…" forever during Fast Refresh / soft-nav races.
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

export default function AddPage() {
  const [isFashion, setIsFashion] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [selectedVertical, setSelectedVertical] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [queryVertical, setQueryVertical] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const { isAuthenticated, authHydrated, requireAuthForListing } = useVauto();
  const { openAiSellerListingChat, startManualListing } = useVautoAgent();
  const startedRef = useRef(false);
  const selectedVerticalId = resolveVerticalId(selectedSlug || queryVertical);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setManualMode(params.get("manual") === "1");
      const parsed = parseAddListingSearch(window.location.search);
      setIsFashion(parsed.isFashion);
      setQueryVertical(parsed.uiSlug);
      if (parsed.verticalId && parsed.uiSlug) {
        setSelectedSlug(parsed.uiSlug);
        setSelectedVertical(getVertical(parsed.verticalId).label);
      }
    } catch {
      setIsFashion(false);
    } finally {
      setUrlReady(true);
    }
  }, []);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) return;
    if (!urlReady) return;
    if (startedRef.current) return;
    startedRef.current = true;
    if (manualMode) {
      startManualListing({
        verticalId: resolveVerticalId(selectedSlug || queryVertical),
        fashion: isFashion,
      });
      return;
    }
    const verticalId = resolveVerticalId(selectedSlug || queryVertical);
    void openAiSellerListingChat({
      verticalId,
      fashion: isFashion,
      navigateHome: true,
    });
  }, [
    authHydrated,
    isAuthenticated,
    urlReady,
    isFashion,
    manualMode,
    queryVertical,
    selectedSlug,
    openAiSellerListingChat,
    startManualListing,
  ]);

  if (!authHydrated) {
    return <AddRedirectShell statusHint="Jungiamasi…" />;
  }

  if (!isAuthenticated) {
    const returnPath = manualMode
      ? "/add?manual=1"
      : addListingReturnPath({
          isFashion,
          uiSlug: selectedSlug ?? queryVertical,
        });
    return (
      <VautoAdaptiveLayout>
        <div
          className="seller-flow-page mx-auto min-h-full w-full max-w-lg"
          data-seller-funnel
        >
          <HeroSection>
            <h1 className="mt-6 text-center text-xl font-bold text-[var(--vauto-text-main)]">
              {isFashion ? "Spinta — naujas drabužis" : "Naujas skelbimas"}
            </h1>
            <p className="mt-3 px-2 text-center text-sm leading-relaxed text-[var(--vauto-text-muted)]">
              Pasirinkite kategoriją arba aprašykite objektą / prekę laisvai.
              AI padeda su antrašte, aprašymu ir kainos rėžiu. Skelbimą
              publikuojate tik jūs — žmogus sprendžia.
            </p>
            <HomeCategoryGrid
              className="mx-auto mt-5 max-w-lg"
              onSelect={(_query, label, slug) => {
                setSelectedVertical(label);
                setSelectedSlug(slug);
                requireAuthForListing(addListingReturnPath({ uiSlug: slug }));
              }}
            />
            {selectedVertical ? (
              <div className="mt-3 px-2">
                <p
                  className="text-center text-sm font-medium text-[var(--vauto-text-main)]"
                  data-selected-vertical={selectedVertical}
                >
                  Pasirinkote: {selectedVertical}. Po prisijungimo aprašykite
                  objektą laisvai
                  {selectedVertical === "Elektronika"
                    ? " (pvz. MacBook) — transporto laukai nebus rodomi."
                    : "."}
                </p>
                {selectedVerticalId ? (
                  <CategorySchemaPreview verticalId={selectedVerticalId} />
                ) : null}
              </div>
            ) : null}
            <SellerListingSteps className="mt-5" />
            <p className="mt-4 text-center text-sm text-[var(--vauto-text-muted)]">
              Prisijunkite, kad galėtumėte kelti skelbimą per asistentą.
            </p>
            <button
              type="button"
              data-seller-start-auth
              onClick={() => requireAuthForListing(returnPath)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--ds-brand,#10b981)] px-5 text-sm font-bold text-white"
            >
              Prisijungti ir pradėti
            </button>
            <button
              type="button"
              data-seller-start-manual
              onClick={() => requireAuthForListing("/add?manual=1")}
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] px-5 text-sm font-bold text-[var(--ds-text-primary)]"
            >
              Sukurti skelbimą be AI
            </button>
          </HeroSection>
        </div>
      </VautoAdaptiveLayout>
    );
  }

  return <AddRedirectShell statusHint="Atidarome AI asistentą…" />;
}
