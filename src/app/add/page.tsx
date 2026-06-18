"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { SellerUploadPanel } from "@/components/SellerUploadPanel";
import { useVauto } from "@/context/VautoContext";

export default function AddPage() {
  const router = useRouter();
  const { isAuthenticated, requireAuthForListing } = useVauto();

  useEffect(() => {
    if (!isAuthenticated) {
      requireAuthForListing("/add");
    }
  }, [isAuthenticated, requireAuthForListing]);

  if (!isAuthenticated) {
    return (
      <AppShell>
        <HeroSection>
          <Header />
          <h2 className="mt-6 text-center text-xl font-bold text-white">
            Naujas skelbimas
          </h2>
          <p className="mt-3 px-6 text-center text-sm text-white/80">
            Prisijunkite arba užsiregistruokite, kad galėtumėte įdėti skelbimą.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mx-auto mt-6 block text-sm text-white/70 underline"
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
        <h2 className="mt-6 text-center text-xl font-bold text-white">
          Naujas skelbimas
        </h2>
        <p className="mt-2 text-center text-sm text-white/80">
          Viena zona — foto, video, tekstas arba balsas
        </p>
      </HeroSection>

      <ContentSection>
        <SellerUploadPanel />
      </ContentSection>
    </AppShell>
  );
}
