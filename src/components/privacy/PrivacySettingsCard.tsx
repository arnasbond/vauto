"use client";

import { Bell, Shield } from "lucide-react";
import { useVauto } from "@/context/VautoContext";

function SettingsToggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        on ? "bg-[var(--vauto-primary)]" : "bg-[var(--vauto-border)]"
      } ${disabled ? "opacity-40" : ""}`}
      aria-label={label}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-[var(--vauto-card-bg)] shadow transition ${
          on ? "left-5" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function PrivacySettingsCard() {
  const { gdprConsent, requestMediaConsent, revokeGdprConsent } = useVauto();

  return (
    <div className="vauto-dashboard-card rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-[var(--vauto-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--vauto-text-main)]">
          Privatumas (BDAR)
        </h3>
      </div>
      <p className="text-xs text-[var(--vauto-text-muted)]">
        Balsas ir vaizdas naudojami tik skelbimo AI analizei. Sutikimą galite bet kada
        atšaukti.
      </p>
      <div className="vauto-settings-row mt-4 flex items-center justify-between rounded-xl px-3 py-2.5">
        <span className="text-xs text-[var(--vauto-text-main)]">
          Medijos analizės sutikimas
        </span>
        <SettingsToggle
          label={gdprConsent ? "Atšaukti sutikimą" : "Sutikti"}
          on={gdprConsent}
          onChange={(next) => {
            if (next) requestMediaConsent(() => undefined);
            else revokeGdprConsent();
          }}
        />
      </div>
      <p className="mt-2 text-[10px] text-[var(--vauto-text-muted)]">
        Būsena:{" "}
        {gdprConsent
          ? "Sutikta"
          : "Nesutikta — įjungus bus rodomas pilnas BDAR tekstas"}
      </p>
    </div>
  );
}

export function PushAlertsSettingsCard() {
  const { pushAlertsEnabled, setPushAlertsEnabled } = useVauto();

  return (
    <div className="vauto-dashboard-card mt-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-[var(--vauto-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--vauto-text-main)]">
          Paieškos pranešimai
        </h3>
      </div>
      <p className="text-xs text-[var(--vauto-text-muted)]">
        Pranešimai apie naujus skelbimus pagal jūsų paieškas ir interesus. Veikia
        nepriklausomai nuo budinčio režimo.
      </p>
      <div className="vauto-settings-row mt-4 flex items-center justify-between rounded-xl px-3 py-2.5">
        <span className="text-xs text-[var(--vauto-text-main)]">
          Naujų skelbimų pranešimai
        </span>
        <SettingsToggle
          label={pushAlertsEnabled ? "Išjungti pranešimus" : "Įjungti pranešimus"}
          on={pushAlertsEnabled}
          onChange={setPushAlertsEnabled}
        />
      </div>
    </div>
  );
}
