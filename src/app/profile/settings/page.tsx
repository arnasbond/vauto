"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, BarChart3, Bell, CreditCard, Heart } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PaymentHistorySection } from "@/components/billing/PaymentHistorySection";
import { PaymentMethodsCard } from "@/components/billing/PaymentMethodsCard";
import { SavedListingsSection } from "@/components/dashboard/SavedListingsSection";
import { WishlistSection } from "@/components/wishlist/WishlistSection";
import { UserSupportInbox } from "@/components/support/UserSupportInbox";
import { SellerTrustCard } from "@/components/trust/SellerTrustCard";
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
import { BUSINESS_PORTAL_PATH } from "@/lib/business-portal-access";
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
    } else if (focus === "payments") {
      const timer = window.setTimeout(() => {
        document
          .getElementById("payment-methods")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 400);
      return () => window.clearTimeout(timer);
    }
  }, [focus, showToast, user.city, user.phone]);

  if (focus !== "phone" && focus !== "city" && focus !== "payments") return null;

  const description =
    focus === "phone"
      ? "Skelbimui reikia telefono iš profilio. Atnaujinkite numerį žemiau ir grįžkite į asistentą."
      : focus === "city"
        ? "Skelbimui reikia miesto iš profilio. Atnaujinkite miestą ir grįžkite į asistentą."
        : "Reikia mokėjimo duomenų. Pridėkite juos skiltyje „Mokėjimai“ ir grįžkite prie veiksmo.";

  return (
    <Panel
      id={`profile-focus-${focus}`}
      tone="accent"
      className="mb-4"
      description={description}
    />
  );
}

export default function ProfileSettingsPage() {
  const { isAuthenticated, authHydrated } = useAuth();
  const {
    user,
    listings,
    paymentHistoryVersion,
    openBillingPortal,
    apiActive,
  } = useVauto();

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
            <Suspense
              fallback={
                <Panel description="Kraunami mokėjimo metodai…" />
              }
            >
              <PaymentMethodsCard />
            </Suspense>
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

          <SettingsSection label="Paieška ir išsaugoti">
            <Disclosure
              title="Asmeniniai alertai"
              subtitle="Išsaugoti skelbimai ir paieškos raktiniai žodžiai"
              icon={<Heart className="h-4 w-4 text-[var(--vauto-primary)]" />}
            >
              <SavedListingsSection />
              <WishlistSection />
            </Disclosure>
            <Disclosure
              title="Pagalba"
              subtitle="Jūsų pranešimai palaikymo komandai"
              icon={<Bell className="h-4 w-4 text-[var(--vauto-primary)]" />}
            >
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
              <Panel
                icon={<BarChart3 className="h-4 w-4 text-[var(--vauto-primary)]" />}
                title="Verslo portalas"
                description="Analitika, masinis CSV/XML įkėlimas, skelbimų valdymas ir atsiskaitymai — atskirame verslo kabinete."
              >
                <Link
                  href={BUSINESS_PORTAL_PATH}
                  className="inline-flex rounded-xl bg-[var(--vauto-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--vauto-primary-contrast,#fff)] transition hover:brightness-110"
                >
                  Atidaryti verslo portalą
                </Link>
              </Panel>
              <SellerTrustCard user={user} listings={listings} />
            </SettingsSection>
          )}
        </div>
      </DashboardShell>
    </ProfileViewProvider>
  );
}
