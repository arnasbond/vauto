"use client";

import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { ZeroUiScreenChrome } from "@/components/zero-ui/ZeroUiScreenChrome";
import { AdminListingModeration } from "@/components/admin/AdminListingModeration";

/**
 * Zero-UI admin panel — masked for non-admins (no “admin” / forbidden copy).
 */
export function ZeroUiAdminPanel() {
  const { isAdmin } = useVauto();
  const { goToMarketplace } = useZeroUiScreen();

  if (!isAdmin) {
    return (
      <ZeroUiScreenChrome subtitle="Puslapis nerastas" onBack={goToMarketplace}>
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <p className="text-4xl font-bold text-slate-900">404</p>
          <p className="mt-3 text-sm text-slate-600">
            Šio adreso nėra arba jis buvo perkeltas.
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
