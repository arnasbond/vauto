"use client";

import dynamic from "next/dynamic";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SellerTrustCard } from "@/components/trust/SellerTrustCard";
import { SavedListingsSection } from "@/components/dashboard/SavedListingsSection";
import { WishlistSection } from "@/components/wishlist/WishlistSection";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";

const PrivateSellerDashboard = dynamic(
  () =>
    import("@/components/dashboard/PrivateSellerDashboard").then(
      (m) => m.PrivateSellerDashboard
    ),
  { loading: () => <DashboardLoading label="Kraunamas valdymo skydelis…" /> }
);

const ProBusinessDashboard = dynamic(
  () =>
    import("@/components/dashboard/ProBusinessDashboard").then(
      (m) => m.ProBusinessDashboard
    ),
  { loading: () => <DashboardLoading label="Kraunamas verslo skydelis…" /> }
);

function DashboardLoading({ label }: { label: string }) {
  return (
    <div className="vauto-dashboard-card rounded-2xl py-10 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

interface AdminAccountPanelProps {
  onLogout?: () => void;
}

export function AdminAccountPanel({ onLogout }: AdminAccountPanelProps = {}) {
  const { logout: authLogout } = useAuth();
  const logout = onLogout ?? authLogout;
  const {
    user,
    listings,
    deleteListing,
    markListingSold,
    topUpWallet,
    renewListing,
    showToast,
  } = useVauto();

  const myListings = listings.filter((l) => l.sellerId === user.id);

  const handleRenew = async (id: string) => {
    await renewListing(id);
    showToast("Skelbimas pratęstas 90 dienų", "success");
  };

  return (
    <DashboardShell>
      <DashboardHeader user={user} onLogout={logout} />
      <SellerTrustCard user={user} listings={listings} />
      <SavedListingsSection />
      <WishlistSection />
      {user.role === "pro" ? (
        <ProBusinessDashboard
          user={user}
          listings={myListings}
          allListings={listings}
          onEdit={() => {}}
          onDelete={(id) => {
            if (confirm("Ištrinti skelbimą?")) deleteListing(id);
          }}
          onMarkSold={markListingSold}
          onTopUp={topUpWallet}
          onRenew={handleRenew}
        />
      ) : (
        <PrivateSellerDashboard
          listings={myListings}
          onEdit={() => {}}
          onDelete={(id) => {
            if (confirm("Ištrinti skelbimą?")) deleteListing(id);
          }}
          onMarkSold={markListingSold}
          onRenew={handleRenew}
        />
      )}
    </DashboardShell>
  );
}
