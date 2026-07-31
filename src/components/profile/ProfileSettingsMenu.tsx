"use client";

import {
  Building2,
  Gift,
  Palette,
  Settings2,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useMemo } from "react";
import { useVauto } from "@/context/VautoContext";
import {
  buildReferralUrl,
  getReferralCredits,
  shareReferralInvite,
} from "@/lib/referral";
import { isNativeApp } from "@/lib/mobile-install";
import { ThemeSwatchStrip } from "@/components/settings/ThemeSettingsCard";
import {
  SettingsControlRow,
  SettingsGroup,
  SettingsRow,
} from "@/components/ui/surface";
import type { UserProfile } from "@/lib/types";

interface ProfileSettingsMenuProps {
  user: UserProfile;
  /** Non-Pro users get a single quiet business entry instead of a rival CTA card. */
  showBusinessEntry?: boolean;
}

export function ProfileSettingsMenu({
  user,
  showBusinessEntry = false,
}: ProfileSettingsMenuProps) {
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
    <div className="space-y-4">
      <SettingsGroup label="Nustatymai" ariaLabel="Profilio nustatymai">
        <SettingsControlRow
          icon={<Palette className="h-4 w-4 text-[var(--vauto-primary)]" />}
          label="Tema"
          hint="Originali · Tamsi · Minimali"
        >
          <ThemeSwatchStrip />
        </SettingsControlRow>
        <SettingsRow
          icon={<Sparkles className="h-4 w-4 text-[var(--vauto-primary)]" />}
          label="AI asistentas"
          hint="Dydžiai, automobilis, pomėgiai"
          href="/profile/?tab=ai"
        />
        <SettingsRow
          icon={<Settings2 className="h-4 w-4 text-[var(--vauto-primary)]" />}
          label="Paskyra ir privatumas"
          hint="Privatumas, pranešimai, mokėjimai"
          href="/profile/settings/"
        />
      </SettingsGroup>

      <SettingsGroup label="Daugiau" ariaLabel="Papildomos nuorodos">
        <SettingsRow
          icon={<Gift className="h-4 w-4 text-[var(--vauto-orange)]" />}
          label="Pakviesk draugą"
          hint={
            credits > 0
              ? `Turite ${credits} apsaugos kreditą`
              : "Gauk nemokamą pirkėjo apsaugą"
          }
          onClick={() => void handleReferral()}
        />
        {showBusinessEntry ? (
          <SettingsRow
            icon={<Building2 className="h-4 w-4 text-[var(--vauto-primary)]" />}
            label="VAUTO Verslui"
            hint="Analitika, Social Engine, bulk įkėlimas"
            href="/verslui/"
          />
        ) : null}
        {!nativeApp ? (
          <SettingsRow
            icon={<Smartphone className="h-4 w-4 text-[var(--vauto-primary)]" />}
            label="Atsisiųsti programėlę"
            hint="Android APK · iPhone PWA"
            href="/install/"
          />
        ) : null}
      </SettingsGroup>
    </div>
  );
}
