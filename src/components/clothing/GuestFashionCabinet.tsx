"use client";

import { useEffect, useMemo } from "react";
import { LayoutGrid, LogIn, Sparkles } from "lucide-react";
import { SecretaryWarmGreeting } from "@/components/clothing/SecretaryWarmGreeting";
import { WardrobeCabinetGrid } from "@/components/clothing/WardrobeCabinetGrid";
import { useVauto } from "@/context/VautoContext";
import type { Listing } from "@/lib/types";

export function GuestFashionCabinet() {
  const {
    activateWardrobeSpinta,
    authHydrated,
    isAuthenticated,
    listings,
    openAuthModal,
    showToast,
  } = useVauto();

  useEffect(() => {
    if (authHydrated) activateWardrobeSpinta();
  }, [authHydrated, activateWardrobeSpinta]);

  const demoListings = useMemo((): Listing[] => {
    return listings
      .filter((l) => l.category === "clothing")
      .slice(0, 6);
  }, [listings]);

  return (
    <div className="chameleon-wardrobe pb-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <LayoutGrid className="h-6 w-6" />
        </span>
        <div>
          <p className="vauto-demo-badge text-xs">Viešas peržiūros režimas</p>
          <h1 className="text-xl font-semibold text-foreground">Mano asortimentas</h1>
          <p className="text-xs text-muted-foreground">
            Auto, NT, paslaugos ir prekės — peržiūrai be privalomo prisijungimo
          </p>
        </div>
      </div>

      <SecretaryWarmGreeting
        listings={demoListings}
        deals={[]}
        isGuest={!isAuthenticated}
      />

      {!isAuthenticated && (
        <button
          type="button"
          onClick={() => {
            openAuthModal("/fashion/");
            showToast(
              "Prisijunkite ir sukurkite skelbimus su AI — nuotrauka ar keliais žodžiais.",
              "info"
            );
          }}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl vauto-btn-primary py-3.5 text-sm shadow-sm"
        >
          <Sparkles className="h-4 w-4" />
          Pradėti kurti skelbimus su AI
        </button>
      )}

      {!isAuthenticated && (
        <button
          type="button"
          onClick={() => openAuthModal("/fashion/")}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl vauto-btn-secondary py-2.5 text-sm"
        >
          <LogIn className="h-4 w-4" />
          Jau turi paskyrą? Prisijunk
        </button>
      )}

      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide text-foreground">
          <LayoutGrid className="h-4 w-4 text-primary" />
          Prekės ir paslaugos
        </h2>
      </div>

      <WardrobeCabinetGrid
        listings={demoListings}
        onEdit={() =>
          showToast("Prisijunk, kad galėtum redaguoti savo skelbimus.", "info")
        }
      />
    </div>
  );
}
