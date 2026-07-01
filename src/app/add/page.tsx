"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
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
      <AppShell>
        <div className="seller-flow-page min-h-full">
          <HeroSection>
            <Header />
            <p className="mt-10 text-center text-sm text-[var(--vauto-text-muted)]">
              Kraunama…
            </p>
          </HeroSection>
        </div>
      </AppShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppShell>
        <div className="seller-flow-page min-h-full">
          <HeroSection>
            <Header />
            <h2 className="mt-6 text-center text-xl font-bold text-[var(--vauto-text-main)]">
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
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="seller-flow-page min-h-full">
        {!blockStaticUi && (
          <HeroSection>
            <Header />
            <h2 className="font-display mt-6 text-center text-xl font-bold text-[var(--vauto-text-main)]">
              {fashionMode ? "Asortimento įkėlimas" : "Naujas skelbimas"}
            </h2>
            <p className="mt-2 text-center text-sm text-[var(--vauto-text-muted)]">
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
    </AppShell>
  );
}
