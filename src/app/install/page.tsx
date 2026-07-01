"use client";

import { AppShell } from "@/components/AppShell";
import { InstallDownloadButtons } from "@/components/InstallDownloadButtons";
import {
  APK_RELEASE_PAGE,
  isAndroid,
  isIOS,
  isInstalledPwa,
  isNativeApp,
} from "@/lib/mobile-install";
import { SITE_URL } from "@/lib/social-share";
import { Apple, CheckCircle2, Download, Share2, Smartphone } from "lucide-react";
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
            Įdiekite VAUTO
          </h1>
          <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
            Android — APK failas. iPhone — pridėkite į pradžios ekraną per Safari.
          </p>
        </div>

        {native ? (
          <div className="card-shadow mb-6 rounded-2xl bg-green-50 p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <p className="mt-3 font-semibold text-green-800">
              VAUTO jau įdiegta šiame įrenginyje
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
              VAUTO jau pridėta į pradžios ekraną
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-xl bg-[var(--vauto-blue)] px-6 py-3 text-sm font-medium text-white"
            >
              Atidaryti VAUTO
            </Link>
          </div>
        ) : null}

        {!native && !installedPwa && (
          <>
            {ios && (
              <div className="card-shadow mb-4 rounded-2xl border-2 border-[var(--vauto-blue)]/30 bg-[var(--vauto-blue)]/5 p-5">
                <h2 className="flex items-center gap-2 font-bold text-[var(--vauto-text)]">
                  <Apple className="h-5 w-5 text-[var(--vauto-blue)]" />
                  Jūsų iPhone — pradėkite čia
                </h2>
                <ol className="mt-4 space-y-3 text-sm text-[var(--vauto-text-muted)]">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)] text-xs font-bold text-white">
                      1
                    </span>
                    <span>
                      Įsitikinkite, kad naršote per <strong>Safari</strong> (ne
                      Chrome)
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)] text-xs font-bold text-white">
                      2
                    </span>
                    <span>
                      Paspauskite <Share2 className="inline h-4 w-4" />{" "}
                      <strong>Dalintis</strong> (apačioje ekrane)
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)] text-xs font-bold text-white">
                      3
                    </span>
                    <span>
                      Pasirinkite <strong>Pridėti į pradžios ekraną</strong>
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)] text-xs font-bold text-white">
                      4
                    </span>
                    <span>
                      Paspauskite <strong>Pridėti</strong> — VAUTO atsiras kaip
                      programėlė
                    </span>
                  </li>
                </ol>
              </div>
            )}

            {android && (
              <div className="card-shadow mb-4 rounded-2xl border-2 border-[var(--vauto-blue)]/30 bg-[var(--vauto-blue)]/5 p-5">
                <h2 className="flex items-center gap-2 font-bold text-[var(--vauto-text)]">
                  <Smartphone className="h-5 w-5 text-[var(--vauto-blue)]" />
                  Jūsų Android — atsisiųskite APK
                </h2>
                <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
                  Paspauskite mygtuką žemiau ir įdiekite kaip įprastą programėlę.
                </p>
              </div>
            )}

            <InstallDownloadButtons className="mb-6" />
          </>
        )}

        {!android && !ios && !native && (
          <div className="card-shadow mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            Atidarykite šį puslapį <strong>telefono</strong> naršyklėje — parodysime
            tinkamas instrukcijas Android arba iPhone.
          </div>
        )}

        <div className="card-shadow space-y-4 rounded-2xl bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--vauto-text)]">
            <Download className="h-5 w-5 text-[var(--vauto-blue)]" />
            Android (APK) — 4 žingsniai
          </h2>
          <ol className="space-y-3 text-sm text-[var(--vauto-text-muted)]">
            <li>1. Paspauskite <strong>Atsisiųsti APK</strong></li>
            <li>2. Atidarykite <strong>vauto.apk</strong> failą</li>
            <li>3. Leiskite diegti iš nežinomų šaltinių, jei prašo</li>
            <li>4. Paspauskite <strong>Įdiegti</strong></li>
          </ol>
        </div>

        <div className="mt-4 card-shadow space-y-4 rounded-2xl bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--vauto-text)]">
            <Apple className="h-5 w-5 text-[var(--vauto-blue)]" />
            iPhone (Safari) — 4 žingsniai
          </h2>
          <ol className="space-y-3 text-sm text-[var(--vauto-text-muted)]">
            <li>1. Atidarykite <a href={SITE_URL} className="text-[var(--vauto-blue)] underline">{SITE_URL.replace("https://", "")}</a> per <strong>Safari</strong></li>
            <li>2. Paspauskite <strong>Dalintis</strong> (□↑) apačioje</li>
            <li>3. <strong>Pridėti į pradžios ekraną</strong></li>
            <li>4. <strong>Pridėti</strong> — VAUTO ikona atsiras pradžios ekrane</li>
          </ol>
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
          <Link href="/" className="underline">
            Grįžti į VAUTO
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
