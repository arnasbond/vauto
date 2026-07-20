"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PaymentHistorySection } from "@/components/billing/PaymentHistorySection";
import { SavedListingsSection } from "@/components/dashboard/SavedListingsSection";
import { WishlistSection } from "@/components/wishlist/WishlistSection";
import { UserSupportInbox } from "@/components/support/UserSupportInbox";
import { SellerTrustCard } from "@/components/trust/SellerTrustCard";
import { ProfileBusinessPanel } from "@/components/profile/ProfileBusinessPanel";
import { ProfileAccordion } from "@/components/profile/ProfileAccordion";
import {
  PrivacySettingsCard,
  PushAlertsSettingsCard,
} from "@/components/privacy/PrivacySettingsCard";
import { SocialSyncSettingsCard } from "@/components/social/SocialSyncSettingsCard";
import { ThemeSettingsCard } from "@/components/settings/ThemeSettingsCard";
import { AiPersonalizationSurveyCard } from "@/components/profile/AiPersonalizationSurveyCard";
import { ConnectionStatusCard } from "@/components/status/ConnectionStatusCard";
import { AppVersionStatusCard } from "@/components/version/AppVersionStatusCard";
import { SystemDiagnosticsCard } from "@/components/settings/SystemDiagnosticsCard";
import { ProfileViewProvider } from "@/lib/profile-view";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";
import { useVauto } from "@/context/VautoContext";

function ListingContactFocusBanner() {
  const searchParams = useSearchParams();
  const { showToast, user } = useVauto();
  const focus = searchParams.get("focus");

  useEffect(() => {
    if (focus === "phone") {
      showToast(
        user.phone?.trim()
          ? "Patikrinkite telefono numerį — jis naudojamas skelbimuose."
          : "Įrašykite telefono numerį — be jo skelbimo publikuoti negalima.",
        "info"
      );
    } else if (focus === "city") {
      showToast(
        user.city?.trim()
          ? "Patikrinkite miestą — jis naudojamas skelbimuose."
          : "Įrašykite miestą — be jo skelbimo publikuoti negalima.",
        "info"
      );
    }
  }, [focus, showToast, user.city, user.phone]);

  if (focus !== "phone" && focus !== "city") return null;

  return (
    <div
      id={focus === "phone" ? "profile-focus-phone" : "profile-focus-city"}
      className="mb-4 rounded-2xl border border-[var(--vauto-primary)]/30 bg-[color-mix(in_srgb,var(--vauto-primary)_10%,transparent)] px-4 py-3 text-sm text-[var(--vauto-text-main)]"
    >
      {focus === "phone"
        ? "Skelbimui reikia telefono iš profilio. Atnaujinkite numerį žemiau (privatumo / paskyros nustatymuose) ir grįžkite į asistentą."
        : "Skelbimui reikia miesto iš profilio. Atnaujinkite miestą ir grįžkite į asistentą."}
    </div>
  );
}

export default function ProfileSettingsPage() {
  const { isAuthenticated, authHydrated } = useAuth();
  const {
    user,
    listings,
    renewListing,
    paymentHistoryVersion,
  } = useVauto();

  const myListings = listings.filter((l) => l.sellerId === user.id);

  if (!authHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--vauto-text-muted)]">
        Kraunama…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <DashboardShell>
        <p className="py-12 text-center text-sm text-[var(--vauto-text-muted)]">
          Prisijunkite, kad matytumėte nustatymus.
        </p>
      </DashboardShell>
    );
  }

  return (
    <ProfileViewProvider>
      <DashboardShell>
        <Link
          href="/profile/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--vauto-text-muted)] hover:text-[var(--vauto-text-main)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Profilis
        </Link>

        <h1 className="mb-4 text-lg font-bold text-[var(--vauto-text-main)]">
          Nustatymai
        </h1>

        <Suspense fallback={null}>
          <ListingContactFocusBanner />
        </Suspense>

        <div className="space-y-3">
          <AiPersonalizationSurveyCard embedded />
          <ThemeSettingsCard embedded />
          <PrivacySettingsCard />
          <SocialSyncSettingsCard />
          <PushAlertsSettingsCard />
          <ConnectionStatusCard />
          <AppVersionStatusCard />
        </div>

        {(user.role === "pro" || isSuperAdminUser(user)) && (
          <ProfileAccordion
            title="Verslo kabinetas"
            subtitle="Analitika, mokėjimai, palaikymas"
            icon={<BarChart3 className="h-5 w-5 text-[var(--vauto-primary)]" />}
            defaultOpen={false}
          >
            <SellerTrustCard user={user} listings={listings} />
            <ProfileBusinessPanel
              user={user}
              listings={myListings}
              allListings={listings}
              onRenew={(id) => void renewListing(id)}
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
            <SystemDiagnosticsCard />
          </ProfileAccordion>
        )}
      </DashboardShell>
    </ProfileViewProvider>
  );
}
