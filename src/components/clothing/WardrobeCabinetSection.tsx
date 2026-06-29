"use client";

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { cabinetSectionTitle, type ProfileType } from "@/lib/profile-type";
import { WardrobeCabinetGrid } from "@/components/clothing/WardrobeCabinetGrid";
import { WardrobeDealStepper } from "@/components/clothing/WardrobeDealStepper";
import { VisibilityBooster } from "@/components/clothing/VisibilityBooster";
import { WardrobePowerStats } from "@/components/clothing/WardrobePowerStats";
import { PortalLinksCenter } from "@/components/clothing/PortalLinksCenter";
import { NegotiationSandboxTrigger } from "@/components/clothing/NegotiationSandboxTrigger";
import { collectWardrobeDeals } from "@/lib/wardrobe-deals";
import { useVauto } from "@/context/VautoContext";
import type { ChatThread, Listing, UserProfile } from "@/lib/types";

interface WardrobeCabinetSectionProps {
  user: UserProfile;
  listings: Listing[];
  chats: ChatThread[];
  profileType?: ProfileType;
  onEdit: (listing: Listing) => void;
  onMarkSold: (listing: Listing) => void;
}

export function WardrobeCabinetSection({
  user,
  listings,
  chats,
  profileType,
  onEdit,
  onMarkSold,
}: WardrobeCabinetSectionProps) {
  const { refreshListingsCatalog, showToast } = useVauto();
  const deals = useMemo(
    () => collectWardrobeDeals(chats, listings, user.id),
    [chats, listings, user.id]
  );

  const clothingCount = listings.filter(
    (l) => l.category === "clothing" && l.status !== "sold"
  ).length;

  return (
    <section className="mt-2">
      <PortalLinksCenter
        userName={user.name}
        defaultLocation={user.city || "Vilnius"}
        contact={user.phone}
        profileType={profileType ?? user.profileType}
        onImportReady={() => {
          void refreshListingsCatalog();
        }}
        onToast={showToast}
      />

      <WardrobeDealStepper deals={deals} />

      <WardrobePowerStats user={user} listings={listings} inSpintaCabinet />

      <NegotiationSandboxTrigger
        listings={listings}
        sellerName={user.nickname?.trim() || user.name || "Pardavėja"}
        sellerUserId={user.id}
        profileType={profileType ?? user.profileType}
      />

      <VisibilityBooster listings={listings} inSpintaCabinet />

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-light tracking-wide text-[var(--vauto-text-main)]">
          <LayoutGrid className="h-4 w-4 text-[var(--chameleon-accent,#09b1a8)]" />
          {cabinetSectionTitle(profileType ?? user.profileType)}
          {clothingCount > 0 && (
            <span className="text-xs text-[var(--vauto-text-muted)]">({clothingCount})</span>
          )}
        </h2>
      </div>

      <WardrobeCabinetGrid
        listings={listings}
        onEdit={onEdit}
        onMarkSold={onMarkSold}
      />
    </section>
  );
}
