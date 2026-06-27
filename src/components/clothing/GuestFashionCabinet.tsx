"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LogIn, Shirt, Sparkles } from "lucide-react";
import { SecretaryWarmGreeting } from "@/components/clothing/SecretaryWarmGreeting";
import { WardrobeProfileImporter } from "@/components/clothing/WardrobeProfileImporter";
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
      showToast("Pirmiausia importuok spintą — įklijuok profilio URL viršuje.", "info");
      return;
    }
    saveGuestWardrobeDrafts(guestDrafts);
    openAuthModal("/fashion/");
    showToast("Užsiregistruok — tavo importuoti drabužiai jau laukia!", "info");
  };

  return (
    <div className="chameleon-wardrobe pb-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-600 text-white shadow-md">
          <Shirt className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fuchsia-600">
            Viešas demo režimas
          </p>
          <h1 className="text-xl font-semibold text-slate-900">VAUTO Spinta</h1>
          <p className="text-xs text-slate-500">
            Pirk ir parduok drabužius — be privalomo prisijungimo peržiūrai
          </p>
        </div>
      </div>

      <SecretaryWarmGreeting
        listings={demoListings}
        deals={[]}
        isGuest={!isAuthenticated}
      />

      <WardrobeProfileImporter
        guestMode
        defaultLocation={user.city || "Vilnius"}
        contact=""
        inSpintaCabinet
        onGuestPreview={handleGuestPreview}
        onToast={showToast}
      />

      {guestDrafts.length > 0 && !isAuthenticated && (
        <button
          type="button"
          onClick={handleSaveAndStart}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 py-3.5 text-sm font-semibold text-white shadow-md"
        >
          <Sparkles className="h-4 w-4" />
          Išsaugoti ir pradėti prekybą
        </button>
      )}

      {guestDrafts.length > 0 && isAuthenticated && (
        <button
          type="button"
          onClick={handlePublishAfterAuth}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-600 py-3.5 text-sm font-semibold text-white shadow-md"
        >
          <Sparkles className="h-4 w-4" />
          Publikuoti {guestDrafts.length} importuotus drabužius
        </button>
      )}

      {!isAuthenticated && (
        <button
          type="button"
          onClick={() => openAuthModal("/fashion/")}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-200 bg-white py-2.5 text-sm font-medium text-fuchsia-700"
        >
          <LogIn className="h-4 w-4" />
          Jau turi paskyrą? Prisijunk
        </button>
      )}

      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-light tracking-wide text-[#374151]">
          <Shirt className="h-4 w-4 text-fuchsia-600" />
          Mados turgus
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
