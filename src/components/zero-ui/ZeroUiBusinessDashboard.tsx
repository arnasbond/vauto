"use client";

import dynamic from "next/dynamic";
import { LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { ZeroUiScreenChrome } from "@/components/zero-ui/ZeroUiScreenChrome";

const PrivateSellerDashboard = dynamic(
  () =>
    import("@/components/dashboard/PrivateSellerDashboard").then(
      (m) => m.PrivateSellerDashboard
    ),
  { loading: () => <p className="py-8 text-center text-sm text-slate-500">Kraunama…</p> }
);

const ProBusinessDashboard = dynamic(
  () =>
    import("@/components/dashboard/ProBusinessDashboard").then(
      (m) => m.ProBusinessDashboard
    ),
  { loading: () => <p className="py-8 text-center text-sm text-slate-500">Kraunama…</p> }
);

export function ZeroUiBusinessDashboard() {
  const { openAuthModal } = useAuth();
  const {
    user,
    listings,
    isAuthenticated,
    authHydrated,
    deleteListing,
    markListingSold,
    renewListing,
    topUpWallet,
    promoteListing,
    showToast,
  } = useVauto();
  const { goToMarketplace } = useZeroUiScreen();

  const myListings = listings.filter((l) => l.sellerId === user.id);
  const isPro = user.role === "pro" || user.role === "admin";

  if (!authHydrated) {
    return (
      <ZeroUiScreenChrome subtitle="Kraunama…">
        <p className="py-12 text-center text-sm text-slate-500">Kraunama…</p>
      </ZeroUiScreenChrome>
    );
  }

  if (!isAuthenticated) {
    return (
      <ZeroUiScreenChrome subtitle="Reikia prisijungti">
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <p className="text-sm text-slate-600">
            Prisijunkite, kad matytumėte peržiūrų statistiką ir skambučių analitiką.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("/")}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1167b1] px-5 py-2.5 text-sm font-bold text-white"
          >
            <LogIn className="h-4 w-4" />
            Prisijungti
          </button>
        </div>
      </ZeroUiScreenChrome>
    );
  }

  return (
    <ZeroUiScreenChrome
      subtitle={`${myListings.length} aktyvūs skelbimai · peržiūros ir skambučiai`}
      onBack={() => goToMarketplace()}
    >
      {isPro ? (
        <ProBusinessDashboard
          user={user}
          listings={myListings}
          allListings={listings}
          onEdit={() => showToast("Redaguokite skelbimą profilio skiltyje", "info")}
          onDelete={(id) => void deleteListing(id)}
          onMarkSold={(id) => void markListingSold(id)}
          onTopUp={topUpWallet}
          onPromote={promoteListing}
          onRenew={(id) => void renewListing(id)}
        />
      ) : (
        <PrivateSellerDashboard
          listings={myListings}
          onEdit={() => showToast("Redaguokite skelbimą profilio skiltyje", "info")}
          onDelete={(id) => void deleteListing(id)}
          onMarkSold={(id) => void markListingSold(id)}
          onRenew={(id) => void renewListing(id)}
        />
      )}
    </ZeroUiScreenChrome>
  );
}
