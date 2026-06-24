"use client";

import { Shield } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { ZeroUiScreenChrome } from "@/components/zero-ui/ZeroUiScreenChrome";
import { AdminListingModeration } from "@/components/admin/AdminListingModeration";

export function ZeroUiAdminPanel() {
  const { isAdmin } = useVauto();
  const { goToMarketplace } = useZeroUiScreen();

  if (!isAdmin) {
    return (
      <ZeroUiScreenChrome subtitle="Prieiga uždrausta" onBack={goToMarketplace}>
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <Shield className="mb-3 h-10 w-10 text-[#1167b1]" />
          <p className="text-sm text-slate-600">
            Moderavimo skydelis prieinamas tik administratoriui.
          </p>
        </div>
      </ZeroUiScreenChrome>
    );
  }

  const pendingCount = 0;

  return (
    <ZeroUiScreenChrome
      subtitle={`Skelbimų moderavimas${pendingCount ? ` · ${pendingCount} laukia` : ""}`}
      onBack={() => goToMarketplace()}
    >
      <AdminListingModeration />
    </ZeroUiScreenChrome>
  );
}
