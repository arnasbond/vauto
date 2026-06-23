"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useState } from "react";
import { LayoutDashboard, LogIn, Smartphone } from "lucide-react";
import { AdminProfileShell } from "@/components/admin/AdminProfileShell";
import { ProUpgradeNotice } from "@/components/dashboard/ProUpgradeNotice";
import { PrivacySettingsCard, PushAlertsSettingsCard } from "@/components/privacy/PrivacySettingsCard";
import { SocialSyncSettingsCard } from "@/components/social/SocialSyncSettingsCard";
import { ConnectionStatusCard } from "@/components/status/ConnectionStatusCard";
import { WakeWordSettingsCard } from "@/components/voice/WakeWordSettingsCard";
import { SellerTrustCard } from "@/components/trust/SellerTrustCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { EditListingModal } from "@/components/dashboard/EditListingModal";
import { SavedListingsSection } from "@/components/dashboard/SavedListingsSection";
import { WishlistSection } from "@/components/wishlist/WishlistSection";
import { UserSupportInbox } from "@/components/support/UserSupportInbox";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import type { Listing } from "@/lib/types";

const PrivateSellerDashboard = dynamic(
  () =>
    import("@/components/dashboard/PrivateSellerDashboard").then(
      (m) => m.PrivateSellerDashboard
    ),
  {
    loading: () => (
      <div className="vauto-dashboard-card rounded-2xl py-10 text-center text-sm text-slate-500">
        Kraunamas valdymo skydelis…
      </div>
    ),
  }
);

const ProBusinessDashboard = dynamic(
  () =>
    import("@/components/dashboard/ProBusinessDashboard").then(
      (m) => m.ProBusinessDashboard
    ),
  {
    loading: () => (
      <div className="vauto-dashboard-card rounded-2xl py-10 text-center text-sm text-slate-500">
        Kraunamas verslo skydelis…
      </div>
    ),
  }
);

export default function ProfilePage() {
  const { openAuthModal } = useAuth();
  const {
    user,
    listings,
    isAuthenticated,
    logout,
    deleteListing,
    updateListing,
    markListingSold,
    topUpWallet,
    promoteListing,
    renewListing,
    showToast,
    isAdmin,
  } = useVauto();

  const [editingListing, setEditingListing] = useState<Listing | null>(null);

  const myListings = listings.filter((l) => l.sellerId === user.id);

  const handleRenew = async (id: string) => {
    await renewListing(id);
    showToast("Skelbimas pratęstas 90 dienų", "success");
  };

  if (!isAuthenticated) {
    return (
      <div className="vauto-dashboard flex min-h-dvh flex-col items-center justify-center px-6 pb-24">
        <div className="vauto-dashboard-card max-w-sm rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--vauto-teal)]/20">
            <LayoutDashboard className="h-8 w-8 text-[var(--vauto-teal)]" />
          </div>
          <h1 className="text-xl font-bold text-white">Valdymo skydelis</h1>
          <p className="mt-2 text-sm text-slate-400">
            Prisijunkite, kad valdytumėte skelbimus, analitiką ir mokamas
            paslaugas.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("/profile")}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--vauto-teal)] py-3.5 text-sm font-semibold text-white"
          >
            <LogIn className="h-4 w-4" />
            Prisijungti / Registruotis
          </button>
          <Link
            href="/install/"
            className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-teal-400"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Įdiegti programėlę
          </Link>
          <div className="mt-6 text-left">
            <ConnectionStatusCard />
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <Suspense
        fallback={
          <div className="vauto-dashboard flex min-h-dvh items-center justify-center text-slate-400">
            Kraunamas administratoriaus kabinetas…
          </div>
        }
      >
        <AdminProfileShell />
      </Suspense>
    );
  }

  return (
    <DashboardShell>
      <Suspense fallback={null}>
        <ProUpgradeNotice />
      </Suspense>
      <DashboardHeader user={user} onLogout={logout} />

      <SellerTrustCard user={user} listings={listings} />

      <SavedListingsSection />

      <WishlistSection />

      {user.role === "pro" ? (
        <ProBusinessDashboard
          user={user}
          listings={myListings}
          allListings={listings}
          onEdit={setEditingListing}
          onDelete={(id) => {
            if (confirm("Ištrinti skelbimą?")) deleteListing(id);
          }}
          onMarkSold={markListingSold}
          onTopUp={topUpWallet}
          onPromote={promoteListing}
          onRenew={handleRenew}
        />
      ) : (
        <PrivateSellerDashboard
          listings={myListings}
          onEdit={setEditingListing}
          onDelete={(id) => {
            if (confirm("Ištrinti skelbimą?")) deleteListing(id);
          }}
          onMarkSold={markListingSold}
          onRenew={handleRenew}
        />
      )}

      <div className="mt-8 space-y-4">
        <Suspense
          fallback={
            <div className="vauto-dashboard-card rounded-2xl p-4 text-xs text-slate-500">
              Kraunami pranešimai…
            </div>
          }
        >
          <UserSupportInbox />
        </Suspense>
        <ConnectionStatusCard />
        <WakeWordSettingsCard />
        <PrivacySettingsCard />
        <SocialSyncSettingsCard />
        <PushAlertsSettingsCard />
      </div>

      <EditListingModal
        listing={editingListing}
        onClose={() => setEditingListing(null)}
        onSave={(id, patch) => updateListing(id, patch)}
      />
    </DashboardShell>
  );
}
