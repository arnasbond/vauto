"use client";

import { Suspense } from "react";
import {
  BarChart3,
  LayoutDashboard,
  LogIn,
  Settings2,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { AdminProfileShell } from "@/components/admin/AdminProfileShell";
import { ProUpgradeNotice } from "@/components/dashboard/ProUpgradeNotice";
import { PrivacySettingsCard, PushAlertsSettingsCard } from "@/components/privacy/PrivacySettingsCard";
import { SocialSyncSettingsCard } from "@/components/social/SocialSyncSettingsCard";
import { ThemeSettingsCard } from "@/components/settings/ThemeSettingsCard";
import { WakeWordSettingsCard } from "@/components/voice/WakeWordSettingsCard";
import { SellerTrustCard } from "@/components/trust/SellerTrustCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { InstallDownloadButtons } from "@/components/InstallDownloadButtons";
import { BillingReturnToast } from "@/components/dashboard/BillingReturnToast";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { PaymentHistorySection } from "@/components/billing/PaymentHistorySection";
import { ReferralInviteCard } from "@/components/dashboard/ReferralInviteCard";
import { SystemDiagnosticsCard } from "@/components/settings/SystemDiagnosticsCard";
import { SavedListingsSection } from "@/components/dashboard/SavedListingsSection";
import { WishlistSection } from "@/components/wishlist/WishlistSection";
import { UserSupportInbox } from "@/components/support/UserSupportInbox";
import { ProfileAccordion } from "@/components/profile/ProfileAccordion";
import { ProfileBusinessPanel } from "@/components/profile/ProfileBusinessPanel";
import { ProfileAccountTypePanel } from "@/components/profile/ProfileAccountTypePanel";
import { ProfileSpintaSwitch } from "@/components/profile/ProfileSpintaSwitch";
import { ProfileViewProvider } from "@/lib/profile-view";
import { ConnectionStatusCard } from "@/components/status/ConnectionStatusCard";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";
import { isNativeApp } from "@/lib/mobile-install";
import { useVauto } from "@/context/VautoContext";

export default function ProfilePage() {
  const { openAuthModal } = useAuth();
  const nativeApp = isNativeApp();
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
      <div className="flex min-h-dvh items-center justify-center bg-[var(--vauto-bg)] px-6 pb-24 text-sm text-[var(--vauto-text-muted)]">
        Kraunama…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--vauto-bg)] px-6 pb-24">
        <div className="vauto-dashboard-card max-w-sm rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--vauto-primary)_15%,transparent)]">
            <LayoutDashboard className="h-8 w-8 text-[var(--vauto-primary)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--vauto-text-main)]">Valdymo skydelis</h1>
          <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
            Prisijunkite, kad valdytumėte skelbimus, analitiką ir mokamas paslaugas.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("/profile")}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--vauto-primary)] py-3.5 text-sm font-semibold text-[var(--vauto-primary-contrast,#fff)]"
          >
            <LogIn className="h-4 w-4" />
            Prisijungti / Registruotis
          </button>
          <Link
            href="/fashion/"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 py-3 text-sm font-semibold text-fuchsia-700"
          >
            Išbandyti VAUTO Spintą be prisijungimo
          </Link>
          {!nativeApp && (
            <Link
              href="/install/"
              className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--vauto-text-muted)] hover:text-[var(--vauto-primary)]"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Įdiegti programėlę
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (isSuperAdminUser(user)) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-dvh items-center justify-center bg-[var(--vauto-bg)] text-[var(--vauto-text-muted)]">
            Kraunamas administratoriaus kabinetas…
          </div>
        }
      >
        <AdminProfileShell />
      </Suspense>
    );
  }

  return (
    <ProfileViewProvider>
    <DashboardShell>
      <Suspense fallback={null}>
        <BillingReturnToast />
      </Suspense>
      <Suspense fallback={null}>
        <ProUpgradeNotice />
      </Suspense>

      <DashboardHeader user={user} onLogout={logout} />
      <ReferralInviteCard />
      <ProfileSpintaSwitch />
      <ProfileAccountTypePanel />

      <DashboardPage
        user={user}
        listings={myListings}
        allListings={listings}
        onRenew={handleRenew}
        listingsOnly
      />

      <ProfileAccordion
        title="Programėlės nustatymai"
        subtitle="Tema, balsinis asistentas, privatumas"
        icon={<Settings2 className="h-5 w-5 text-[var(--vauto-primary)]" />}
      >
        <ThemeSettingsCard embedded />
        <WakeWordSettingsCard />
        <PrivacySettingsCard />
        <SocialSyncSettingsCard />
        <PushAlertsSettingsCard />
        <ConnectionStatusCard />
      </ProfileAccordion>

      <ProfileAccordion
        title="Verslo paskyra & Analitika"
        subtitle="Pro planai, statistika, išsaugoti skelbimai"
        icon={<BarChart3 className="h-5 w-5 text-[var(--vauto-primary)]" />}
      >
        <SellerTrustCard user={user} listings={listings} />
        <ProfileBusinessPanel
          user={user}
          listings={myListings}
          allListings={listings}
          onRenew={handleRenew}
        />
        <PaymentHistorySection user={user} refreshKey={paymentHistoryVersion} />
        <SavedListingsSection />
        <WishlistSection />
        <Suspense
          fallback={
            <div className="vauto-dashboard-card rounded-2xl p-4 text-xs text-[var(--vauto-text-muted)]">
              Kraunami pranešimai…
            </div>
          }
        >
          <UserSupportInbox />
        </Suspense>
        {(user.role === "pro" || isSuperAdminUser(user)) && <SystemDiagnosticsCard />}
      </ProfileAccordion>

      {!nativeApp && (
        <ProfileAccordion
          title="Atsisiųsti programėlę"
          subtitle="Android APK · iPhone per Safari (PWA)"
          icon={<Smartphone className="h-5 w-5 text-[var(--vauto-primary)]" />}
        >
          <InstallDownloadButtons showShare />
        </ProfileAccordion>
      )}
    </DashboardShell>
    </ProfileViewProvider>
  );
}
