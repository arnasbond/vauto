"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutDashboard, LogIn, Smartphone } from "lucide-react";
import { AdminControlCenter } from "@/components/admin/AdminControlCenter";
import { AuthModal } from "@/components/auth/AuthModal";
import { PrivacySettingsCard } from "@/components/privacy/PrivacySettingsCard";
import { SellerTrustCard } from "@/components/trust/SellerTrustCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { EditListingModal } from "@/components/dashboard/EditListingModal";
import { PrivateSellerDashboard } from "@/components/dashboard/PrivateSellerDashboard";
import { ProBusinessDashboard } from "@/components/dashboard/ProBusinessDashboard";
import { SavedListingsSection } from "@/components/dashboard/SavedListingsSection";
import { useVauto } from "@/context/VautoContext";
import type { Listing } from "@/lib/types";

export default function ProfilePage() {
  const {
    user,
    listings,
    isAuthenticated,
    login,
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

  const [authOpen, setAuthOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);

  const myListings = listings.filter((l) => l.sellerId === user.id);

  const handleRenew = async (id: string) => {
    await renewListing(id);
    showToast("Skelbimas pratęstas 90 dienų", "success");
  };

  if (!isAuthenticated) {
    return (
      <>
        <div className="vauto-dashboard flex min-h-dvh flex-col items-center justify-center px-6 pb-24">
          <div className="vauto-dashboard-card max-w-sm rounded-3xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--vauto-teal)]/20">
              <LayoutDashboard className="h-8 w-8 text-[var(--vauto-teal)]" />
            </div>
            <h1 className="text-xl font-bold text-white">Vauto Dashboard</h1>
            <p className="mt-2 text-sm text-slate-400">
              Prisijunkite, kad valdytumėte skelbimus, analitiką ir mokamas
              paslaugas.
            </p>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
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
          </div>
        </div>
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onComplete={(data) => {
            login(data);
            setAuthOpen(false);
          }}
        />
      </>
    );
  }

  if (isAdmin) {
    return <AdminControlCenter />;
  }

  return (
    <DashboardShell>
      <DashboardHeader user={user} onLogout={logout} />

      <SellerTrustCard user={user} listings={listings} />

      <SavedListingsSection />

      {user.role === "pro" ? (
        <ProBusinessDashboard
          user={user}
          listings={myListings}
          onEdit={setEditingListing}
          onDelete={(id) => {
            if (confirm("Ištrinti skelbimą?")) deleteListing(id);
          }}
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
        <PrivacySettingsCard />
      </div>

      <EditListingModal
        listing={editingListing}
        onClose={() => setEditingListing(null)}
        onSave={(id, patch) => updateListing(id, patch)}
      />
    </DashboardShell>
  );
}
