"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { GuestFashionCabinet } from "@/components/clothing/GuestFashionCabinet";
import { useVauto } from "@/context/VautoContext";

export default function FashionPage() {
  const { activateWardrobeSpinta, authHydrated } = useVauto();

  useEffect(() => {
    if (authHydrated) activateWardrobeSpinta();
  }, [authHydrated, activateWardrobeSpinta]);

  return (
    <AppShell variant="plain">
      <GuestFashionCabinet />
    </AppShell>
  );
}
