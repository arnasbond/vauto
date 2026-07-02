"use client";

import Link from "next/link";
import {
  Bot,
  Camera,
  Car,
  Eraser,
  Globe2,
  Heart,
  Home,
  Link2,
  MessageCircle,
  Package,
  ScanLine,
  Search,
  Share2,
  Shirt,
  ShieldCheck,
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
            VAUTO — viskas viename AI prekybos asistente
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--vauto-text-muted)] sm:text-[15px]">
            Sveiki atvykę! VAUTO sujungia automobilių, nekilnojamojo turto, paslaugų,
            mados ir įvairius kitus skelbimus į vieną jaukią, išmanią platformą.
            Nufotografuokite, įklijuokite nuorodą arba tiesiog parašykite — o AI paruoš
            skelbimą, sujungs jį su kitais portalais ir net derėsis su pirkėjais jūsų
            vardu. Jūs ilsitės, VAUTO dirba.
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
              perima protingas AI.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FeatureCard
              icon={Sparkles}
              title="Universalus vaizdo atpažinimas"
              description="Įkelta nuotrauka akimirksniu išanalizuojama. AI nustato, ką matote — objektą, markę, modelį ar kategoriją — ir jums nebereikia rankiniu būdu naršyti po katalogus."
            />
            <FeatureCard
              icon={Eraser}
              title="Automatinis fono valymas (Studio BG)"
              description="AI švelniai ištrina netvarkingą nuotraukos foną ir pakeičia jį švariu, profesionaliu studijiniu vaizdu — jūsų prekės atrodo gražiausiai."
            />
            <FeatureCard
              icon={ScanLine}
              title="VIN ir numerių atpažinimas"
              description="Nufotografuokite automobilio VIN kodą ar valstybinį numerį — sistema pati ištrauks duomenis iš oficialių registrų, įskaitant ridos istoriją bei techninę apžiūrą."
            />
            <FeatureCard
              icon={Bot}
              title="AI derybininkas 24/7"
              description="Kai pirkėjas rašo ar dera dėl kainos, jūsų AI dvynys atsako mandagiai ir pagal jūsų taisykles — dieną ir naktį, nė vieno kliento nepraleisdamas."
            />
            <FeatureCard
              icon={Globe2}
              title="Skelbimai visur, kur reikia"
              description="Įkeltą skelbimą galite automatiškai palaikyti aktualų ir kituose skelbimų portaluose — VAUTO reguliariai jį atnaujina, kad jis nepaskęstų."
            />
            <FeatureCard
              icon={Wallet}
              title="Saugūs mokėjimai ir kainų patarėjas"
              description="Apsaugoti sandoriai su saugumo laikmačiu, siuntų sekimas ir rinkos analize pagrįsta rekomenduojama kaina — parduodate ramiai ir teisingai."
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
              title="Automobilių skelbimai"
              description="Su VIN atpažinimu, ridos istorija ir patogiu auto pardavėjų valdymu."
            />
            <CategoryRow
              icon={Home}
              title="Nekilnojamojo turto skelbimai"
              description="Butai, namai, sklypai ir nuoma — aiškiai ir be painiavos."
            />
            <CategoryRow
              icon={Wrench}
              title="Paslaugų skelbimai"
              description="Remontas, grožis, transportas ir kita — su patogiu teritorijos filtru."
            />
            <CategoryRow
              icon={Shirt}
              title="Mados ir drabužių skelbimai"
              description="Asmeninė „spinta“ su AI atpažinimu — parduokite lengvai ir greitai."
            />
            <CategoryRow
              icon={Package}
              title="Įvairūs skelbimai"
              description="Elektronika, buičiai ir bet kokie kiti daiktai — universalus atpažinimas viskam."
            />
            <CategoryRow
              icon={Search}
              title="Išmanioji paieška"
              description="Aprašykite, ko ieškote, savais žodžiais — AI supras ir suras už jus."
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
              <strong>Viena paskyra</strong> vietoj daugybės atskirų svetainių.
            </BenefitItem>
            <BenefitItem>
              <strong>AI vietoj rankinio darbo</strong> — skelbimas per minutę, ne
              valandą.
            </BenefitItem>
            <BenefitItem>
              <strong>Derybos fone</strong> — nepraleisite nė vieno pirkėjo, net miegodami.
            </BenefitItem>
            <BenefitItem>
              <strong>Skelbimai visada aktualūs</strong> — sistema pasirūpina atnaujinimais.
            </BenefitItem>
            <BenefitItem>
              <strong>Saugūs sandoriai</strong> — apsauga ir patikimumo įvertinimai.
            </BenefitItem>
            <BenefitItem>
              <strong>Sukurta Lietuvai</strong> — supranta vietinę rinką ir kalbą.
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
