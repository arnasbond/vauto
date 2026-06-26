"use client";

import Link from "next/link";
import {
  Briefcase,
  Building2,
  Car,
  Home,
  Palette,
  Share2,
  Shirt,
  Sparkles,
  Zap,
  Bell,
  Link2,
  Receipt,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import { shareReferralInvite } from "@/lib/referral";
import { SITE_URL } from "@/lib/social-share";
import { shareViaCapacitor, canUseCapacitorShare } from "@/lib/native-share";
import { cn } from "@/lib/cn";

function BenefitCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-4 shadow-sm">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--vauto-teal)]/12">
        <Icon className="h-5 w-5 text-[var(--vauto-teal)]" />
      </div>
      <h3 className="text-sm font-bold text-[var(--vauto-text)]">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
        {description}
      </p>
    </div>
  );
}

export default function ApiePage() {
  const { user, isAuthenticated, openAuthModal } = useAuth();
  const { showToast } = useVauto();

  const handleShare = async () => {
    if (isAuthenticated && user.id !== "guest") {
      const ok = await shareReferralInvite(user);
      showToast(
        ok ? "Pasirinkite Messenger, Viber ar SMS" : "Dalijimasis atšauktas",
        ok ? "success" : "info"
      );
      return;
    }

    const payload = {
      title: "VAUTO — išmanioji skelbimų ekosistema",
      text: "Prisijunk prie VAUTO — Auto, NT, Drabužiai, Darbas ir Paslaugos visoje Lietuvoje vienoje vietoje!",
      url: SITE_URL,
      dialogTitle: "Pasidalinti su draugais",
    };

    if (canUseCapacitorShare()) {
      const ok = await shareViaCapacitor(payload);
      if (ok) return;
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        /* dismissed */
      }
    }
    openAuthModal("/registracija");
    showToast("Prisijunkite, kad gautumėte asmeninę pakvietimo nuorodą", "info");
  };

  return (
    <AppShell variant="plain">
      <Header />
      <div className="pb-4 pt-2">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-[var(--vauto-border)] bg-gradient-to-br from-[var(--vauto-teal)]/15 via-[var(--vauto-surface)] to-[var(--vauto-orange)]/10 p-6 shadow-sm">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--vauto-teal)]/10 blur-2xl" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--vauto-teal)]">
            Apie projektą
          </p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight text-[var(--vauto-text)] sm:text-3xl">
            VAUTO — pirmoji išmanioji skelbimų ekosistema Lietuvoje
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--vauto-text-muted)]">
            Apjunk viską vienoje vietoje:{" "}
            <strong className="text-[var(--vauto-text)]">Auto</strong>,{" "}
            <strong className="text-[var(--vauto-text)]">NT</strong>,{" "}
            <strong className="text-[var(--vauto-text)]">Drabužius</strong>,{" "}
            <strong className="text-[var(--vauto-text)]">Darbą</strong> ir{" "}
            <strong className="text-[var(--vauto-text)]">Paslaugas</strong> — su
            žaibišku <span className="text-[var(--vauto-orange)]">Chameleon</span>{" "}
            prisitaikymu prie kiekvieno portalo stiliaus. Veikiame visoje Lietuvoje —
            be regioninių apribojimų.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { Icon: Car, label: "Auto" },
              { Icon: Home, label: "NT" },
              { Icon: Shirt, label: "Drabužiai" },
              { Icon: Briefcase, label: "Darbas" },
              { Icon: Sparkles, label: "Paslaugos" },
            ].map(({ Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--vauto-border)] bg-[var(--vauto-bg)]/80 px-3 py-1 text-[11px] font-semibold text-[var(--vauto-text)]"
              >
                <Icon className="h-3.5 w-3.5 text-[var(--vauto-teal)]" />
                {label}
              </span>
            ))}
          </div>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[var(--vauto-teal)] px-5 py-3 text-sm font-bold text-white shadow-md transition hover:opacity-90"
          >
            <Zap className="h-4 w-4" />
            Pradėti naršyti
          </Link>
        </section>

        {/* B2C */}
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-bold text-[var(--vauto-text)]">
            Ką išlošia paprastas vartotojas
          </h2>
          <p className="mb-4 text-xs text-[var(--vauto-text-muted)]">
            Nemokamai, be įkyrių reklamų — visoje Lietuvoje
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <BenefitCard
              icon={Palette}
              title="Trigubas temų jungiklis"
              description="Tamsi, Minimali ir Originali — pasirinkite vizualą, kuris jums patogiausias bet kuriame įrenginyje."
            />
            <BenefitCard
              icon={Bell}
              title="Realaus laiko Push su nuotraukomis"
              description="Pranešimai kaip Messenger — su skelbimo nuotrauka, tiesiai į telefono užraktinimo ekraną."
            />
            <BenefitCard
              icon={Link2}
              title="Revoliucinis AI skelbimų importas"
              description="Įklijuokite nuorodą iš Autoplius, Aruodas, Vinted, Skelbiu ar CVBankas — VAUTO AI užpildo skelbimą per ~5 sekundes."
            />
            <BenefitCard
              icon={Sparkles}
              title="Nemokamas naršymas"
              description="Ieškokite, filtruokite ir bendraukite be įkyrių reklamų. Anoniminis režimas — švarus ir paprastas."
            />
          </div>
        </section>

        {/* B2B */}
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-bold text-[var(--vauto-text)]">
            Ką išlošia verslas (B2B)
          </h2>
          <p className="mb-4 text-xs text-[var(--vauto-text-muted)]">
            Profesionalams, darbdaviams ir pardavėjams visoje Lietuvoje
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <BenefitCard
              icon={Building2}
              title="Profesionalus kabinetas"
              description="B2B valdymo skydelis su analitika, skelbimų CRUD ir išmaniu iškėlimu — kaip dideliame portale."
            />
            <BenefitCard
              icon={Users}
              title="Integruotas CV inbox"
              description="Darbdaviams: visi kandidatų CV vienoje vietoje, su realaus laiko pokalbiais ir būsenomis."
            />
            <BenefitCard
              icon={Receipt}
              title="Automatinės PVM sąskaitos"
              description="Skaidrūs prenumeratos planai be permokų — sąskaitos-faktūros generuojamos automatiškai iš kabineto."
            />
            <BenefitCard
              icon={Zap}
              title="Skaidrūs planai ir kreditai"
              description="START / GROWTH / ENTERPRISE — mokate tik už tai, ką naudojate. Piniginė ir iškėlimai vienoje vietoje."
            />
          </div>
        </section>

        {/* CTA */}
        <section
          className={cn(
            "mt-8 rounded-3xl border border-[var(--vauto-orange)]/40 p-6 text-center",
            "bg-gradient-to-r from-[var(--vauto-orange)]/10 to-[var(--vauto-teal)]/10"
          )}
        >
          <h2 className="text-lg font-bold text-[var(--vauto-text)]">
            Pakviesk draugą — gauk TOP iškėlimą nemokamai
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-xs text-[var(--vauto-text-muted)]">
            Pasidalink VAUTO su draugais per Messenger, Viber ar SMS — vienu
            paspaudimu, visoje Lietuvoje.
          </p>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--vauto-orange)] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition active:scale-[0.98]"
          >
            <Share2 className="h-5 w-5" />
            Pasidalinti su draugais
          </button>
        </section>
      </div>
    </AppShell>
  );
}
