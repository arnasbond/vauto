"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Sparkles } from "lucide-react";
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
  const [describeText, setDescribeText] = useState("");
  const { isAuthenticated, authHydrated, requireAuthForListing, authRedirectPath } = useVauto();
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
    // FC-UX — the manual intent is carried by the auth redirect path BEFORE the
    // URL redirect lands (the auth modal sets authRedirectPath="/add?manual=1"
    // when the user picks "Užpildyti viską pačiam"). The URL is also checked so a
    // direct deep-link still works where the query is preserved. Without this,
    // the AI seller chat auto-opened and raced the manual redirect.
    const manualIntent =
      manualMode ||
      (authRedirectPath != null && authRedirectPath.includes("manual=1"));
    if (manualIntent) {
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
    authRedirectPath,
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
            <h1 className="mt-6 text-left text-2xl font-bold text-[var(--vauto-text-main)]">
              {isFashion ? "Spinta — naujas drabužis" : "Ką parduodate?"}
            </h1>
            <p className="mt-2 text-left text-sm leading-relaxed text-[var(--vauto-text-muted)]">
              Nufotografuokite prekę arba trumpai aprašykite. VAUTO padės paruošti skelbimą.
            </p>
            {/*
              P2 / V5 photo-first — large photo capture is the primary entry,
              a concise text description is the alternative, and the manual
              route stays clearly visible. Categories are demoted below as
              secondary navigation, never the main sell composition.
            */}
            <div className="mx-auto mt-5 flex w-full max-w-lg flex-col gap-3">
              <button
                type="button"
                data-seller-start-photo
                onClick={() => requireAuthForListing(returnPath)}
                className="flex min-h-[11rem] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] px-5 text-[var(--ds-text-primary)] transition hover:border-[var(--ds-brand)]/50 hover:bg-[var(--ds-brand-soft)]"
              >
                <Camera className="h-11 w-11 text-[var(--ds-brand)]" aria-hidden />
                <span className="text-base font-bold">Nufotografuokite prekę</span>
                <span className="text-xs font-medium text-[var(--ds-text-muted)]">
                  Galite pridėti daugiau nuotraukų
                </span>
              </button>

              <p className="flex items-center gap-3 text-xs font-medium text-[var(--ds-text-muted)]">
                <span className="h-px flex-1 bg-[var(--ds-border-subtle)]" aria-hidden />
                arba
                <span className="h-px flex-1 bg-[var(--ds-border-subtle)]" aria-hidden />
              </p>

              <input
                type="text"
                data-seller-describe
                value={describeText}
                onChange={(e) => setDescribeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") requireAuthForListing(returnPath);
                }}
                placeholder="Aprašykite, ką parduodate…"
                className="min-h-12 w-full rounded-2xl border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] px-4 text-sm font-medium text-[var(--ds-text-primary)] outline-none placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-brand)]"
              />

              <button
                type="button"
                data-seller-start-auth
                onClick={() => requireAuthForListing(returnPath)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--ds-brand,#10b981)] px-5 text-sm font-bold text-white"
              >
                Tęsti su VAUTO AI
              </button>
              <button
                type="button"
                data-seller-start-manual
                onClick={() => requireAuthForListing("/add?manual=1")}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] px-5 text-sm font-bold text-[var(--ds-text-primary)]"
              >
                Užpildyti viską pačiam
              </button>
            </div>
            <HomeCategoryGrid
              className="mx-auto mt-8 max-w-lg"
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
          </HeroSection>
        </div>
      </VautoAdaptiveLayout>
    );
  }

  return <AddRedirectShell statusHint="Atidarome AI asistentą…" />;
}
