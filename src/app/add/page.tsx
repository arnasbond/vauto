"use client";

import { useEffect, useState } from "react";
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

export default function AddPage() {
  const router = useRouter();
  const {
    isAuthenticated,
    authHydrated,
    requireAuthForListing,
    consumePendingSellerQuery,
    submitSellerContent,
    sellerStep,
  } = useVauto();
  const [introOpen, setIntroOpen] = useState(false);
  const [startAiAfterIntro, setStartAiAfterIntro] = useState(false);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      requireAuthForListing("/add");
      return;
    }
    const pending = consumePendingSellerQuery();
    if (pending && sellerStep === "idle") {
      void submitSellerContent({ text: pending });
    }
    if (!hasSeenAiIntro() && sellerStep === "idle") {
      setIntroOpen(true);
    }
  }, [
    authHydrated,
    isAuthenticated,
    requireAuthForListing,
    consumePendingSellerQuery,
    submitSellerContent,
    sellerStep,
  ]);

  if (!authHydrated) {
    return (
      <AppShell>
        <HeroSection>
          <Header />
          <p className="mt-10 text-center text-sm text-[#6b7280]">
            Kraunama…
          </p>
        </HeroSection>
      </AppShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppShell>
        <HeroSection>
          <Header />
          <h2 className="mt-6 text-center text-xl font-bold text-[#111827]">
            Naujas skelbimas
          </h2>
          <p className="mt-3 px-6 text-center text-sm text-[#6b7280]">
            Prisijunkite arba užsiregistruokite, kad galėtumėte įdėti skelbimą.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mx-auto mt-6 block text-sm text-[#1167b1] underline"
          >
            Grįžti į paiešką
          </button>
        </HeroSection>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <HeroSection>
        <Header />
        <h2 className="font-display mt-6 text-center text-xl font-bold text-[#111827]">
          Naujas skelbimas
        </h2>
        <p className="mt-2 text-center text-sm text-[var(--vauto-text-muted,#6b7280)]">
          Įklijuokite nuorodą iš Autoplius ar Skelbiu — arba pridėkite nuotraukas, AI
          užpildys skelbimą.
        </p>
        <div className="mt-5">
          <SellerUploadPanel
            autoOpenPhotoFlow={startAiAfterIntro}
            onPhotoFlowAutoOpened={() => setStartAiAfterIntro(false)}
          />
        </div>
      </HeroSection>

      <AiIntroModal
        open={introOpen}
        onClose={() => setIntroOpen(false)}
        onStartAi={() => {
          setIntroOpen(false);
          setStartAiAfterIntro(true);
        }}
      />
    </AppShell>
  );
}
