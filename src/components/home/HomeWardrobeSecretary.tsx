"use client";

import { useMemo } from "react";
import { SecretaryWarmGreeting } from "@/components/clothing/SecretaryWarmGreeting";
import { useVauto } from "@/context/VautoContext";
import { isPrivateProfile } from "@/lib/profile-type";
import { collectWardrobeDeals } from "@/lib/wardrobe-deals";

/** Rodo „Tavo AI sekretorę“ pradžioje tik kai privatus vartotojas ir spinta tuščia. */
export function HomeWardrobeSecretary() {
  const { user, listings, chats, isAuthenticated, authHydrated } = useVauto();

  const myListings = useMemo(
    () => listings.filter((l) => l.sellerId === user.id),
    [listings, user.id]
  );

  const clothingCount = useMemo(
    () =>
      myListings.filter((l) => l.category === "clothing" && l.status !== "sold").length,
    [myListings]
  );

  const deals = useMemo(
    () => collectWardrobeDeals(chats, myListings, user.id),
    [chats, myListings, user.id]
  );

  if (!authHydrated || !isAuthenticated || !isPrivateProfile(user)) return null;
  if (clothingCount > 0) return null;

  return (
    <div className="mb-6 px-4">
      <SecretaryWarmGreeting userName={user.name} listings={myListings} deals={deals} />
    </div>
  );
}
