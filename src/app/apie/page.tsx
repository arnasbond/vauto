"use client";

import Link from "next/link";
import {
  Camera,
  Eraser,
  Globe2,
  Link2,
  MessageCircle,
  ScanLine,
  Share2,
  Sparkles,
  UserCheck,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { InstallDownloadButtons } from "@/components/InstallDownloadButtons";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import { shareReferralInvite } from "@/lib/referral";
import { SITE_URL } from "@/lib/social-share";
import { shareViaCapacitor, canUseCapacitorShare } from "@/lib/native-share";
import { cn } from "@/lib/cn";

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-5 shadow-sm transition hover:border-[var(--vauto-teal)]/30">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--vauto-teal)]/12">
        <Icon className="h-5 w-5 text-[var(--vauto-teal)]" />
      </div>
      <h3 className="text-sm font-bold leading-snug text-[var(--vauto-text)]">
        {title}
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
        {description}
      </p>
    </div>
  );
}

function JourneyStep({
  step,
  title,
  description,
  icon: Icon,
}: {
  step: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="relative flex flex-col items-center text-center sm:items-start sm:text-left">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--vauto-teal)] text-lg font-extrabold text-white shadow-md">
        {step}
      </div>
      <div className="mt-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)]">
        <Icon className="h-5 w-5 text-[var(--vauto-orange)]" />
      </div>
      <h3 className="mt-3 text-sm font-bold text-[var(--vauto-text)]">{title}</h3>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-[var(--vauto-text-muted)]">
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
      text: "Pamiršk formų pildymą — įkelk nuotrauką ar nuorodą, o AI padarys viską už tave. Visoje Lietuvoje!",
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
        <section className="relative overflow-hidden rounded-3xl border border-[var(--vauto-border)] bg-gradient-to-br from-[var(--vauto-teal)]/15 via-[var(--vauto-surface)] to-[var(--vauto-orange)]/10 p-6 shadow-sm sm:p-8">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--vauto-teal)]/10 blur-2xl" />
          <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-[var(--vauto-orange)]/10 blur-2xl" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--vauto-teal)]">
            Apie projektą
          </p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight text-[var(--vauto-text)] sm:text-3xl lg:text-[2rem]">
            VAUTO — pirmoji išmanioji skelbimų ekosistema Lietuvoje
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--vauto-text-muted)] sm:text-[15px]">
            Pamirškite varginantį formų pildymą. Įkelkite skelbimą arba suraskite
            norimą daiktą naudodami tik vieną kameros fiksavimą arba nuorodą. AI fone
            atliks visą sunkų darbą už jus.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/add/"
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--vauto-teal)] px-5 py-3 text-sm font-bold text-white shadow-md transition hover:opacity-90"
            >
              <Camera className="h-4 w-4" />
              Įkelti su AI
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)]/80 px-5 py-3 text-sm font-bold text-[var(--vauto-text)] shadow-sm transition hover:border-[var(--vauto-teal)]/40"
            >
              <Zap className="h-4 w-4 text-[var(--vauto-teal)]" />
              Pradėti naršyti
            </Link>
          </div>
        </section>

        {/* Esminės nauovės */}
        <section className="mt-10">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-orange)]">
              v1.6.14 — v1.6.18
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--vauto-text)] sm:text-xl">
              Esminės AI nauovės
            </h2>
            <p className="mt-1.5 text-sm text-[var(--vauto-text-muted)]">
              Vizualinis konvejeris, automatinis atpažinimas ir pokalbių sąsaja — be
              rankinio katalogų naršymo.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FeatureCard
              icon={Sparkles}
              title="Universalus vaizdo atpažinimas"
              description="Įkelta nuotrauka akimirksniu išanalizuojama. AI nustato objekto tipą, markę, modelį ar kategoriją, pašalindamas poreikį rankiniu būdu naršyti po katalogus."
            />
            <FeatureCard
              icon={Eraser}
              title="Automatinis fono valymas (Studio BG)"
              description="Mūsų integruotas AI konvejeris automatiškai ištrina netvarkingą nuotraukos foną ir pakeičia jį švariu, profesionaliu studijiniu vaizdu."
            />
            <FeatureCard
              icon={ScanLine}
              title="VIN & Numerių OCR skenavimas"
              description="Vienu kadru nufotografuokite automobilio VIN kodą arba valstybinį numerį – sistema automatiškai ištrauks duomenis iš NHTSA bei Regitros bazių (įskaitant ridos istoriją bei TA)."
            />
            <FeatureCard
              icon={Globe2}
              title="Globali portalų sinchronizacija"
              description="Įkėlę skelbimą pas mus, galite jį automatiškai eksportuoti ir kas 3 dienas atnaujinti didžiausiuose vietiniuose bei tarptautiniuose portaluose (eBay, Vinted, OLX, Skelbiu)."
            />
          </div>
        </section>

        {/* Idealus vartotojo kelias */}
        <section className="mt-10 rounded-3xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold text-[var(--vauto-text)] sm:text-xl">
            Idealus vartotojo kelias
          </h2>
          <p className="mt-1.5 text-sm text-[var(--vauto-text-muted)]">
            Trys žingsniai — nuo nuotraukos iki skelbimo ar paieškos be formų galvos
            skausmo.
          </p>

          <div className="relative mt-8 grid gap-10 sm:grid-cols-3 sm:gap-6">
            <div
              className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-6 hidden h-0.5 bg-gradient-to-r from-[var(--vauto-teal)]/20 via-[var(--vauto-teal)]/50 to-[var(--vauto-orange)]/40 sm:block"
              aria-hidden
            />
            <JourneyStep
              step={1}
              icon={Link2}
              title="Nuotrauka arba Nuoroda"
              description="Tiesiog įkelkite daikto foto arba įklijuokite skelbimo URL iš kito portalo per 5 sekundes."
            />
            <JourneyStep
              step={2}
              icon={MessageCircle}
              title="Protingas ketinimo pasirinkimas"
              description='AI paklaus: „Matau [Daiktą], ką norite daryti?“ ir pasiūlys du kelius: „🔍 Ieškoti šio daikto“ arba „➕ Įkelti skelbimą“.'
            />
            <JourneyStep
              step={3}
              icon={UserCheck}
              title="Laisvas patvirtinimas"
              description="Jokių privalomų laukų pančių. Kontaktai įkrenta iš profilio automatiškai, o su AI asistentu bendraujate laisvu pokalbiu."
            />
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-2 sm:justify-start">
            {["🔍 Ieškoti šio daikto", "➕ Įkelti skelbimą"].map((chip) => (
              <span
                key={chip}
                className="inline-flex rounded-full border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--vauto-text)]"
              >
                {chip}
              </span>
            ))}
          </div>
        </section>

        {/* Mobile install */}
        <section className="mt-10 rounded-3xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[var(--vauto-text)]">
            Atsisiųskite programėlę
          </h2>
          <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
            Android — APK atsisiuntimas. iPhone — instrukcija pridėti į pradžios ekraną.
          </p>
          <div className="mt-4">
            <InstallDownloadButtons />
          </div>
        </section>

        {/* CTA */}
        <section
          className={cn(
            "mt-10 rounded-3xl border border-[var(--vauto-orange)]/40 p-6 text-center",
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
