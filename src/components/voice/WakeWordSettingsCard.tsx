"use client";

import { Mic, MicOff, Radio } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import {
  isSpeechRecognitionSupported,
  isWakeWordBackgroundSupported,
} from "@/lib/wake-word-engine";
import { isMobileDevice, isNativeApp } from "@/lib/mobile-install";

export function WakeWordSettingsCard() {
  const {
    wakeWordEnabled,
    wakeWordPhase,
    gdprConsent,
    requestWakeWordConsent,
    disableWakeWordInstantly,
  } = useVauto();

  const supported = isWakeWordBackgroundSupported();
  const onPhone = isMobileDevice() || isNativeApp();

  const handleToggle = () => {
    if (wakeWordEnabled) {
      disableWakeWordInstantly();
      return;
    }
    requestWakeWordConsent();
  };

  return (
    <div className="vauto-dashboard-card rounded-2xl border border-[var(--vauto-orange)]/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Radio className="h-4 w-4 text-[var(--vauto-orange)]" />
        <h3 className="text-sm font-semibold text-slate-900">Balsinis asistentas</h3>
      </div>

      <p className="text-xs leading-relaxed text-slate-400">
        Budintis režimas — pasakykite &ldquo;Vauto&rdquo; kompiuterio naršyklėje.
        Telefone naudokite balso mygtuką paieškoje arba push pranešimus.
      </p>

      {onPhone && (
        <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Telefone nuolatinis mikrofonas fone nestabilus (mirksi indikatorius, lagina).
          Budintis režimas čia išjungtas — balso paieškai spauskite mikrofono ikoną pagrindiniame
          ekrane.
        </p>
      )}

      {!onPhone && !isSpeechRecognitionSupported() && (
        <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Ši naršyklė nepalaiko balso atpažinimo fone. Naudokite Chrome arba Edge kompiuteryje.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          {wakeWordEnabled ? (
            <Mic className="h-4 w-4 text-[var(--vauto-orange)]" />
          ) : (
            <MicOff className="h-4 w-4 text-slate-500" />
          )}
          <span className="text-xs text-slate-600">
            Budintis režimas (tik desktop)
          </span>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={!supported}
          className={`relative h-8 w-14 rounded-full transition ${
            wakeWordEnabled ? "bg-[var(--vauto-orange)]" : "bg-slate-600"
          } disabled:opacity-40`}
          aria-label={
            wakeWordEnabled
              ? "Išjungti budintį režimą"
              : "Įjungti budintį režimą"
          }
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
              wakeWordEnabled ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>

      {wakeWordEnabled && (
        <button
          type="button"
          onClick={disableWakeWordInstantly}
          className="mt-3 w-full rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-xs font-semibold text-red-300"
        >
          Nedelsiant išjungti mikrofoną
        </button>
      )}

      <p className="mt-2 text-[10px] text-slate-500">
        Būsena:{" "}
        {wakeWordEnabled
          ? wakeWordPhase === "passive"
            ? 'Klausoma — pasakykite "Vauto"'
            : wakeWordPhase === "suspended"
              ? "Pristabdyta (programėlė fone — mikrofonas išjungtas)"
            : wakeWordPhase === "active"
              ? "Aktyvus klausymas"
              : wakeWordPhase === "processing"
                ? "Apdorojama…"
                : "Įjungta"
          : gdprConsent
            ? "Išjungta"
            : "Reikia BDAR sutikimo"}
      </p>
    </div>
  );
}
