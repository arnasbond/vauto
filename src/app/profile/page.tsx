"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { LayoutDashboard, LogIn, Smartphone, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminProfileShell } from "@/components/admin/AdminProfileShell";
import { BillingReturnToast } from "@/components/dashboard/BillingReturnToast";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ProUpgradeNotice } from "@/components/dashboard/ProUpgradeNotice";
import { ProfileProCTA } from "@/components/profile/ProfileProCTA";
import { ProfileProViewToggle } from "@/components/profile/ProfileProViewToggle";
import { NegotiationSandboxTrigger } from "@/components/clothing/NegotiationSandboxTrigger";
import { ProfileSettingsMenu } from "@/components/profile/ProfileSettingsMenu";
import { AiPersonalizationSurveyCard } from "@/components/profile/AiPersonalizationSurveyCard";
import { AiPreferenceCenter } from "@/components/profile/AiPreferenceCenter";
import { ThemeSettingsCard } from "@/components/settings/ThemeSettingsCard";
import { ProfileViewProvider } from "@/lib/profile-view";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";
import { isBusinessProfile, isPrivateProfile } from "@/lib/profile-type";
import { isNativeApp } from "@/lib/mobile-install";
import { useVauto } from "@/context/VautoContext";
import { cn } from "@/lib/cn";

type ProfileTab = "cabinet" | "ai";

function parseProfileTab(raw: string | null): ProfileTab {
  return raw === "ai" ? "ai" : "cabinet";
}

function ProfileTabs({
  tab,
  onChange,
}: {
  tab: ProfileTab;
  onChange: (next: ProfileTab) => void;
}) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto px-1">
      <button
        type="button"
        onClick={() => onChange("cabinet")}
        className={cn(
          "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition",
          tab === "cabinet"
            ? "bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast,#fff)]"
            : "bg-[var(--vauto-surface-page,#f8fafc)] text-[var(--vauto-muted)] hover:text-[var(--vauto-ink)]"
        )}
      >
        Kabinetas
      </button>
      <button
        type="button"
        onClick={() => onChange("ai")}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition",
          tab === "ai"
            ? "bg-[var(--vauto-teal)] text-white"
            : "bg-[var(--vauto-surface-page,#f8fafc)] text-[var(--vauto-muted)] hover:text-[var(--vauto-ink)]"
        )}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        AI Asistento nustatymai
      </button>
    </div>
  );
}

function ProfilePageContent() {
  const { openAuthModal } = useAuth();
  const nativeApp = isNativeApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    user,
    listings,
    isAuthenticated,
    authHydrated,
    logout,
    renewListing,
    showToast,
  } = useVauto();

  const [tab, setTab] = useState<ProfileTab>(() =>
    parseProfileTab(searchParams.get("tab"))
  );

  useEffect(() => {
    setTab(parseProfileTab(searchParams.get("tab")));
  }, [searchParams]);

  const handleTabChange = useCallback(
    (next: ProfileTab) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "ai") params.set("tab", "ai");
      else params.delete("tab");
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname || "/profile/");
    },
    [pathname, router, searchParams]
  );

  const myListings = listings.filter((l) => l.sellerId === user.id);
  const isPro = user.role === "pro";
  const isBusinessCabinet = isBusinessProfile(user);
  const isPrivateCabinet = isPrivateProfile(user);

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
          <h1 className="text-xl font-bold text-[var(--vauto-text-main)]">Profilis</h1>
          <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
            Prisijunkite, kad valdytumėte skelbimus ir nustatymus.
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
            href="/mano-skelbimai/"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--vauto-border)] bg-[color-mix(in_srgb,var(--vauto-primary)_10%,transparent)] py-3 text-sm font-semibold text-[var(--vauto-primary)]"
          >
            Atidaryti Mano skelbimus
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

        <ProfileTabs tab={tab} onChange={handleTabChange} />

        {tab === "ai" ? (
          <div className="space-y-4">
            <AiPreferenceCenter />
            <AiPersonalizationSurveyCard embedded />
          </div>
        ) : (
          <>
            <AiPersonalizationSurveyCard />

            {isPro ? <ProfileProViewToggle /> : <ProfileProCTA />}

            <DashboardPage
              user={user}
              listings={myListings}
              allListings={listings}
              onRenew={handleRenew}
              listingsOnly={isPrivateCabinet}
              disableWardrobeMode
            />

            {isBusinessCabinet && (
              <div className="mt-4 px-1">
                <NegotiationSandboxTrigger
                  listings={myListings}
                  sellerName={user.nickname?.trim() || user.name || "Pardavėja"}
                  sellerUserId={user.id}
                  profileType={user.profileType}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--vauto-primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--vauto-primary)_8%,transparent)] py-3.5 text-sm font-semibold text-[var(--vauto-primary)] transition hover:brightness-110"
                />
              </div>
            )}

            <div className="mt-4 space-y-4">
              <ThemeSettingsCard />
              <ProfileSettingsMenu user={user} />
            </div>
          </>
        )}
      </DashboardShell>
    </ProfileViewProvider>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[var(--vauto-bg)] text-sm text-[var(--vauto-text-muted)]">
          Kraunama…
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}
