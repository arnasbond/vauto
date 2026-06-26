"use client";

import { AppShell } from "@/components/AppShell";
import { InstallDownloadButtons } from "@/components/InstallDownloadButtons";
import {
  APK_RELEASE_PAGE,
  IOS_RELEASE_PAGE,
  isAndroid,
  isIOS,
  isInstalledPwa,
  isNativeApp,
} from "@/lib/mobile-install";
import { CheckCircle2, Shield, Smartphone } from "lucide-react";
import Link from "next/link";

export default function InstallPage() {
  const native = isNativeApp();
  const installedPwa = isInstalledPwa();
  const android = isAndroid();
  const ios = isIOS();

  return (
    <AppShell variant="plain">
      <div className="mx-auto max-w-md py-4">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--vauto-blue)] text-3xl font-bold text-white shadow-lg">
            V
          </div>
          <h1 className="text-2xl font-bold text-[var(--vauto-text)]">
            Įdiekite Vauto
          </h1>
          <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
            Tikra programėlė telefone — Android APK arba iPhone IPA, kaip iš
            parduotuvės, tik greičiau
          </p>
        </div>

        {native ? (
          <div className="card-shadow rounded-2xl bg-green-50 p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <p className="mt-3 font-semibold text-green-800">
              Vauto jau įdiegta šiame įrenginyje
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-xl bg-[var(--vauto-blue)] px-6 py-3 text-sm font-medium text-white"
            >
              Atidaryti programėlę
            </Link>
          </div>
        ) : installedPwa ? (
          <div className="card-shadow mb-6 rounded-2xl bg-white p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--vauto-blue)]" />
            <p className="mt-3 font-semibold text-[var(--vauto-text)]">
              Vauto jau pridėta į pradžios ekraną
            </p>
            <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
              Norite pilnos versijos su kamera, GPS ir push? Atsisiųskite
              programėlę žemiau.
            </p>
          </div>
        ) : null}

        {!native && <InstallDownloadButtons className="mb-6" />}

        {!android && !ios && !native && (
          <div className="card-shadow mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            Atidarykite šį puslapį <strong>Android</strong> arba{" "}
            <strong>iPhone</strong> naršyklėje, kad matytumėte tinkamą
            atsisiuntimo mygtuką.
          </div>
        )}

        <div className="card-shadow space-y-4 rounded-2xl bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--vauto-text)]">
            <Smartphone className="h-5 w-5 text-[var(--vauto-blue)]" />
            Kaip įdiegti (Android)
          </h2>
          <ol className="space-y-3 text-sm text-[var(--vauto-text-muted)]">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/10 text-xs font-bold text-[var(--vauto-blue)]">
                1
              </span>
              <span>
                Paspauskite <strong>„Atsisiųsti Android APK“</strong>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/10 text-xs font-bold text-[var(--vauto-blue)]">
                2
              </span>
              <span>
                Atidarykite atsisiųstą <strong>vauto.apk</strong> failą
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/10 text-xs font-bold text-[var(--vauto-blue)]">
                3
              </span>
              <span>
                Leiskite <strong>diegti iš nežinomų šaltinių</strong>, jei
                prašo
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/10 text-xs font-bold text-[var(--vauto-blue)]">
                4
              </span>
              <span>
                Paspauskite <strong>Įdiegti</strong> — Vauto atsiras tarp
                programėlių
              </span>
            </li>
          </ol>
        </div>

        <div className="mt-4 card-shadow space-y-4 rounded-2xl bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--vauto-text)]">
            <Smartphone className="h-5 w-5 text-[var(--vauto-blue)]" />
            Kaip įdiegti (iPhone)
          </h2>
          <ol className="space-y-3 text-sm text-[var(--vauto-text-muted)]">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/10 text-xs font-bold text-[var(--vauto-blue)]">
                1
              </span>
              <span>
                Paspauskite <strong>„Atsisiųsti iOS programėlę (iPhone)“</strong>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/10 text-xs font-bold text-[var(--vauto-blue)]">
                2
              </span>
              <span>
                Atsisiųskite <strong>vauto.ipa</strong> iš GitHub Releases
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/10 text-xs font-bold text-[var(--vauto-blue)]">
                3
              </span>
              <span>
                Įdiekite per <strong>Xcode</strong>, <strong>TestFlight</strong>{" "}
                arba patikimą sideload įrankį
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/10 text-xs font-bold text-[var(--vauto-blue)]">
                4
              </span>
              <span>
                Paleiskite <strong>Vauto</strong> iš pradžios ekrano
              </span>
            </li>
          </ol>
        </div>

        <div className="mt-4 card-shadow rounded-2xl bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--vauto-text)]">
            <Shield className="h-5 w-5 text-[var(--vauto-blue)]" />
            Alternatyva: pridėti į pradžios ekraną
          </h2>
          <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
            Naršyklėje: meniu → <strong>„Pridėti į pradžios ekraną“</strong>{" "}
            (Safari iPhone) arba <strong>„Įdiegti programą“</strong> (Chrome
            Android). Veikia be APK/IPA, bet su mažiau telefono funkcijų.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--vauto-text-muted)]">
          <a
            href={APK_RELEASE_PAGE}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Android APK GitHub
          </a>
          {" · "}
          <a
            href={IOS_RELEASE_PAGE}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            iOS IPA GitHub
          </a>
          {" · "}
          <Link href="/" className="underline">
            Grįžti į Vauto
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
