"use client";

import { AppShell } from "@/components/AppShell";
import {
  APK_DOWNLOAD_URL,
  APK_RELEASE_PAGE,
  isAndroid,
  isInstalledPwa,
  isNativeApp,
} from "@/lib/mobile-install";
import { Download, Smartphone, CheckCircle2, Shield } from "lucide-react";
import Link from "next/link";

export default function InstallPage() {
  const native = isNativeApp();
  const installedPwa = isInstalledPwa();
  const android = isAndroid();

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
            Tikra programėlė Android telefone — kaip iš Play Store, tik greičiau
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
          <div className="card-shadow rounded-2xl bg-white p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--vauto-blue)]" />
            <p className="mt-3 font-semibold text-[var(--vauto-text)]">
              Vauto jau pridėta į pradžios ekraną
            </p>
            <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
              Norite pilnos Android versijos su kamera ir GPS? Atsisiųskite APK
              žemiau.
            </p>
          </div>
        ) : null}

        {android && !native && (
          <a
            href={APK_DOWNLOAD_URL}
            download="vauto.apk"
            className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--vauto-blue)] py-4 text-base font-bold text-white shadow-lg transition active:scale-[0.98]"
          >
            <Download className="h-5 w-5" />
            Atsisiųsti Android APK
          </a>
        )}

        {!android && !native && (
          <div className="card-shadow mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            APK skirta <strong>Android</strong> telefonams. Atidarykite šį
            puslapį Android naršyklėje arba nuskaitykite QR kodą kompiuteryje.
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
                Paspauskite <strong>„Atsisiųsti Android APK“</strong> aukščiau
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/10 text-xs font-bold text-[var(--vauto-blue)]">
                2
              </span>
              <span>
                Atidarykite atsisiųstą <strong>vauto.apk</strong> failą
                (pranešimų juosta arba „Atsisiuntimai“)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/10 text-xs font-bold text-[var(--vauto-blue)]">
                3
              </span>
              <span>
                Jei sistema prašo — leiskite{" "}
                <strong>diegti iš nežinomų šaltinių</strong> šiai programėlei
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

        <div className="mt-4 card-shadow rounded-2xl bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--vauto-text)]">
            <Shield className="h-5 w-5 text-[var(--vauto-blue)]" />
            Alternatyva: pridėti į pradžios ekraną
          </h2>
          <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
            Chrome naršyklėje: meniu <strong>⋮</strong> →{" "}
            <strong>„Pridėti į pradžios ekraną“</strong> arba{" "}
            <strong>„Įdiegti programą“</strong>. Veikia be APK, bet su mažiau
            telefono funkcijų.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--vauto-text-muted)]">
          <a
            href={APK_RELEASE_PAGE}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Visos APK versijos GitHub
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
