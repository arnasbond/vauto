"use client";

import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { SellerUploadPanel } from "@/components/SellerUploadPanel";

export default function AddPage() {
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
