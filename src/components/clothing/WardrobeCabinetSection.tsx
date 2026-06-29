"use client";

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { cabinetSectionTitle, type ProfileType } from "@/lib/profile-type";
import { SecretaryWarmGreeting } from "@/components/clothing/SecretaryWarmGreeting";
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
  const { publishBulkClothingListings, showToast } = useVauto();
  const deals = useMemo(
    () => collectWardrobeDeals(chats, listings, user.id),
    [chats, listings, user.id]
  );

  const clothingCount = listings.filter(
    (l) => l.category === "clothing" && l.status !== "sold"
  ).length;

  return (
    <section className="mt-2">
      <SecretaryWarmGreeting
        userName={user.name}
        listings={listings}
        deals={deals}
      />

      <PortalLinksCenter
        userName={user.name}
        defaultLocation={user.city || "Vilnius"}
        contact={user.phone}
        profileType={profileType ?? user.profileType}
        onImportReady={(drafts, voice) => {
          void publishBulkClothingListings(drafts);
          showToast(voice, "success");
        }}
        onToast={showToast}
      />

      <WardrobeDealStepper deals={deals} />

      <WardrobePowerStats user={user} listings={listings} inSpintaCabinet />

      <NegotiationSandboxTrigger
        listings={listings}
        sellerName={user.nickname?.trim() || user.name || "Pardavėja"}
      />

      <VisibilityBooster listings={listings} inSpintaCabinet />

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-light tracking-wide text-[#374151]">
          <LayoutGrid className="h-4 w-4 text-[#09b1a8]" />
          {cabinetSectionTitle(profileType ?? user.profileType)}
          {clothingCount > 0 && (
            <span className="text-xs text-[#9ca3af]">({clothingCount})</span>
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
