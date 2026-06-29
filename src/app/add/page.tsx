"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { SellerUploadPanel } from "@/components/SellerUploadPanel";
import {
  AiIntroModal,
  hasSeenAiIntro,
} from "@/components/photo/AiIntroModal";
import { useVauto } from "@/context/VautoContext";
import { createManualFallbackDraft } from "@/lib/ai-safeguards";
import { enrichClothingListingDraft } from "@/lib/clothing-catalog";

export default function AddPage() {
  const router = useRouter();
  const {
    isAuthenticated,
    authHydrated,
    requireAuthForListing,
    consumePendingSellerQuery,
    submitSellerContent,
    applyAgentListingDraft,
    activateWardrobeSpinta,
    sellerStep,
    user,
  } = useVauto();
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
      void submitSellerContent({ text: pending });
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
          },
          "Asortimento įkėlimas"
        )
      );
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
    submitSellerContent,
    applyAgentListingDraft,
    activateWardrobeSpinta,
    sellerStep,
    user.city,
    user.phone,
  ]);

  if (!authHydrated) {
    return (
      <AppShell>
        <div className="seller-flow-page min-h-full bg-[#0a1128] text-white">
          <HeroSection>
            <Header />
            <p className="mt-10 text-center text-sm text-slate-400">
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
        <div className="seller-flow-page min-h-full bg-[#0a1128] text-white">
          <HeroSection>
            <Header />
            <h2 className="mt-6 text-center text-xl font-bold text-white">
              {fashionMode ? "Asortimento įkėlimas" : "Naujas skelbimas"}
            </h2>
            <p className="mt-3 px-6 text-center text-sm text-slate-400">
              Prisijunkite arba užsiregistruokite, kad galėtumėte įdėti skelbimą.
            </p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mx-auto mt-6 block text-sm text-[#00f2fe] underline"
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
      <div className="seller-flow-page min-h-full bg-[#0a1128] text-white">
        <HeroSection>
          <Header />
          <h2 className="font-display mt-6 text-center text-xl font-bold text-white">
            {fashionMode ? "Asortimento įkėlimas" : "Naujas skelbimas"}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
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
        </HeroSection>

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
