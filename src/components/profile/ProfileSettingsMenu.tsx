"use client";

import {
  Building2,
  CreditCard,
  Gift,
  Lock,
  Palette,
  Settings2,
  Smartphone,
  Sparkles,
  Bell,
  UserRound,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
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
  SettingsRow,
} from "@/components/ui/surface";
import { Badge, Card } from "@/design-system";
import type { UserProfile } from "@/lib/types";

interface ProfileSettingsMenuProps {
  user: UserProfile;
  /** Non-Pro users get a single quiet business entry instead of a rival CTA card. */
  showBusinessEntry?: boolean;
}

function SettingsCardSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card variant="default" className="space-y-1 p-0 overflow-hidden">
      <div className="border-b border-[var(--ds-border-subtle)] px-4 py-3">
        <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-[var(--ds-text-primary)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      <div className="px-1 py-1">{children}</div>
    </Card>
  );
}

export function ProfileSettingsMenu({
  user,
  showBusinessEntry = false,
}: ProfileSettingsMenuProps) {
  const { showToast } = useVauto();
  const nativeApp = isNativeApp();
  const credits = getReferralCredits(user);
  const referralUrl = useMemo(() => buildReferralUrl(user), [user]);
  const planLabel =
    user.billingPlan === "pro" || user.billingPlan === "growth"
      ? "Pro narystė"
      : user.billingPlan === "start" || user.billingPlan === "starter"
        ? "Starto planas"
        : "Nemokamas planas";

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
    <div className="space-y-4" data-profile-settings-2>
      <SettingsCardSection
        title="Paskyros duomenys ir kontaktinė informacija"
        description="Tema, AI asistentas ir pagrindiniai paskyros nustatymai"
      >
        <SettingsControlRow
          icon={<Palette className="h-4 w-4 text-[var(--ds-brand)]" />}
          label="Tema"
          hint="Originali · Tamsi · Minimali"
        >
          <ThemeSwatchStrip />
        </SettingsControlRow>
        <SettingsRow
          icon={<UserRound className="h-4 w-4 text-[var(--ds-brand)]" />}
          label="Paskyra ir privatumas"
          hint={[user.phone, user.city, user.email].filter(Boolean).join(" · ") || "Kontaktiniai duomenys"}
          href="/profile/settings/"
        />
        <SettingsRow
          icon={<Sparkles className="h-4 w-4 text-[var(--ds-brand)]" />}
          label="AI asistentas"
          hint="Dydžiai, automobilis, pomėgiai"
          href="/profile/?tab=ai"
        />
      </SettingsCardSection>

      <SettingsCardSection
        title="Pranešimų ir paieškų nustatymai"
        description="Alertai, išsaugoti skelbimai ir socialinė sinchronizacija"
      >
        <SettingsRow
          icon={<Bell className="h-4 w-4 text-[var(--ds-brand)]" />}
          label="Pranešimai ir paieškos"
          hint="Privatumas, push alertai, wishlist"
          href="/profile/settings/"
        />
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
      </SettingsCardSection>

      <SettingsCardSection
        title="Saugumas ir slaptažodis"
        description="Prisijungimo būdas ir paskyros apsauga"
      >
        <SettingsRow
          icon={<Lock className="h-4 w-4 text-[var(--ds-brand)]" />}
          label="Saugumas"
          hint={
            user.authProvider
              ? `Prisijungimas: ${user.authProvider}`
              : user.phone
                ? "Prisijungimas telefonu"
                : "Tvarkykite prisijungimą nustatymuose"
          }
          href="/profile/settings/"
        />
      </SettingsCardSection>

      <SettingsCardSection
        title="Mokėjimai ir banko sąskaita"
        description="Kortelės, Stripe portalas ir mokėjimų istorija"
      >
        <SettingsRow
          icon={<CreditCard className="h-4 w-4 text-[var(--ds-brand)]" />}
          label="Mokėjimų metodai"
          hint="Kortelės ir sąskaitos"
          href="/profile/settings/?focus=payments"
        />
      </SettingsCardSection>

      <SettingsCardSection
        title="Verslo planas / Narystė"
        description="Dabartinis planas ir papildomos galimybės"
      >
        <div className="flex items-center justify-between gap-3 px-3 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ds-text-primary)]">
              {planLabel}
            </p>
            <p className="text-xs text-[var(--ds-text-muted)]">
              {user.role === "pro"
                ? "Verslo funkcijos aktyvios"
                : "Privatūs skelbimai be mėnesinio mokesčio"}
            </p>
          </div>
          <Badge tone={user.role === "pro" ? "premium" : "neutral"}>
            {user.role === "pro" ? "Pro" : "Free"}
          </Badge>
        </div>
        {showBusinessEntry ? (
          <SettingsRow
            icon={<Building2 className="h-4 w-4 text-[var(--ds-brand)]" />}
            label="VAUTO Verslui"
            hint="Statistika, dalijimosi vizualai, masinis įkėlimas"
            href="/verslui/"
          />
        ) : null}
        {!nativeApp ? (
          <SettingsRow
            icon={<Smartphone className="h-4 w-4 text-[var(--ds-brand)]" />}
            label="Atsisiųsti programėlę"
            hint="Android APK · iPhone PWA"
            href="/install/"
          />
        ) : null}
        <SettingsRow
          icon={<Settings2 className="h-4 w-4 text-[var(--ds-brand)]" />}
          label="Visi nustatymai"
          hint="Išvaizda, AI, privatumas, mokėjimai"
          href="/profile/settings/"
        />
      </SettingsCardSection>
    </div>
  );
}
