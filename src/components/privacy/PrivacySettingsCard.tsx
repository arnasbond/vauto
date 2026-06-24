"use client";

import { Bell, Shield } from "lucide-react";
import { useVauto } from "@/context/VautoContext";

export function PrivacySettingsCard() {
  const { gdprConsent, requestMediaConsent, revokeGdprConsent } = useVauto();

  return (
    <div className="vauto-dashboard-card rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h3 className="text-sm font-semibold text-slate-900">Privatumas (BDAR)</h3>
      </div>
      <p className="text-xs text-slate-400">
        Balsas ir vaizdas naudojami tik skelbimo AI analizei. Sutikimą galite
        bet kada atšaukti.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-3 py-2.5">
        <span className="text-xs text-slate-600">Medijos analizės sutikimas</span>
        <button
          type="button"
          onClick={() => {
            if (gdprConsent) revokeGdprConsent();
            else requestMediaConsent(() => undefined);
          }}
          className={`relative h-7 w-12 rounded-full transition ${
            gdprConsent ? "bg-[var(--vauto-teal)]" : "bg-slate-300"
          }`}
          aria-label={gdprConsent ? "Atšaukti sutikimą" : "Sutikti"}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
              gdprConsent ? "left-5" : "left-0.5"
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Būsena: {gdprConsent ? "Sutikta" : "Nesutikta — įjungus bus rodomas pilnas BDAR tekstas"}
      </p>
    </div>
  );
}

export function PushAlertsSettingsCard() {
  const { pushAlertsEnabled, setPushAlertsEnabled } = useVauto();

  return (
    <div className="vauto-dashboard-card mt-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h3 className="text-sm font-semibold text-slate-900">Paieškos pranešimai</h3>
      </div>
      <p className="text-xs text-slate-400">
        Pranešimai apie naujus skelbimus pagal jūsų paieškas ir interesus. Veikia
        nepriklausomai nuo budinčio režimo.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-3 py-2.5">
        <span className="text-xs text-slate-600">Naujų skelbimų pranešimai</span>
        <button
          type="button"
          onClick={() => setPushAlertsEnabled(!pushAlertsEnabled)}
          className={`relative h-7 w-12 rounded-full transition ${
            pushAlertsEnabled ? "bg-[var(--vauto-teal)]" : "bg-slate-300"
          }`}
          aria-label={pushAlertsEnabled ? "Išjungti pranešimus" : "Įjungti pranešimus"}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
              pushAlertsEnabled ? "left-5" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
