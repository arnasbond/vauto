"use client";

import Link from "next/link";
import {
  Bell,
  Briefcase,
  Camera,
  Car,
  Heart,
  Home,
  Link2,
  MessageCircle,
  Package,
  Search,
  Share2,
  Shirt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
  Wrench,
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
import { useFeatureReadiness } from "@/hooks/useFeatureReadiness";
import {
  claimBadgeClass,
  featureClaimStateLabel,
  type FeatureClaimState,
} from "@/lib/feature-readiness";
import { FeatureClaimsPanel } from "@/components/status/FeatureClaimsPanel";

function FeatureCard({
  icon: Icon,
  title,
  description,
  claimState,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  claimState?: FeatureClaimState;
}) {
  return (
    <div className="rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-5 shadow-sm transition hover:border-[var(--vauto-teal)]/30">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--vauto-teal)]/12">
          <Icon className="h-5 w-5 text-[var(--vauto-teal)]" />
        </div>
        {claimState ? (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
              claimBadgeClass(claimState)
            )}
          >
            {featureClaimStateLabel(claimState)}
          </span>
        ) : null}
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

function AudienceCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] p-5">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--vauto-teal)] text-white shadow-sm">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-bold text-[var(--vauto-text)]">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
        {description}
      </p>
    </div>
  );
}

function CategoryRow({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--vauto-teal)]/12 text-[var(--vauto-teal)]">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h3 className="text-sm font-bold text-[var(--vauto-text)]">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
          {description}
        </p>
      </div>
    </div>
  );
}

function BenefitItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-relaxed text-[var(--vauto-text)]">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vauto-teal)]" />
      <span>{children}</span>
    </li>
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
  const { claims } = useFeatureReadiness();
  const claimById = Object.fromEntries(claims.map((c) => [c.id, c.state]));

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
            Apie VAUTO
          </p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight text-[var(--vauto-text)] sm:text-3xl lg:text-[2rem]">
            VAUTO — Pirmoji Lietuvoje išmanioji skelbimų ekosistema
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--vauto-text-muted)] sm:text-[15px]">
            Nuotrauka → Deep OCR → skelbimas. Realaus laiko pokalbiai su momentiniu
            vertimu, Omniva pastomatų atranka pagal matmenis, pasitikėjimo
            atsiliepimai ir „Laukiu šio daikto“ pranešimai — Auto, NT, Paslaugos,
            Darbas, Mada ir Elektronika vienoje ekosistemoje. Starto mėnuo — 0 €.
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

        {/* Kam skirta */}
        <section className="mt-10">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-orange)]">
              Kam skirta
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--vauto-text)] sm:text-xl">
              VAUTO — kiekvienam, kas perka ar parduoda
            </h2>
            <p className="mt-1.5 text-sm text-[var(--vauto-text-muted)]">
              Nesvarbu, ar tik ieškote, ar parduodate iš namų, ar valdote verslą —
              atrasite savo vietą.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <AudienceCard
              icon={Search}
              title="Pirkėjams"
              description="Ieškokite bet ko — automobilio, buto, paslaugos ar drabužio — vienu sakiniu arba nuotrauka. AI supras, ko norite, ir suras geriausius pasiūlymus už jus."
            />
            <AudienceCard
              icon={Heart}
              title="Privatiems pardavėjams"
              description="Ypač patogu mados ir asmeninių daiktų pardavėjams: paprasta „spinta“, automatinis skelbimų kūrimas ir šiltos AI derybos su pirkėjais, kol jūs užsiimate savo dienomis."
            />
            <AudienceCard
              icon={Users}
              title="Verslui ir profesionalams"
              description="Auto pardavėjams, nekilnojamojo turto ir paslaugų teikėjams — verslo kabinetas, analitika, masinis valdymas ir profesionalus AI derybininkas."
            />
          </div>
        </section>

        {/* Esminės AI galimybės */}
        <section className="mt-10">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-orange)]">
              Galimybės
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--vauto-text)] sm:text-xl">
              Ką VAUTO padarys už jus
            </h2>
            <p className="mt-1.5 text-sm text-[var(--vauto-text-muted)]">
              Visą sunkų darbą — atpažinimą, aprašymus, derybas ir sinchronizaciją —
              perima protingas AI. Žemiau matote realią kiekvienos funkcijos būseną.
            </p>
          </div>
          <FeatureClaimsPanel claims={claims} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FeatureCard
              icon={Sparkles}
              title="Deep OCR ir vaizdo atpažinimas"
              claimState={claimById.ai_vision}
              description="Įkelkite pakuotę, tech. pasą ar daiktą — AI ištraukia faktus ir paruošia kategorijos aprašymą be formų pildymo."
            />
            <FeatureCard
              icon={Package}
              title="Omniva pastomatų atranka"
              claimState={claimById.escrow}
              description="Sistema automatiškai įvertina matmenis: mažoms prekėms siūlo pastomatą, o per didelėms — parodo įspėjimą ir kitus pristatymo būdus."
            />
            <FeatureCard
              icon={MessageCircle}
              title="Realaus laiko pokalbiai + vertimas"
              claimState={claimById.negotiator}
              description="Pirkėjas ir pardavėjas rašo akimirksniu. Ant žinučių — „🌐 Išversti“ mygtukas kitakalbėms žinutėms."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Pasitikėjimas ir atsiliepimai"
              description="Žvaigždutės profiliuose ir skelbimuose, „Patikrintas pardavėjas“ ženklas, o už atsiliepimą — 1 nemokamas TOP iškėlimas."
            />
            <FeatureCard
              icon={Bell}
              title="„Laukiu šio daikto“ pranešimai"
              description="Nerandate Volvo V70 2006 juodo? Išsaugokite paiešką — kai atsiras atitikmuo, gausite Web Push / programėlės alertą."
            />
            <FeatureCard
              icon={Wallet}
              title="0 € starto mėnuo"
              claimState={claimById.escrow}
              description="Starto akcija: pirmasis mėnuo 0 €. Escrow apsauga ir matomumo paketai — kai būsite pasiruošę augti."
            />
          </div>
        </section>

        {/* Idealus vartotojo kelias */}
        <section className="mt-10 rounded-3xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold text-[var(--vauto-text)] sm:text-xl">
            Kaip tai veikia
          </h2>
          <p className="mt-1.5 text-sm text-[var(--vauto-text-muted)]">
            Trys paprasti žingsniai — nuo nuotraukos iki skelbimo ar paieškos, be jokių
            formų.
          </p>

          <div className="relative mt-8 grid gap-10 sm:grid-cols-3 sm:gap-6">
            <div
              className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-6 hidden h-0.5 bg-gradient-to-r from-[var(--vauto-teal)]/20 via-[var(--vauto-teal)]/50 to-[var(--vauto-orange)]/40 sm:block"
              aria-hidden
            />
            <JourneyStep
              step={1}
              icon={Link2}
              title="Nuotrauka, nuoroda ar tekstas"
              description="Tiesiog įkelkite daikto nuotrauką, įklijuokite skelbimo nuorodą arba parašykite, ko ieškote — vos per kelias sekundes."
            />
            <JourneyStep
              step={2}
              icon={MessageCircle}
              title="AI supranta, ko norite"
              description='AI paklaus: „Matau [daiktą] — ką norite daryti?“ ir pasiūlys: „🔍 Ieškoti šio daikto“ arba „➕ Įkelti skelbimą“.'
            />
            <JourneyStep
              step={3}
              icon={UserCheck}
              title="Patvirtinate — ir baigta"
              description="Jokių privalomų laukų. Kontaktai įsikelia iš profilio patys, o su AI asistentu bendraujate paprastu, laisvu pokalbiu."
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

        {/* Kategorijos */}
        <section className="mt-10">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-orange)]">
              Kategorijos
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--vauto-text)] sm:text-xl">
              Viena platforma — visos skelbimų kategorijos
            </h2>
            <p className="mt-1.5 text-sm text-[var(--vauto-text-muted)]">
              Viskas, ką norite parduoti ar rasti, jau telpa čia.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CategoryRow
              icon={Car}
              title="Auto"
              description="Automobiliai su VIN / numerių OCR, tech. duomenimis ir auto kabinetu."
            />
            <CategoryRow
              icon={Home}
              title="Nekilnojamas turtas"
              description="Butai, namai, sklypai ir nuoma — aiškiai ir be painiavos."
            />
            <CategoryRow
              icon={Wrench}
              title="Paslaugos"
              description="Remontas, grožis, transportas — su teritorijos filtru ir leadais."
            />
            <CategoryRow
              icon={Briefcase}
              title="Darbas"
              description="Darbo skelbimai verslui ir specialistams — vienoje ekosistemoje."
            />
            <CategoryRow
              icon={Shirt}
              title="Mada"
              description="Asmeninė „spinta“ su AI atpažinimu — parduokite greitai."
            />
            <CategoryRow
              icon={Smartphone}
              title="Elektronika"
              description="Telefonai, kompiuteriai ir gadgetai — su Deep OCR iš pakuotės."
            />
          </div>
        </section>

        {/* Kodėl VAUTO */}
        <section className="mt-10 rounded-3xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold text-[var(--vauto-text)] sm:text-xl">
            Kodėl verta rinktis VAUTO
          </h2>
          <p className="mt-1.5 text-sm text-[var(--vauto-text-muted)]">
            Mažiau rankinio darbo, daugiau ramybės — ir viskas vienoje vietoje.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            <BenefitItem>
              <strong>Visos kategorijos</strong> — Auto, NT, Paslaugos, Darbas, Mada,
              Elektronika.
            </BenefitItem>
            <BenefitItem>
              <strong>Deep OCR</strong> — skelbimas iš nuotraukos, ne iš formų.
            </BenefitItem>
            <BenefitItem>
              <strong>Omniva pastomatai</strong> — automatinė tinkamumo atranka.
            </BenefitItem>
            <BenefitItem>
              <strong>Pasitikėjimo sistema</strong> — žvaigždutės, ženklai, TOP už
              atsiliepimą.
            </BenefitItem>
            <BenefitItem>
              <strong>Išmanieji alertai</strong> — „Laukiu šio daikto“ kai atsiranda
              atitikmuo.
            </BenefitItem>
            <BenefitItem>
              <strong>0 € startas</strong> — pirmasis mėnuo be prenumeratos mokesčio.
            </BenefitItem>
          </ul>
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
            Pakvieskite draugą — gaukite TOP iškėlimą nemokamai
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-xs text-[var(--vauto-text-muted)]">
            Pasidalinkite VAUTO su draugais per Messenger, Viber ar SMS — vienu
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
