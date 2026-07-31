"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, BarChart3, CreditCard } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PaymentHistorySection } from "@/components/billing/PaymentHistorySection";
import { SavedListingsSection } from "@/components/dashboard/SavedListingsSection";
import { WishlistSection } from "@/components/wishlist/WishlistSection";
import { UserSupportInbox } from "@/components/support/UserSupportInbox";
import { SellerTrustCard } from "@/components/trust/SellerTrustCard";
import { ProfileBusinessPanel } from "@/components/profile/ProfileBusinessPanel";
import {
  PrivacySettingsCard,
  PushAlertsSettingsCard,
} from "@/components/privacy/PrivacySettingsCard";
import { SocialSyncSettingsCard } from "@/components/social/SocialSyncSettingsCard";
import { ThemeSettingsCard } from "@/components/settings/ThemeSettingsCard";
import { AiPersonalizationSurveyCard } from "@/components/profile/AiPersonalizationSurveyCard";
import { AiPreferenceCenter } from "@/components/profile/AiPreferenceCenter";
import { ConnectionStatusCard } from "@/components/status/ConnectionStatusCard";
import { AppVersionStatusCard } from "@/components/version/AppVersionStatusCard";
import { SystemDiagnosticsCard } from "@/components/settings/SystemDiagnosticsCard";
import { Disclosure, PageHeader, Panel } from "@/components/ui/surface";
import { ProfileViewProvider } from "@/lib/profile-view";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";
import { useVauto } from "@/context/VautoContext";

function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="vauto-group-label">{label}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

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
    <Panel
      id={focus === "phone" ? "profile-focus-phone" : "profile-focus-city"}
      tone="accent"
      className="mb-4"
      description={
        focus === "phone"
          ? "Skelbimui reikia telefono iš profilio. Atnaujinkite numerį žemiau ir grįžkite į asistentą."
          : "Skelbimui reikia miesto iš profilio. Atnaujinkite miestą ir grįžkite į asistentą."
      }
    />
  );
}

export default function ProfileSettingsPage() {
  const { isAuthenticated, authHydrated } = useAuth();
  const {
    user,
    listings,
    renewListing,
    paymentHistoryVersion,
    openBillingPortal,
    apiActive,
  } = useVauto();

  const myListings = listings.filter((l) => l.sellerId === user.id);
  const showBusinessBlock = user.role === "pro" || isSuperAdminUser(user);

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
        <PageHeader
          title="Nustatymai"
          subtitle="Išvaizda, AI asistentas, privatumas ir mokėjimai"
          backHref="/profile/"
          backLabel="Profilis"
        />

        <Suspense fallback={null}>
          <ListingContactFocusBanner />
        </Suspense>

        <div className="space-y-6">
          <SettingsSection label="Išvaizda">
            <ThemeSettingsCard />
          </SettingsSection>

          <SettingsSection label="AI asistentas">
            <AiPreferenceCenter embedded />
            <AiPersonalizationSurveyCard embedded />
          </SettingsSection>

          <SettingsSection label="Privatumas ir pranešimai">
            <PrivacySettingsCard />
            <SocialSyncSettingsCard />
            <PushAlertsSettingsCard />
          </SettingsSection>

          <SettingsSection label="Mokėjimai">
            <Panel
              icon={<CreditCard className="h-4 w-4 text-[var(--vauto-primary)]" />}
              title="Prenumerata ir kortelės"
              description="Tvarkykite Stripe prenumeratą, mokėjimo būdus ir sąskaitas neišeidami iš VAUTO."
            >
              <button
                type="button"
                disabled={!apiActive}
                onClick={() => void openBillingPortal()}
                className="rounded-xl bg-[var(--vauto-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--vauto-primary-contrast,#fff)] disabled:opacity-50"
              >
                Tvarkyti prenumeratą
              </button>
            </Panel>
            <PaymentHistorySection user={user} refreshKey={paymentHistoryVersion} />
          </SettingsSection>

          <SettingsSection label="Sistema">
            <Disclosure
              title="Ryšys ir versija"
              subtitle="API būsena, programėlės versija, diagnostika"
              icon={<Activity className="h-4 w-4 text-[var(--vauto-primary)]" />}
            >
              <ConnectionStatusCard />
              <AppVersionStatusCard />
              {showBusinessBlock ? <SystemDiagnosticsCard /> : null}
            </Disclosure>
          </SettingsSection>

          {showBusinessBlock && (
            <SettingsSection label="Verslas">
              <Disclosure
                title="Verslo kabinetas"
                subtitle="Analitika, pasitikėjimas, išsaugoti skelbimai, pranešimai"
                icon={<BarChart3 className="h-4 w-4 text-[var(--vauto-primary)]" />}
              >
                <SellerTrustCard user={user} listings={listings} />
                <ProfileBusinessPanel
                  user={user}
                  listings={myListings}
                  allListings={listings}
                  onRenew={(id) => void renewListing(id)}
                />
                <SavedListingsSection />
                <WishlistSection />
                <Suspense
                  fallback={
                    <p className="vauto-panel vauto-panel--nested p-4 text-xs text-[var(--vauto-text-muted)]">
                      Kraunami pranešimai…
                    </p>
                  }
                >
                  <UserSupportInbox />
                </Suspense>
              </Disclosure>
            </SettingsSection>
          )}
        </div>
      </DashboardShell>
    </ProfileViewProvider>
  );
}
