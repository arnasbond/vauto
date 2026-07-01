"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, LogIn, Sparkles } from "lucide-react";
import { SecretaryWarmGreeting } from "@/components/clothing/SecretaryWarmGreeting";
import { PortalLinksCenter } from "@/components/clothing/PortalLinksCenter";
import { WardrobeCabinetGrid } from "@/components/clothing/WardrobeCabinetGrid";
import { useVauto } from "@/context/VautoContext";
import {
  loadGuestWardrobeDrafts,
  saveGuestWardrobeDrafts,
} from "@/lib/wardrobe-guest-demo";
import type { AiExtractedListing, Listing } from "@/lib/types";
import type { WardrobeProfileImportItem } from "@/lib/wardrobe-profile-importer";

export function GuestFashionCabinet() {
  const {
    activateWardrobeSpinta,
    authHydrated,
    isAuthenticated,
    listings,
    openAuthModal,
    publishBulkClothingListings,
    showToast,
    user,
  } = useVauto();

  const [guestDrafts, setGuestDrafts] = useState<AiExtractedListing[]>([]);

  useEffect(() => {
    if (authHydrated) activateWardrobeSpinta();
  }, [authHydrated, activateWardrobeSpinta]);

  useEffect(() => {
    const stored = loadGuestWardrobeDrafts();
    if (stored.length) setGuestDrafts(stored);
  }, []);

  const demoListings = useMemo((): Listing[] => {
    return listings
      .filter((l) => l.category === "clothing")
      .slice(0, 6);
  }, [listings]);

  const handleGuestPreview = useCallback(
    (_items: WardrobeProfileImportItem[], drafts: AiExtractedListing[]) => {
      setGuestDrafts(drafts);
      saveGuestWardrobeDrafts(drafts);
    },
    []
  );

  const handlePublishAfterAuth = () => {
    if (guestDrafts.length === 0) return;
    void publishBulkClothingListings(guestDrafts);
  };

  const handleSaveAndStart = () => {
    if (guestDrafts.length === 0) {
      showToast("Pirmiausia importuok asortimentą — įklijuok profilio URL viršuje.", "info");
      return;
    }
    saveGuestWardrobeDrafts(guestDrafts);
    openAuthModal("/fashion/");
    showToast("Užsiregistruok — tavo importuoti skelbimai jau laukia!", "info");
  };

  return (
    <div className="chameleon-wardrobe pb-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <LayoutGrid className="h-6 w-6" />
        </span>
        <div>
          <p className="vauto-demo-badge text-xs">Viešas demo režimas</p>
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

      <PortalLinksCenter
        guestMode
        defaultLocation={user.city || "Vilnius"}
        contact=""
        onGuestPreview={handleGuestPreview}
        onToast={showToast}
      />

      {guestDrafts.length > 0 && !isAuthenticated && (
        <button
          type="button"
          onClick={handleSaveAndStart}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl vauto-btn-primary py-3.5 text-sm shadow-sm"
        >
          <Sparkles className="h-4 w-4" />
          Išsaugoti ir pradėti prekybą
        </button>
      )}

      {guestDrafts.length > 0 && isAuthenticated && (
        <button
          type="button"
          onClick={handlePublishAfterAuth}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl vauto-btn-primary py-3.5 text-sm shadow-sm"
        >
          <Sparkles className="h-4 w-4" />
          Publikuoti {guestDrafts.length} importuotus skelbimus
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
