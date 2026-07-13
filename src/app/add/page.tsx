"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { DesktopAddAside } from "@/components/layout/desktop/DesktopAddAside";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { SellerUploadPanel } from "@/components/SellerUploadPanel";
import { FashionUploadPanel } from "@/components/clothing/FashionUploadPanel";
import {
  AiIntroModal,
  hasSeenAiIntro,
} from "@/components/photo/AiIntroModal";
import { useVauto } from "@/context/VautoContext";
import { createManualFallbackDraft } from "@/lib/ai-safeguards";
import { enrichClothingListingDraft } from "@/lib/clothing-catalog";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { notifyAgentFlow } from "@/lib/vauto-agent-client";
import { useAgentFlowPhase } from "@/hooks/useAgentFlowPhase";
import { useLayoutMode } from "@/context/LayoutModeContext";
import { isSellerFlowBlockingStaticUi } from "@/lib/agent-flow-phase";

export default function AddPage() {
  const router = useRouter();
  const {
    isAuthenticated,
    authHydrated,
    requireAuthForListing,
    consumePendingSellerQuery,
    applyAgentListingDraft,
    activateWardrobeSpinta,
    sellerStep,
    user,
  } = useVauto();
  const { sendAgentMessage } = useVautoAgent();
  const flowPhase = useAgentFlowPhase();
  const { isDesktop } = useLayoutMode();
  const blockStaticUi = isSellerFlowBlockingStaticUi(flowPhase);
  const [introOpen, setIntroOpen] = useState(false);
  const [startAiAfterIntro, setStartAiAfterIntro] = useState(false);
  const [fashionMode, setFashionMode] = useState(false);
  const fashionStartedRef = useRef(false);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      requireAuthForListing("/add");
      return;
    }

    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const isFashion = params.get("vertical") === "fashion";
    setFashionMode(isFashion);

    const pending = consumePendingSellerQuery();
    if (pending && sellerStep === "idle") {
      void sendAgentMessage(pending, { fromSearchBar: true });
      return;
    }

    if (isFashion && sellerStep === "idle" && !fashionStartedRef.current) {
      fashionStartedRef.current = true;
      activateWardrobeSpinta();
      applyAgentListingDraft(
        enrichClothingListingDraft(
          {
            ...createManualFallbackDraft({
              location: user.city || "Lietuva",
              contact: user.phone,
            }),
            category: "clothing",
            title: "Naujas drabužio skelbimas",
            description: "Asortimento įkėlimas — įkelkite nuotraukas arba aprašykite prekes.",
          },
          "Asortimento įkėlimas"
        )
      );
      notifyAgentFlow({ kind: "listing_wizard_opened", category: "clothing" });
      return;
    }

    if (!hasSeenAiIntro() && sellerStep === "idle" && !isFashion) {
      setIntroOpen(true);
    }
  }, [
    authHydrated,
    isAuthenticated,
    requireAuthForListing,
    consumePendingSellerQuery,
    sendAgentMessage,
    applyAgentListingDraft,
    activateWardrobeSpinta,
    sellerStep,
    user.city,
    user.phone,
  ]);

  if (!authHydrated) {
    return (
      <VautoAdaptiveLayout>
        <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg md:max-w-none">
          <HeroSection>
            {!isDesktop && <Header />}
            <p className="mt-10 text-center text-sm text-[var(--vauto-text-muted)] md:text-left">
              Kraunama…
            </p>
          </HeroSection>
        </div>
      </VautoAdaptiveLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <VautoAdaptiveLayout>
        <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg md:max-w-none">
          <HeroSection>
            {!isDesktop && <Header />}
            <h2 className="mt-6 text-center text-xl font-bold text-[var(--vauto-text-main)] md:text-left">
              {fashionMode ? "Asortimento įkėlimas" : "Naujas skelbimas"}
            </h2>
            <p className="mt-3 px-6 text-center text-sm text-[var(--vauto-text-muted)]">
              Prisijunkite arba užsiregistruokite, kad galėtumėte įdėti skelbimą.
            </p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mx-auto mt-6 block text-sm text-[var(--vauto-primary)] underline"
            >
              Grįžti į paiešką
            </button>
          </HeroSection>
        </div>
      </VautoAdaptiveLayout>
    );
  }

  const uploadPanel = (
    <>
      {!isDesktop && <Header />}
      <h2 className="font-display mt-6 text-center text-xl font-bold text-[var(--vauto-text-main)] md:mt-0 md:text-left md:text-2xl">
        {fashionMode ? "Asortimento įkėlimas" : "Naujas skelbimas"}
      </h2>
      <p className="mt-2 text-center text-sm text-[var(--vauto-text-muted)] md:text-left">
        {fashionMode
          ? "Pridėkite prekių nuotraukas — AI užpildys skelbimą automatiškai."
          : "Įklijuokite nuorodą iš Skelbiu, Autoplius, Aruodas ar Paslaugos.lt — arba pridėkite nuotraukas, AI užpildys skelbimą."}
      </p>
      {!fashionMode && (
        <div className="mt-5">
          <SellerUploadPanel
            autoOpenPhotoFlow={startAiAfterIntro}
            onPhotoFlowAutoOpened={() => setStartAiAfterIntro(false)}
          />
        </div>
      )}
      {fashionMode && (
        <div className="mt-5">
          <FashionUploadPanel />
        </div>
      )}
    </>
  );

  return (
    <VautoAdaptiveLayout>
      <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg md:max-w-none">
        {!blockStaticUi && (
          <HeroSection>
            {isDesktop ? (
              <div className="desktop-add-grid">
                <div className="desktop-add-card">{uploadPanel}</div>
                <DesktopAddAside fashionMode={fashionMode} />
              </div>
            ) : (
              uploadPanel
            )}
          </HeroSection>
        )}

        {!fashionMode && (
          <AiIntroModal
            open={introOpen}
            onClose={() => setIntroOpen(false)}
            onStartAi={() => {
              setIntroOpen(false);
              setStartAiAfterIntro(true);
            }}
          />
        )}
      </div>
    </VautoAdaptiveLayout>
  );
}
