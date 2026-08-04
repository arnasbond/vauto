"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Layers,
  Share2,
  TrendingUp,
} from "lucide-react";
import { BusinessAccessGateModal } from "@/components/business/BusinessAccessGateModal";
import { BusinessPortalDashboard } from "@/components/business/BusinessPortalDashboard";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import {
  BUSINESS_REGISTRATION_PATH,
  hasBusinessPortalAccess,
} from "@/lib/business-portal-access";

const B2B_PILLARS = [
  {
    icon: BarChart3,
    title: "Realaus laiko analitika",
    text: "Peržiūros, telefono paspaudimai, kontaktai ir išlaidų atsipirkimas — tikri duomenys, be demonstracinių skaičių.",
  },
  {
    icon: Share2,
    title: "Automatiniai 9:16 vizualai",
    text: "Stories ir Reels vaizdai vienu bakstelėjimu — dalinkitės skelbimais Instagram, TikTok ir Facebook.",
  },
  {
    icon: Layers,
    title: "Masinis įkėlimas",
    text: "CSV / XML feed — katalogą suvaldote greičiau nei pildydami rankomis.",
  },
  {
    icon: TrendingUp,
    title: "Aukštesnis reitingas paieškoje",
    text: "Patvirtinti verslo pardavėjai su aktyvia Omniva logistika rodomi aukščiau už paprastus skelbimus.",
  },
] as const;

function VersluiMarketing({
  isAuthenticated,
  onOpenGate,
  onLogin,
}: {
  isAuthenticated: boolean;
  onOpenGate: () => void;
  onLogin: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 md:max-w-5xl md:px-0">
      <div className="flex flex-col items-center py-8 text-center md:items-start md:text-left">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--vauto-primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--vauto-primary)_8%,transparent)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--vauto-primary)]">
          <Building2 className="h-3.5 w-3.5" aria-hidden />
          VAUTO Verslui
        </span>

        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-[var(--vauto-text-heading)] sm:text-4xl md:max-w-3xl">
          Verslo kabinetas su analitika, socialiniais vizualais ir masiniu įkėlimu
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--vauto-text-muted)]">
          Keturi įrankiai, kurie skiria VAUTO verslo kabinetą nuo paprastos
          skelbimų lentos.
        </p>

        <ul className="mt-8 grid w-full gap-3 text-left sm:grid-cols-2">
          {B2B_PILLARS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="vauto-panel p-4">
              <div className="flex items-start gap-3">
                <span className="vauto-group-row-icon" aria-hidden>
                  <Icon className="h-4 w-4 text-[var(--vauto-primary)]" />
                </span>
                <div className="min-w-0">
                  <p className="vauto-panel-title">{title}</p>
                  <p className="vauto-panel-desc mt-1">{text}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto md:items-start">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={onOpenGate}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-6 py-3 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] transition hover:brightness-110 sm:w-auto"
            >
              Registruoti verslo paskyrą
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-6 py-3 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] transition hover:brightness-110 sm:w-auto"
            >
              Pradėti nemokamai
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
          <Link
            href={BUSINESS_REGISTRATION_PATH}
            className="text-sm font-semibold text-[var(--vauto-text-muted)] underline-offset-4 transition hover:text-[var(--vauto-primary)] hover:underline"
          >
            Pasirinkti verslo planą
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VersluiPage() {
  const { isAuthenticated, authHydrated, openAuthModal } = useAuth();
  const { user } = useVauto();
  const [gateOpen, setGateOpen] = useState(false);

  const canAccessPortal =
    isAuthenticated && hasBusinessPortalAccess(user);

  // Private signed-in users landing on /verslui from the avatar menu get the gate.
  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) return;
    if (canAccessPortal) {
      setGateOpen(false);
      return;
    }
    setGateOpen(true);
  }, [authHydrated, isAuthenticated, canAccessPortal]);

  if (!authHydrated) {
    return (
      <VautoAdaptiveLayout variant="plain">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--vauto-text-muted)]">
          Kraunama…
        </div>
      </VautoAdaptiveLayout>
    );
  }

  if (canAccessPortal) {
    return (
      <VautoAdaptiveLayout variant="plain">
        <BusinessPortalDashboard user={user} />
      </VautoAdaptiveLayout>
    );
  }

  return (
    <VautoAdaptiveLayout variant="plain">
      <VersluiMarketing
        isAuthenticated={isAuthenticated}
        onOpenGate={() => setGateOpen(true)}
        onLogin={() => openAuthModal("/verslui/")}
      />
      <BusinessAccessGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        isAuthenticated={isAuthenticated}
        preferPlanSelect={isAuthenticated}
        onLogin={() => openAuthModal("/pro-registration/")}
      />
    </VautoAdaptiveLayout>
  );
}
