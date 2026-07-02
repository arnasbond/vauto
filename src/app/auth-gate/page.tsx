"use client";

import Link from "next/link";
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProfileTypePicker } from "@/components/auth/ProfileTypePicker";
import { SmartOnboardingCarousel } from "@/components/auth/SmartOnboardingCarousel";
import { useAuth } from "@/context/AuthContext";
import {
  defaultCabinetPath,
  needsProfileTypeSelection,
  type ProfileType,
} from "@/lib/profile-type";

export default function AuthGatePage() {
  const router = useRouter();
  const { authHydrated, isAuthenticated, user, openAuthModal } = useAuth();

  const redirectForProfile = useCallback(
    (profileType: ProfileType) => {
      router.replace(defaultCabinetPath(profileType));
    },
    [router]
  );

  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return;
    if (needsProfileTypeSelection(user)) return;
    redirectForProfile(user.profileType!);
  }, [authHydrated, isAuthenticated, user, redirectForProfile]);

  if (!authHydrated) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6 text-center text-sm text-[var(--vauto-text-muted)]">
        Kraunama…
      </div>
    );
  }

  if (isAuthenticated && !needsProfileTypeSelection(user)) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6 text-center text-sm text-[var(--vauto-text-muted)]">
        Nukreipiama…
      </div>
    );
  }

  if (isAuthenticated && needsProfileTypeSelection(user)) {
    return (
      <AppShell variant="plain">
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-8">
          <ProfileTypePicker onComplete={redirectForProfile} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell variant="plain">
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-8">
        <p className="mb-5 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--vauto-teal)]">
          Trumpa pažintis
        </p>

        <SmartOnboardingCarousel />

        <button
          type="button"
          onClick={() => openAuthModal("/auth-gate/")}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--vauto-teal)] py-3.5 text-sm font-semibold text-white shadow-md hover:opacity-90"
        >
          <LogIn className="h-4 w-4" />
          Registruotis / Prisijungti
        </button>

        <p className="mt-4 text-center text-xs leading-relaxed text-[var(--vauto-text-muted)]">
          Automobilių, nekilnojamojo turto, paslaugų, mados ir įvairūs skelbimai — viena
          paskyra viskam. Prisijunk ir leisk AI padaryti sunkų darbą už tave.
        </p>

        <Link
          href="/fashion/"
          className="mt-4 inline-flex items-center justify-center gap-1.5 text-sm text-[var(--vauto-teal)] hover:opacity-80"
        >
          <Sparkles className="h-4 w-4" />
          Tęsti kaip svečias (demo)
        </Link>
      </div>
    </AppShell>
  );
}
