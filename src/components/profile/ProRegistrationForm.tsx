"use client";

import { FormEvent, useState } from "react";
import type { ProBusinessType } from "@/lib/types";
import { PRO_DEMO_PHONE } from "@/lib/reports";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";

const INPUT_CLASS =
  "profile-editable-input w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-[var(--vauto-border)] focus:ring-2 focus:ring-[var(--vauto-accent)]";

export function ProRegistrationForm() {
  const { upgradeToPro, authLoading, authError, clearAuthError } = useAuth();
  const { showToast } = useVauto();

  const [businessType, setBusinessType] = useState<ProBusinessType>("general");
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [vatCode, setVatCode] = useState("");
  const [serviceBaseCity, setServiceBaseCity] = useState("Vilnius");
  const [serviceRadiusKm, setServiceRadiusKm] = useState(25);
  const [serviceNationwide, setServiceNationwide] = useState(false);
  const [serviceSpecialties] = useState<string[]>(["Remontas"]);
  const [localError, setLocalError] = useState<string | null>(null);

  const proFormValid =
    companyName.trim().length >= 2 &&
    companyCode.trim().length >= 2 &&
    (businessType !== "services" || serviceBaseCity.trim().length > 0);

  const handleUpgrade = async (e?: FormEvent) => {
    e?.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (!proFormValid) {
      setLocalError("Užpildykite įmonės duomenis.");
      return;
    }

    const ok = await upgradeToPro({
      businessType,
      companyName: companyName.trim(),
      companyCode: companyCode.trim(),
      vatCode: vatCode.trim() || undefined,
      serviceBaseCity:
        businessType === "services" ? serviceBaseCity.trim() : undefined,
      serviceRadiusKm:
        businessType === "services"
          ? serviceNationwide
            ? 999
            : serviceRadiusKm
          : undefined,
      serviceNationwide: businessType === "services" ? serviceNationwide : undefined,
      serviceSpecialties:
        businessType === "services" ? serviceSpecialties : undefined,
    });

    if (ok) {
      showToast("Pro paskyra sėkmingai aktyvuota!", "success");
    }
  };

  const displayError = localError ?? authError;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => void handleUpgrade(e)}
      noValidate
    >
      {displayError && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {displayError}
        </p>
      )}

      <p className="text-xs font-medium text-[var(--vauto-text-muted)]">Verslo tipas</p>
      {(
        [
          ["dealer", "Auto salonas"],
          ["services", "Paslaugų teikėjas"],
          ["general", "Kitas verslas"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setBusinessType(key)}
          className={`w-full rounded-xl px-4 py-2.5 text-left text-sm ${
            businessType === key
              ? "bg-[color-mix(in_srgb,var(--vauto-primary)_15%,transparent)] text-[var(--vauto-text-main)]"
              : "bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)] text-[var(--vauto-text-muted)]"
          }`}
        >
          {label}
        </button>
      ))}

      <input
        type="text"
        name="organization"
        autoComplete="organization"
        value={companyName}
        onChange={(e) => {
          clearAuthError();
          setLocalError(null);
          setCompanyName(e.target.value);
        }}
        placeholder="Įmonės pavadinimas"
        className={INPUT_CLASS}
      />
      <input
        type="text"
        name="companyCode"
        autoComplete="off"
        value={companyCode}
        onChange={(e) => {
          clearAuthError();
          setLocalError(null);
          setCompanyCode(e.target.value);
        }}
        placeholder="Įmonės kodas"
        className={INPUT_CLASS}
      />
      <input
        type="text"
        name="vatCode"
        autoComplete="off"
        value={vatCode}
        onChange={(e) => {
          clearAuthError();
          setLocalError(null);
          setVatCode(e.target.value);
        }}
        placeholder="PVM kodas (nebūtina)"
        className={INPUT_CLASS}
      />

      <p className="text-[10px] text-[var(--vauto-text-muted)]">
        Verslo testavimui: telefonas{" "}
        <span className="font-mono">{PRO_DEMO_PHONE}</span> · OTP{" "}
        <span className="font-mono">123456</span>
      </p>

      {businessType === "services" && (
        <div className="space-y-3 rounded-xl border border-[var(--vauto-border)] p-3">
          <p className="text-xs font-semibold text-[var(--vauto-text-muted)]">
            Darbo teritorija
          </p>
          <input
            type="text"
            value={serviceBaseCity}
            onChange={(e) => setServiceBaseCity(e.target.value)}
            placeholder="Bazinis miestas"
            className={INPUT_CLASS}
          />
          <div className="grid grid-cols-3 gap-2">
            {([10, 25, 50, 100] as const).map((radius) => (
              <button
                key={radius}
                type="button"
                onClick={() => {
                  setServiceNationwide(false);
                  setServiceRadiusKm(radius);
                }}
                className={`rounded-lg px-2 py-2 text-xs font-semibold ${
                  !serviceNationwide && serviceRadiusKm === radius
                    ? "bg-[var(--vauto-accent)] text-white"
                    : "bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)] text-[var(--vauto-text-muted)]"
                }`}
              >
                {radius} km
              </button>
            ))}
            <button
              type="button"
              onClick={() => setServiceNationwide(true)}
              className={`rounded-lg px-2 py-2 text-xs font-semibold ${
                serviceNationwide
                  ? "bg-[var(--vauto-accent)] text-white"
                  : "bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)] text-[var(--vauto-text-muted)]"
              }`}
            >
              Visa LT
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={authLoading}
        className="w-full rounded-2xl bg-[var(--vauto-accent)] py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {authLoading ? "Aktyvuojama…" : "Aktyvuoti Pro paskyrą"}
      </button>
    </form>
  );
}
