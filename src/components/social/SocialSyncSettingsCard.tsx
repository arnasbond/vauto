"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import {
  DEFAULT_SOCIAL_SYNC_PREFS,
  getSocialSyncPrefs,
  setSocialSyncPrefs,
  toggleNetwork,
  type SocialSyncPrefs,
} from "@/lib/social-sync";
import { SOCIAL_PLATFORMS } from "@/lib/social-share";

export function SocialSyncSettingsCard() {
  const [prefs, setPrefs] = useState<SocialSyncPrefs>(DEFAULT_SOCIAL_SYNC_PREFS);

  useEffect(() => {
    setPrefs(getSocialSyncPrefs());
  }, []);

  const persist = (next: SocialSyncPrefs) => {
    setPrefs(next);
    setSocialSyncPrefs(next);
  };

  return (
    <div className="vauto-dashboard-card rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h3 className="text-sm font-semibold text-white">Socialinių tinklų sinchronizacija</h3>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        Papildoma reklama jūsų prekei ar paslaugai — dalinkitės Vauto skelbimu ten, kur jau
        esate įpratę reklamuotis. Tai kelia ir pačios platformos žinomumą.
      </p>

      <div className="mt-4 space-y-3">
        <ToggleRow
          label="Įjungta sinchronizacija"
          hint="Rodyti dalinimosi galimybes po skelbimo ir profilyje"
          on={prefs.enabled}
          onChange={(on) => persist({ ...prefs, enabled: on })}
        />
        <ToggleRow
          label="Automatiškai siūlyti dalintis po publikavimo"
          hint="Atidarys dalijimosi langą arba sisteminį Share (jei įjungta)"
          on={prefs.autoShareOnPublish}
          onChange={(on) => persist({ ...prefs, autoShareOnPublish: on })}
          disabled={!prefs.enabled}
        />
      </div>

      {prefs.enabled && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Tinklai papildomai reklamai
          </p>
          <div className="space-y-2">
            {SOCIAL_PLATFORMS.map((platform) => (
              <div
                key={platform.id}
                className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5"
              >
                <div>
                  <span className="text-xs text-slate-300">{platform.label}</span>
                  {platform.hint && (
                    <p className="mt-0.5 text-[10px] text-slate-500">{platform.hint}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!prefs.enabled}
                  onClick={() => persist(toggleNetwork(prefs, platform.id))}
                  className={`relative h-7 w-12 rounded-full transition ${
                    prefs.networks[platform.id] ? "bg-[var(--vauto-teal)]" : "bg-slate-600"
                  } ${!prefs.enabled ? "opacity-40" : ""}`}
                  aria-label={`${platform.label} ${prefs.networks[platform.id] ? "įjungta" : "išjungta"}`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                      prefs.networks[platform.id] ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-slate-500">
        Fiksuotos kainos — dalijimasis nemokamas. Tinklų API prijungimas (automatinis postas)
        bus pridėtas vėliau; dabar naudojame saugius dalijimosi langus ir nuorodų kopijavimą.
      </p>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <div>
        <span className="text-xs text-slate-300">{label}</span>
        {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative h-7 w-12 rounded-full transition ${
          on ? "bg-[var(--vauto-teal)]" : "bg-slate-600"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
            on ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
