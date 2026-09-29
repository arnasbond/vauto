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
import { NegotiationSandboxTrigger } from "@/components/clothing/NegotiationSandboxTrigger";
import { ProfileSettingsMenu } from "@/components/profile/ProfileSettingsMenu";
import { AiPersonalizationSurveyCard } from "@/components/profile/AiPersonalizationSurveyCard";
import { AiPreferenceCenter } from "@/components/profile/AiPreferenceCenter";
import { SegmentedTabs, type SegmentedTabItem } from "@/components/ui/surface";
import { ProfileViewProvider } from "@/lib/profile-view";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";
import { isBusinessProfile, isPrivateProfile } from "@/lib/profile-type";
import { isNativeApp } from "@/lib/mobile-install";
import { useVauto } from "@/context/VautoContext";

type ProfileTab = "cabinet" | "ai";

const PROFILE_TABS: readonly SegmentedTabItem<ProfileTab>[] = [
  { id: "cabinet", label: "Kabinetas" },
  {
    id: "ai",
    label: "AI asistentas",
    shortLabel: "AI",
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
];

function parseProfileTab(raw: string | null): ProfileTab {
  return raw === "ai" ? "ai" : "cabinet";
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
        <div className="vauto-panel max-w-sm p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--vauto-primary)_12%,transparent)]">
            <LayoutDashboard className="h-7 w-7 text-[var(--vauto-primary)]" />
          </div>
          <h1 className="vauto-page-title">Profilis</h1>
          <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
            Prisijunkite, kad valdytumėte skelbimus ir nustatymus.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("/profile")}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] py-3 text-sm font-semibold text-[var(--vauto-primary-contrast,#fff)]"
          >
            <LogIn className="h-4 w-4" />
            Prisijungti / Registruotis
          </button>
          <Link
            href="/mano-skelbimai/"
            className="vauto-btn-quiet mt-2 flex w-full items-center justify-center gap-2 py-3 text-sm"
          >
            Atidaryti Mano skelbimus
          </Link>
          {!nativeApp && (
            <Link
              href="/install/"
              className="mt-3 inline-flex items-center justify-center gap-2 text-xs text-[var(--vauto-text-muted)] hover:text-[var(--vauto-primary)]"
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

        {/* First Viewport — Returning user activity + VAUTO interaction prompt */}
        <div className="mb-4 rounded-2xl border border-[var(--ds-brand)]/25 bg-[var(--ds-brand-soft)]/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ds-brand)]">
              <Sparkles className="h-4 w-4" />
              Paklausk VAUTO apie savo paskyrą ar skelbimus…
            </div>
            <span className="text-xs font-medium text-[var(--ds-text-muted)]">
              Mano skelbimai: {myListings.length}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => showToast("Aktyvūs skelbimai atnaujinti", "info")}
              className="rounded-full border border-[var(--ds-brand)]/30 bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--ds-brand)] transition hover:bg-[var(--ds-brand)] hover:text-white dark:bg-black/30"
            >
              ✨ Kas pasikeitė skelbimuose?
            </button>
            <Link
              href="/mano-skelbimai/"
              className="rounded-full border border-[var(--ds-brand)]/30 bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--ds-brand)] transition hover:bg-[var(--ds-brand)] hover:text-white dark:bg-black/30"
            >
              📦 Mano skelbimai ({myListings.length})
            </Link>
            <Link
              href="/messages/"
              className="rounded-full border border-[var(--ds-brand)]/30 bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--ds-brand)] transition hover:bg-[var(--ds-brand)] hover:text-white dark:bg-black/30"
            >
              💬 Pokalbiai ir sandoriai
            </Link>
          </div>
        </div>

        <SegmentedTabs
          items={PROFILE_TABS}
          value={tab}
          onChange={handleTabChange}
          ariaLabel="Profilio skirtukai"
          className="mb-4"
        />

        {tab === "ai" ? (
          <div className="space-y-3">
            <AiPreferenceCenter />
            <AiPersonalizationSurveyCard embedded />
          </div>
        ) : (
          <div className="space-y-4">
            <DashboardPage
              user={user}
              listings={myListings}
              allListings={listings}
              onRenew={handleRenew}
              listingsOnly={isPrivateCabinet}
              disableWardrobeMode
            />

            {isBusinessCabinet && (
              <NegotiationSandboxTrigger
                listings={myListings}
                sellerName={user.nickname?.trim() || user.name || "Pardavėja"}
                sellerUserId={user.id}
                profileType={user.profileType}
                className="vauto-btn-quiet flex w-full items-center justify-center gap-2 py-3 text-sm"
              />
            )}

            <details className="rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-4">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--ds-text-secondary)] hover:text-[var(--ds-brand)]">
                AI personalizacija ir paskyros nustatymai ▾
              </summary>
              <div className="mt-4 space-y-4">
                <AiPersonalizationSurveyCard />
                <ProfileSettingsMenu user={user} showBusinessEntry={!isPro} />
              </div>
            </details>
          </div>
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
