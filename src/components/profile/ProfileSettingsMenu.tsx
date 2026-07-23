"use client";

import Link from "next/link";
import {
  ChevronRight,
  Gift,
  Settings2,
  Smartphone,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useVauto } from "@/context/VautoContext";
import {
  buildReferralUrl,
  getReferralCredits,
  shareReferralInvite,
} from "@/lib/referral";
import { isNativeApp } from "@/lib/mobile-install";
import type { UserProfile } from "@/lib/types";

interface ProfileSettingsMenuProps {
  user: UserProfile;
}

interface SettingsRowProps {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
  href?: string;
}

function SettingsRow({ icon, label, hint, onClick, href }: SettingsRowProps) {
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--vauto-primary)_8%,transparent)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-medium text-[var(--vauto-text-main)]">
          {label}
        </span>
        {hint ? (
          <span className="block truncate text-xs text-[var(--vauto-text-muted)]">
            {hint}
          </span>
        ) : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--vauto-text-muted)]" />
    </>
  );

  const className =
    "flex w-full items-center gap-3 px-4 py-3 transition hover:bg-[color-mix(in_srgb,var(--vauto-primary)_4%,transparent)]";

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

export function ProfileSettingsMenu({ user }: ProfileSettingsMenuProps) {
  const { showToast } = useVauto();
  const nativeApp = isNativeApp();
  const credits = getReferralCredits(user);
  const referralUrl = useMemo(() => buildReferralUrl(user), [user]);

  const handleReferral = async () => {
    const ok = await shareReferralInvite(user);
    if (!ok) {
      try {
        await navigator.clipboard.writeText(referralUrl);
        showToast("Nuoroda nukopijuota", "success");
      } catch {
        showToast("Nepavyko pasidalinti", "info");
      }
    }
  };

  return (
    <nav
      className="overflow-hidden rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)]"
      aria-label="Profilio nustatymai"
    >
      <SettingsRow
        icon={<Gift className="h-4 w-4 text-[var(--vauto-orange)]" />}
        label="Pakviesk draugą"
        hint={
          credits > 0
            ? `Turite ${credits} apsaugos kreditą · dalintis`
            : "Gauk nemokamą pirkėjo apsaugą"
        }
        onClick={() => void handleReferral()}
      />
      <div className="h-px bg-[var(--vauto-border)]" />
      <SettingsRow
        icon={<Settings2 className="h-4 w-4 text-[var(--vauto-primary)]" />}
        label="Programėlės nustatymai"
        hint="Tema, privatumas, pranešimai"
        href="/profile/settings/"
      />
      {!nativeApp && (
        <>
          <div className="h-px bg-[var(--vauto-border)]" />
          <SettingsRow
            icon={<Smartphone className="h-4 w-4 text-[var(--vauto-primary)]" />}
            label="Atsisiųsti programėlę"
            hint="Android APK · iPhone PWA"
            href="/install/"
          />
        </>
      )}
    </nav>
  );
}
