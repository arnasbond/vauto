"use client";

import Link from "next/link";
import { Suspense } from "react";
import { LayoutDashboard, LogIn, Smartphone } from "lucide-react";
import { AdminProfileShell } from "@/components/admin/AdminProfileShell";
import { ProUpgradeNotice } from "@/components/dashboard/ProUpgradeNotice";
import { PrivacySettingsCard, PushAlertsSettingsCard } from "@/components/privacy/PrivacySettingsCard";
import { SocialSyncSettingsCard } from "@/components/social/SocialSyncSettingsCard";
import { ThemeSettingsCard } from "@/components/settings/ThemeSettingsCard";
import { ConnectionStatusCard } from "@/components/status/ConnectionStatusCard";
import { WakeWordSettingsCard } from "@/components/voice/WakeWordSettingsCard";
import { SellerTrustCard } from "@/components/trust/SellerTrustCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { BillingReturnToast } from "@/components/dashboard/BillingReturnToast";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { PaymentHistorySection } from "@/components/billing/PaymentHistorySection";
import { InvestorDemoCard } from "@/components/settings/InvestorDemoCard";
import { ReferralInviteCard } from "@/components/dashboard/ReferralInviteCard";
import { SystemDiagnosticsCard } from "@/components/settings/SystemDiagnosticsCard";
import { SavedListingsSection } from "@/components/dashboard/SavedListingsSection";
import { WishlistSection } from "@/components/wishlist/WishlistSection";
import { UserSupportInbox } from "@/components/support/UserSupportInbox";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";
import { useVauto } from "@/context/VautoContext";

export default function ProfilePage() {
  const { openAuthModal } = useAuth();
  const {
    user,
    listings,
    isAuthenticated,
    authHydrated,
    logout,
    renewListing,
    showToast,
    paymentHistoryVersion,
  } = useVauto();

  const myListings = listings.filter((l) => l.sellerId === user.id);

  const handleRenew = async (id: string) => {
    await renewListing(id);
    showToast("Skelbimas pratęstas 90 dienų", "success");
  };

  if (!authHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--portal-bg,#f3f5f8)] px-6 pb-24 text-sm text-slate-500">
        Kraunama…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--portal-bg,#f3f5f8)] px-6 pb-24">
        <div className="vauto-dashboard-card max-w-sm rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--vauto-teal)]/15">
            <LayoutDashboard className="h-8 w-8 text-[var(--vauto-teal)]" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Valdymo skydelis</h1>
          <p className="mt-2 text-sm text-slate-600">
            Prisijunkite, kad valdytumėte skelbimus, analitiką ir mokamas paslaugas.
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
            className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-[var(--vauto-teal)]"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Įdiegti programėlę
          </Link>
          <div className="mt-6 text-left space-y-4">
            <ConnectionStatusCard />
            <InvestorDemoCard />
          </div>
        </div>
      </div>
    );
  }

  if (isSuperAdminUser(user)) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-dvh items-center justify-center bg-[var(--portal-bg,#f3f5f8)] text-slate-500">
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
        <BillingReturnToast />
      </Suspense>
      <Suspense fallback={null}>
        <ProUpgradeNotice />
      </Suspense>
      <DashboardHeader user={user} onLogout={logout} />

      <SellerTrustCard user={user} listings={listings} />

      <ReferralInviteCard />

      {(user.role === "pro" || isSuperAdminUser(user)) && (
        <div className="mt-6">
          <SystemDiagnosticsCard />
        </div>
      )}

      <SavedListingsSection />

      <WishlistSection />

      <DashboardPage
        user={user}
        listings={myListings}
        allListings={listings}
        onRenew={handleRenew}
      />

      <div className="mt-6">
        <PaymentHistorySection user={user} refreshKey={paymentHistoryVersion} />
      </div>

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
        <InvestorDemoCard />
        <ThemeSettingsCard />
        <WakeWordSettingsCard />
        <PrivacySettingsCard />
        <SocialSyncSettingsCard />
        <PushAlertsSettingsCard />
      </div>
    </DashboardShell>
  );
}
