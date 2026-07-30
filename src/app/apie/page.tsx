"use client";

import Link from "next/link";
import {
  Bell,
  Briefcase,
  Camera,
  Car,
  Heart,
  Home,
  KeyRound,
  Languages,
  LineChart,
  MessageCircle,
  Package,
  Search,
  Share2,
  Smartphone,
  Sparkles,
  Star,
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
      title: "VAUTO — Pirmoji Lietuvoje išmanioji skelbimų ekosistema",
      text: "Pamirškite ilgas formas — nufotografuokite daiktą, o AI paruoš skelbimą per kelias sekundes. Starto mėnuo — 0 €!",
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
        {/* Hero & promo */}
        <section className="relative overflow-hidden rounded-3xl border border-[var(--vauto-border)] bg-gradient-to-br from-[var(--vauto-teal)]/15 via-[var(--vauto-surface)] to-[var(--vauto-orange)]/10 p-6 shadow-sm sm:p-8">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--vauto-teal)]/10 blur-2xl" />
          <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-[var(--vauto-orange)]/10 blur-2xl" />
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--vauto-orange)]/15 px-3 py-1 text-[11px] font-bold text-[var(--vauto-orange)] ring-1 ring-[var(--vauto-orange)]/25">
            🎉 Starto akcija: 0 € (3 mėnesius nemokamai)!
          </p>
          <h1 className="mt-4 text-2xl font-extrabold leading-tight text-[var(--vauto-text)] sm:text-3xl lg:text-[2rem]">
            VAUTO — Pirmoji Lietuvoje išmanioji skelbimų ekosistema
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--vauto-text-muted)] sm:text-[15px]">
            Vision AI + pokalbio asistentas paruošia skelbimą iš nuotraukos, AI kainos
            vertintojas parenka rinkos kainą, o Omniva paštomatai — siuntimą vienu
            paspaudimu.
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
              Nesvarbu, ar ieškote, ar parduodate iš namų, ar valdote verslą —
              atrasite savo vietą visoje Lietuvoje.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <AudienceCard
              icon={Search}
              title="Pirkėjams"
              description="Ieškokite automobilio, buto, paslaugos ar daikto vienu sakiniu. Nerandate dabar? Įjunkite „Laukiu šio daikto“ — pranešime, kai atsiras."
            />
            <AudienceCard
              icon={Heart}
              title="Privatiems pardavėjams"
              description="Nuotrauka — ir skelbimas paruoštas. AI kainos rėžis, Omniva paštomatas, realaus laiko pokalbiai ir atsiliepimai su TOP dovana."
            />
            <AudienceCard
              icon={Users}
              title="Verslui ir profesionalams"
              description="ROI analitikos skydelis, 9:16 Social Engine, bulk įkėlimas ir aukštesnis reitingas (b2bTrustBoost) su Omniva logistika."
            />
          </div>
        </section>

        {/* Core ecosystem advantages */}
        <section className="mt-10">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-orange)]">
              Ekosistema
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--vauto-text)] sm:text-xl">
              Kodėl VAUTO — daugiau nei skelbimų lenta
            </h2>
            <p className="mt-1.5 text-sm text-[var(--vauto-text-muted)]">
              Visa išmanioji grandinė: nuo nuotraukos iki skelbimo ir pokalbio — AI,
              pasitikėjimas, pranešimai ir gyvas Omniva paštomatų lipdukų API.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FeatureCard
              icon={Sparkles}
              title="🧠 Gilusis AI atpažinimas (Deep OCR)"
              description="Auto-pildymas iš pakuočių, techninių specifikacijų ir Regitra dokumentų — be ilgų formų."
            />
            <FeatureCard
              icon={Star}
              title="⭐️ Patikimumo ir reitingų sistema"
              description="Skaidrūs įvertinimai, „Patikrintas pardavėjas“ ženkliukas ir dovanų TOP iškėlimas už paliktą atsiliepimą."
            />
            <FeatureCard
              icon={Bell}
              title="🔔 Išmanieji norų pranešimai („Laukiu šio daikto“)"
              description="Automatinis pirkėjo perspėjimas, kai tik atsiranda jo ieškoma prekė — Web Push arba programėlėje."
            />
            <FeatureCard
              icon={Package}
              title="📦 AI gabaritai ir paštomatai"
              description="AI tikrina matmenis (S, M, L) ir siūlo tinkamą paštomatą. Omniva lipdukai — oficialus OMX live API (Escrow → Siuntos lipdukas)."
            />
            <FeatureCard
              icon={Languages}
              title="🌐 Tiesioginis pokalbių vertėjas"
              description="Tiesioginis žinučių vertimas pokalbių lange vienu paspaudimu — „🌐 Išversti“ ant kiekvienos žinutės."
            />
            <FeatureCard
              icon={LineChart}
              title="💰 AI Kainų vertintojas"
              description="PriceRangeBar prieš publikavimą — rinkos rėžis ir optimali kaina, kad greičiau rastumėte pirkėją."
            />
            <FeatureCard
              icon={KeyRound}
              title="🔑 Greita ir saugi autorizacija"
              description="Prisijungimas vienu paspaudimu su Apple Sign-In, Google arba SMS OTP patvirtinimu."
            />
            <FeatureCard
              icon={Wallet}
              title="🎉 Starto akcija — 0 €"
              description="3 mėnesius nemokamai (0 €), be kortelės. Augant — matomumo paketai, escrow apsauga ir TOP iškėlimai."
            />
          </div>
        </section>

        {/* How it works — 3 steps */}
        <section className="mt-10 rounded-3xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold text-[var(--vauto-text)] sm:text-xl">
            Kaip tai veikia
          </h2>
          <p className="mt-1.5 text-sm text-[var(--vauto-text-muted)]">
            Trys paprasti žingsniai — nuo nuotraukos iki publikavimo per ~10 sekundžių.
          </p>

          <div className="relative mt-8 grid gap-10 sm:grid-cols-3 sm:gap-6">
            <div
              className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-6 hidden h-0.5 bg-gradient-to-r from-[var(--vauto-teal)]/20 via-[var(--vauto-teal)]/50 to-[var(--vauto-orange)]/40 sm:block"
              aria-hidden
            />
            <JourneyStep
              step={1}
              icon={Camera}
              title="Nuotrauka ar tekstas"
              description="Įkelkite daikto, pakuotės ar dokumento nuotrauką — arba parašykite, ko ieškote."
            />
            <JourneyStep
              step={2}
              icon={Sparkles}
              title="AI analizė ir aprašymas"
              description="Deep OCR ištraukia faktus, sugeneruoja kategorijos aprašymą ir pasiūlo kainą bei pristatymą."
            />
            <JourneyStep
              step={3}
              icon={UserCheck}
              title="Publikavimas per 10 s"
              description="Patvirtinate — skelbimas gyvas. Toliau: realaus laiko pokalbiai, atsiliepimai ir Omniva siuntos lipdukas."
            />
          </div>
        </section>

        {/* Categories */}
        <section className="mt-10">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-orange)]">
              Kategorijos
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--vauto-text)] sm:text-xl">
              Pilnas palaikymas visoms skelbimų kategorijoms
            </h2>
            <p className="mt-1.5 text-sm text-[var(--vauto-text-muted)]">
              Viena ekosistema — nuo transporto iki mados ir elektronikos.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CategoryRow
              icon={Car}
              title="🚗 Automobiliai ir transportas"
              description="VIN / numerių OCR, tech. duomenys iš Regitra dokumentų ir auto kabinetas."
            />
            <CategoryRow
              icon={Home}
              title="🏠 Nekilnojamasis turtas"
              description="Butai, namai, sklypai ir nuoma — aiškiai, be painiavos."
            />
            <CategoryRow
              icon={Wrench}
              title="🛠️ Paslaugos ir nuoma"
              description="Remontas, grožis, transportas, įrangos nuoma — su teritorijos filtru."
            />
            <CategoryRow
              icon={Briefcase}
              title="💼 Darbo skelbimai"
              description="Darbo pozicijos verslui ir specialistams — vienoje ekosistemoje."
            />
            <CategoryRow
              icon={Smartphone}
              title="📦 Elektronika, mada ir daiktai"
              description="Telefonai, drabužiai, buitis — Deep OCR iš pakuotės ir greitas publikavimas."
            />
            <CategoryRow
              icon={MessageCircle}
              title="💬 Realaus laiko pokalbiai"
              description="Pirkėjas ↔ pardavėjas akimirksniu, su vieno mygtuko vertimu."
            />
          </div>
        </section>

        {/* Mobile install */}
        <section className="mt-10 rounded-3xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[var(--vauto-text)]">
            Atsisiųskite programėlę
          </h2>
          <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
            Android — APK atsisiuntimas. iPhone — pridėkite į pradžios ekraną.
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
            Pasidalinkite VAUTO per Messenger, Viber ar SMS — ir startuokite su 0 €
            pirmuoju mėnesiu.
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
