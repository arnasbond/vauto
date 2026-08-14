"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AiBadge,
  BrandButton,
  BrandLogo,
  CabinetStatRow,
  DetailCtaStack,
  HowItWorksSection,
  ListingCard,
  type HowItWorksStep,
  type ListingCardItem,
} from "@/components/ui";

type TabId = "home" | "listing" | "ai" | "cabinet";

const MOCK_LISTINGS: ListingCardItem[] = [
  {
    id: "1",
    title: "Citroën C4 generatorius 2.0 HDi",
    price: "85 €",
    city: "Kaunas",
    image:
      "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800&h=600&fit=crop",
    aiReady: true,
  },
  {
    id: "2",
    title: "2 kamb. butas Žvėryne, 54 m²",
    price: "149 000 €",
    city: "Vilnius",
    image:
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop",
  },
  {
    id: "3",
    title: "iPhone 14 Pro 256GB, garantija",
    price: "620 €",
    city: "Klaipėda",
    image:
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=600&fit=crop",
    aiReady: true,
  },
  {
    id: "4",
    title: "VW Golf VII 1.6 TDI, 2017",
    price: "8 900 €",
    city: "Šiauliai",
    image:
      "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&h=600&fit=crop",
  },
  {
    id: "5",
    title: "BMW 320d Touring, 2019",
    price: "16 400 €",
    city: "Vilnius",
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop",
    aiReady: true,
  },
  {
    id: "6",
    title: "MacBook Air M2 13\"",
    price: "890 €",
    city: "Vilnius",
    image:
      "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&h=600&fit=crop",
  },
  {
    id: "7",
    title: "Baldų pervežimas Lietuvoje",
    price: "nuo 40 €",
    city: "Visa LT",
    image:
      "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&h=600&fit=crop",
  },
  {
    id: "8",
    title: "Canon EOS R50 + objektyvas",
    price: "780 €",
    city: "Kaunas",
    image:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&h=600&fit=crop",
  },
];

const SEARCH_CHIPS = [
  "citroen c4 generatorius",
  "butas Vilniuje iki 150 000 €",
  "iPhone 14 Pro",
  "VW Golf dyzelis",
];

const HOW_STEPS: HowItWorksStep[] = [
  {
    n: "1",
    title: "Parašyk arba įkelk foto",
    text: "Vision AI + pokalbio asistentas — be formų ir kategorijų.",
  },
  {
    n: "2",
    title: "AI paruošia skelbimą ir kainą",
    text: "Antraštė, aprašymas ir AI kainos vertintojas — rinkos rėžis už tave.",
  },
  {
    n: "3",
    title: "Skelbk ir siųsk per Omniva",
    text: "Patvirtink — skelbimas gyvas; pirkėjui paštomatas vienu paspaudimu.",
  },
];

const DETAIL_GALLERY = [
  "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1200&h=900&fit=crop",
  "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=1200&h=900&fit=crop",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200&h=900&fit=crop",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=900&fit=crop",
];

const DETAIL_SPECS = [
  { label: "Metai", value: "2019" },
  { label: "Kuras", value: "Dyzelinas" },
  { label: "Rida", value: "142 000 km" },
  { label: "Galia", value: "140 kW (190 AG)" },
  { label: "Pavarų dėžė", value: "Automatinė" },
  { label: "Kėbulas", value: "Touring / Universalas" },
  { label: "Tech. apžiūra", value: "iki 2027-03" },
];

const CABINET_LISTINGS = [
  {
    id: "c1",
    title: "BMW 320d Touring",
    price: "16 400 €",
    status: "Aktyvus" as const,
    views: 428,
    image: DETAIL_GALLERY[0],
  },
  {
    id: "c2",
    title: "VW Golf VII 1.6 TDI",
    price: "8 900 €",
    status: "Moderuojama" as const,
    views: 91,
    image: DETAIL_GALLERY[1],
  },
  {
    id: "c3",
    title: "Citroën C4 generatorius",
    price: "85 €",
    status: "Juodraštis" as const,
    views: 0,
    image: MOCK_LISTINGS[0].image,
  },
  {
    id: "c4",
    title: "iPhone 14 Pro 256GB",
    price: "620 €",
    status: "Aktyvus" as const,
    views: 203,
    image: MOCK_LISTINGS[2].image,
  },
];

const CABINET_STATS = [
  { label: "Aktyvūs skelbimai", value: "10" },
  { label: "Žinutės", value: "236" },
  { label: "Balansas", value: "3 730 €" },
];

const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Titulinis" },
  { id: "listing", label: "Skelbimo langas" },
  { id: "ai", label: "AI Įkėlimas & Prepublish" },
  { id: "cabinet", label: "Verslo Kabinetas / Profilis" },
];

function SiteHeader({ compact }: { compact?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--vauto-border-subtle)] bg-white/95 backdrop-blur-md">
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 ${
          compact ? "h-14" : "h-16"
        }`}
      >
        <BrandLogo />
        <nav className="hidden items-center gap-6 text-sm font-medium text-[var(--vauto-body)] md:flex">
          <span>Paieška</span>
          <span>Kaip veikia</span>
          <span>Skelbimai</span>
        </nav>
        <BrandButton className="gap-1.5 shadow-sm">
          <span aria-hidden>+</span>
          Įdėti skelbimą
        </BrandButton>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[var(--vauto-border-subtle)] bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <BrandLogo />
          <p className="mt-3 text-sm leading-relaxed text-[var(--vauto-muted)]">
            AI skelbimų rinka Lietuvoje — greičiau parduoti ir rasti be biurokratijos.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--vauto-ink)]">
            Produktas
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--vauto-muted)]">
            <li>Paieška</li>
            <li>Įdėti skelbimą</li>
            <li>VAUTO Agent</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--vauto-ink)]">
            Pagalba
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--vauto-muted)]">
            <li>DUK</li>
            <li>Saugumas</li>
            <li>Kontaktai</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--vauto-ink)]">
            Teisinė
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--vauto-muted)]">
            <li>Taisyklės</li>
            <li>Privatumas</li>
            <li>Slapukai</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--vauto-border-subtle)] py-4 text-center text-xs text-[var(--vauto-subtle)]">
        © {new Date().getFullYear()} VAUTO · preview-design (neprodukcija)
      </div>
    </footer>
  );
}

function HomeTab() {
  return (
    <>
      <SiteHeader />
      <section className="relative overflow-hidden border-b border-[var(--vauto-border-subtle)] bg-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            background:
              "radial-gradient(900px 420px at 50% -10%, var(--vauto-primary-soft), transparent 60%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl px-4 pb-14 pt-12 text-center sm:px-6 sm:pb-16 sm:pt-16">
          <h1 className="font-[family-name:var(--font-outfit)] text-[1.85rem] font-extrabold leading-[1.15] tracking-tight text-[var(--vauto-ink)] sm:text-4xl md:text-[2.75rem]">
            Parduok ar rask viską — su Vision AI ir pokalbiu
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[var(--vauto-muted)] sm:text-lg">
            AI asistentas paruošia skelbimo juodraštį. Kainos rėžis — rekomendacija,
            ne garantuota rinkos kaina. Omniva — siuntos eiga sandorio kambaryje.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <input
              type="search"
              readOnly
              placeholder="Pvz. citroen c4 generatorius…"
              className="w-full flex-1 rounded-2xl border border-[var(--vauto-border-input)] bg-white px-4 py-3.5 text-[15px] text-[var(--vauto-ink)] outline-none placeholder:text-[var(--vauto-subtle)]"
            />
            <BrandButton className="shrink-0 rounded-2xl px-6 py-3.5">Ieškoti</BrandButton>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SEARCH_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className="rounded-full border border-[var(--vauto-border-input)] bg-[var(--vauto-surface-page)] px-3.5 py-1.5 text-xs font-medium text-[var(--vauto-body)]"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </section>

      <HowItWorksSection steps={HOW_STEPS} />

      <section className="border-t border-[var(--vauto-border-subtle)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-tight text-[var(--vauto-ink)]">
            Nauji skelbimai
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {MOCK_LISTINGS.map((item) => (
              <ListingCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}

function ListingDetailTab() {
  const [activeImage, setActiveImage] = useState(0);
  const similar = useMemo(() => MOCK_LISTINGS.slice(0, 4), []);

  return (
    <>
      <SiteHeader compact />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <p className="mb-4 text-xs font-medium text-[var(--vauto-subtle)]">
          Pradžia / Automobiliai / BMW 320d Touring
        </p>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.75fr)] lg:items-start">
          <div className="space-y-8">
            <div>
              <div className="overflow-hidden rounded-2xl border border-[var(--vauto-border-subtle)] bg-[var(--vauto-surface-tint)]">
                <div className="aspect-[4/3]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={DETAIL_GALLERY[activeImage]}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {DETAIL_GALLERY.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${
                      i === activeImage
                        ? "border-[var(--vauto-primary)]"
                        : "border-transparent"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <section className="rounded-2xl border border-[var(--vauto-border-subtle)] bg-white p-5 sm:p-6">
              <h1 className="font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-tight text-[var(--vauto-ink)]">
                BMW 320d Touring, 2019
              </h1>
              <p className="mt-1 text-sm text-[var(--vauto-muted)]">
                Vilnius · Paskelbta prieš 2 d.
              </p>

              <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-[var(--vauto-subtle)]">
                Parametrai
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {DETAIL_SPECS.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-[var(--vauto-border-subtle)] bg-[var(--vauto-surface-page)] px-3 py-2.5"
                  >
                    <p className="text-[11px] text-[var(--vauto-subtle)]">{s.label}</p>
                    <p className="mt-0.5 text-sm font-semibold text-[var(--vauto-ink)]">
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-[var(--vauto-subtle)]">
                Aprašymas
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--vauto-body)]">
                Prižiūrėtas BMW 320d Touring su automatine pavarų dėže. Pilna serviso
                istorija, naujos žieminės padangos, techninė apžiūra galioja iki 2027 m.
                kovo. Be rūgčių, be avarijų. Galimas testinis važiavimas Vilniuje.
              </p>
              <button
                type="button"
                className="mt-5 text-xs font-medium text-[var(--vauto-subtle)] underline-offset-2 hover:text-red-600 hover:underline"
              >
                Pranešti apie netinkamą skelbimą
              </button>
            </section>
          </div>

          <aside className="lg:sticky lg:top-20">
            <div className="rounded-2xl border border-[var(--vauto-border-subtle)] bg-white p-5 shadow-[0_8px_30px_rgba(11,18,32,0.06)]">
              <p className="text-3xl font-extrabold tracking-tight text-[var(--vauto-ink)]">
                2 300 €
              </p>
              <p className="mt-1 text-xs text-[var(--vauto-subtle)]">
                Fiksuota kaina · derėtis galima
              </p>

              <div className="mt-5 flex items-center gap-3 rounded-xl border border-[var(--vauto-border-subtle)] bg-[var(--vauto-surface-page)] p-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--vauto-primary)] text-sm font-bold text-white">
                  AK
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--vauto-ink)]">
                    Andrius K.
                  </p>
                  <p className="text-xs text-[var(--vauto-muted)]">
                    4.8 ★ · 36 atsiliepimai · Vilnius
                  </p>
                </div>
              </div>

              <DetailCtaStack className="mt-4" />
            </div>
          </aside>
        </div>

        <section className="mt-12 border-t border-[var(--vauto-border-subtle)] pt-10">
          <h2 className="font-[family-name:var(--font-outfit)] text-xl font-bold text-[var(--vauto-ink)]">
            Panašūs skelbimai
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {similar.map((item) => (
              <ListingCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}

function AiPrepublishTab() {
  return (
    <>
      <SiteHeader compact />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2 sm:gap-0">
          {[
            { n: 1, label: "Nuotraukos" },
            { n: 2, label: "AI Juodraštis" },
            { n: 3, label: "Peržiūra" },
          ].map((step, i) => (
            <div key={step.n} className="flex items-center">
              <div className="flex items-center gap-2 rounded-full border border-[var(--vauto-border-subtle)] bg-white px-3 py-1.5">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.n === 2
                      ? "bg-[var(--vauto-primary)] text-white"
                      : "bg-[var(--vauto-surface-tint)] text-[var(--vauto-muted)]"
                  }`}
                >
                  {step.n}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    step.n === 2 ? "text-[var(--vauto-ink)]" : "text-[var(--vauto-subtle)]"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < 2 ? (
                <div
                  className="mx-2 hidden h-px w-8 bg-[var(--vauto-border-input)] sm:block"
                  aria-hidden
                />
              ) : null}
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.7fr)]">
          <div className="rounded-2xl border border-[var(--vauto-border-subtle)] bg-white p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <AiBadge>AI paruošė juodraštį</AiBadge>
              <span className="text-xs text-[var(--vauto-subtle)]">
                Patikrinkite prieš skelbdami
              </span>
            </div>

            <div className="mb-5 overflow-hidden rounded-xl border border-[var(--vauto-border-subtle)]">
              <div className="aspect-[4/3] bg-[var(--vauto-surface-tint)] sm:aspect-[16/9]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={DETAIL_GALLERY[0]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-[var(--vauto-muted)]">
                  Pavadinimas
                </span>
                <input
                  defaultValue="BMW 320d Touring, 2019, automatinė"
                  className="w-full rounded-xl border border-[var(--vauto-border-input)] px-3.5 py-2.5 text-sm text-[var(--vauto-ink)] outline-none focus:border-[var(--vauto-primary)]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[var(--vauto-muted)]">
                  Kaina
                </span>
                <input
                  defaultValue="16 400"
                  className="w-full rounded-xl border border-[var(--vauto-border-input)] px-3.5 py-2.5 text-sm text-[var(--vauto-ink)] outline-none focus:border-[var(--vauto-primary)]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[var(--vauto-muted)]">
                  Kategorija
                </span>
                <input
                  defaultValue="Automobiliai"
                  className="w-full rounded-xl border border-[var(--vauto-border-input)] px-3.5 py-2.5 text-sm text-[var(--vauto-ink)] outline-none focus:border-[var(--vauto-primary)]"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-[var(--vauto-muted)]">
                  Miestas
                </span>
                <input
                  defaultValue="Vilnius"
                  className="w-full rounded-xl border border-[var(--vauto-border-input)] px-3.5 py-2.5 text-sm text-[var(--vauto-ink)] outline-none focus:border-[var(--vauto-primary)]"
                />
              </label>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold text-[var(--vauto-muted)]">
                Atpažinti parametrai
              </p>
              <div className="flex flex-wrap gap-2">
                {["Metai: 2019", "Kuras: Dyzelinas", "Rida: 142 000 km", "Galia: 140 kW"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[var(--vauto-border-input)] bg-[var(--vauto-surface-page)] px-3 py-1 text-xs font-medium text-[var(--vauto-ink)]"
                    >
                      {tag}
                    </span>
                  )
                )}
              </div>
            </div>

            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--vauto-muted)]">
                Aprašymas
              </span>
              <textarea
                rows={5}
                defaultValue="Prižiūrėtas BMW 320d Touring su automatine pavarų dėže. Pilna serviso istorija, naujos žieminės padangos. Galimas testinis važiavimas Vilniuje."
                className="w-full rounded-xl border border-[var(--vauto-border-input)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--vauto-ink)] outline-none focus:border-[var(--vauto-primary)]"
              />
            </label>

            <div className="mt-6 flex flex-wrap gap-3">
              <BrandButton className="rounded-xl px-5 py-3">Peržiūrėti / Skelbti</BrandButton>
              <BrandButton variant="secondary" className="rounded-xl px-5 py-3">
                Grįžti
              </BrandButton>
            </div>
          </div>

          <aside className="h-fit rounded-2xl border border-[var(--vauto-border-subtle)] bg-white p-5 lg:sticky lg:top-20">
            <h3 className="text-sm font-bold text-[var(--vauto-ink)]">Ką AI padaro už tave</h3>
            <ul className="mt-4 space-y-3 text-sm text-[var(--vauto-muted)]">
              <li className="flex gap-2">
                <span className="text-[var(--vauto-ai)]">●</span>
                Nuskaito nuotraukas ir atpažįsta modelį
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--vauto-ai)]">●</span>
                Surenka parametrus į struktūruotas žymas
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--vauto-ai)]">●</span>
                Parašo pavadinimą ir aprašymą lietuviškai
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--vauto-ai)]">●</span>
                Siūlo kainos rėžį (rekomendacija, ne garantija)
              </li>
            </ul>
            <p className="mt-5 rounded-xl bg-[var(--vauto-ai-soft)] px-3 py-2.5 text-xs leading-relaxed text-[#8A4B12]">
              Oranžinė spalva naudojama tik AI žymoms — kainos ir tekstas lieka tamsūs.
            </p>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

function statusStyles(status: (typeof CABINET_LISTINGS)[number]["status"]) {
  if (status === "Aktyvus") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "Moderuojama") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function CabinetTab() {
  return (
    <>
      <SiteHeader compact />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-outfit)] text-2xl font-bold text-[var(--vauto-ink)]">
              Verslo kabinetas
            </h1>
            <p className="mt-1 text-sm text-[var(--vauto-muted)]">
              AutoCentras UAB · PRO planas
            </p>
          </div>
          <BrandButton>Papildyti balansą</BrandButton>
        </div>

        <CabinetStatRow stats={CABINET_STATS} className="mt-6" />

        <section className="mt-8 rounded-2xl border border-[var(--vauto-border-subtle)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vauto-border-subtle)] px-5 py-4">
            <h2 className="text-sm font-bold text-[var(--vauto-ink)]">Skelbimų valdymas</h2>
            <span className="text-xs text-[var(--vauto-subtle)]">
              {CABINET_LISTINGS.length} įrašai
            </span>
          </div>
          <div className="divide-y divide-[var(--vauto-border-subtle)]">
            {CABINET_LISTINGS.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-[var(--vauto-surface-tint)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={row.image} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--vauto-ink)]">
                      {row.title}
                    </p>
                    <p className="text-xs text-[var(--vauto-subtle)]">
                      {row.price} · {row.views} peržiūros
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusStyles(row.status)}`}
                >
                  {row.status}
                </span>
                <div className="flex flex-wrap gap-2">
                  <BrandButton variant="ghost" className="rounded-lg px-3 py-1.5 text-xs">
                    Redaguoti
                  </BrandButton>
                  <BrandButton variant="ghost" className="rounded-lg px-3 py-1.5 text-xs">
                    Sustabdyti
                  </BrandButton>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                  >
                    Ištrinti
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--vauto-border-subtle)] bg-white p-5">
            <h3 className="text-sm font-bold text-[var(--vauto-ink)]">Profilio nustatymai</h3>
            <ul className="mt-4 space-y-3 text-sm text-[var(--vauto-muted)]">
              <li className="flex justify-between border-b border-[var(--vauto-border-subtle)] pb-2">
                <span>Įmonės pavadinimas</span>
                <span className="font-medium text-[var(--vauto-ink)]">AutoCentras UAB</span>
              </li>
              <li className="flex justify-between border-b border-[var(--vauto-border-subtle)] pb-2">
                <span>El. paštas</span>
                <span className="font-medium text-[var(--vauto-ink)]">info@autocentras.lt</span>
              </li>
              <li className="flex justify-between border-b border-[var(--vauto-border-subtle)] pb-2">
                <span>Miestas</span>
                <span className="font-medium text-[var(--vauto-ink)]">Vilnius</span>
              </li>
              <li className="flex justify-between">
                <span>Planas</span>
                <span className="font-medium text-[var(--vauto-primary)]">PRO</span>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-[var(--vauto-border-subtle)] bg-white p-5">
            <h3 className="text-sm font-bold text-[var(--vauto-ink)]">Piniginė</h3>
            <p className="mt-3 text-3xl font-extrabold text-[var(--vauto-ink)]">3 730 €</p>
            <p className="mt-1 text-xs text-[var(--vauto-subtle)]">
              Galima naudoti iškėlimams ir PRO funkcijoms
            </p>
            <BrandButton className="mt-5 w-full py-3">Papildyti balansą</BrandButton>
          </div>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}

export default function PreviewShowcasePage() {
  const [tab, setTab] = useState<TabId>("home");

  return (
    <div className="preview-design-root min-h-dvh bg-[var(--vauto-surface-page)] text-[var(--vauto-ink)] antialiased">
      <style>{`
        body:has(.preview-design-root) nav[data-bottom-nav],
        body:has(.preview-design-root) [data-vauto-bottom-nav],
        body:has(.preview-design-root) .vauto-bottom-nav,
        body:has(.preview-design-root) header[data-vauto-chrome],
        body:has(.preview-design-root) [data-desktop-header] {
          display: none !important;
        }
        body:has(.preview-design-root) main,
        body:has(.preview-design-root) [data-vauto-shell] {
          padding-bottom: 0 !important;
        }
      `}</style>

      <div className="sticky top-0 z-50 border-b border-[var(--vauto-border-input)] bg-[var(--vauto-ink)] text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
              Design Kit · reference only · Phases 0–5 shipped to production skins
            </p>
            <Link
              href="/"
              className="text-xs font-medium text-white/60 underline-offset-2 hover:text-white hover:underline"
            >
              ← Grįžti į produkciją
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-xl px-3.5 py-2 text-left text-xs font-semibold transition sm:text-sm ${
                    active
                      ? "bg-white text-[var(--vauto-ink)]"
                      : "bg-white/10 text-white/85 hover:bg-white/15"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {tab === "home" ? <HomeTab /> : null}
      {tab === "listing" ? <ListingDetailTab /> : null}
      {tab === "ai" ? <AiPrepublishTab /> : null}
      {tab === "cabinet" ? <CabinetTab /> : null}
    </div>
  );
}
