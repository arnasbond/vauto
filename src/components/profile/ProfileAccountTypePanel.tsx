"use client";

import { FormEvent, useState } from "react";
import { Building2, UserRound } from "lucide-react";
import type { ProBusinessType } from "@/lib/types";
import { PRO_DEMO_PHONE } from "@/lib/reports";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import { useProfileViewMode } from "@/lib/profile-view";

const INPUT_CLASS =
  "profile-editable-input w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-[var(--vauto-border)] focus:ring-2 focus:ring-[var(--vauto-accent)]";

export function ProfileAccountTypePanel() {
  const { user, upgradeToPro, authLoading, authError, clearAuthError } = useAuth();
  const { showToast } = useVauto();
  const isPro = user.role === "pro";
  const { viewMode, setViewMode } = useProfileViewMode(isPro);

  const [businessType, setBusinessType] = useState<ProBusinessType>("general");
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [vatCode, setVatCode] = useState("");
  const [serviceBaseCity, setServiceBaseCity] = useState("Vilnius");
  const [serviceRadiusKm, setServiceRadiusKm] = useState(25);
  const [serviceNationwide, setServiceNationwide] = useState(false);
  const [serviceSpecialties, setServiceSpecialties] = useState<string[]>([
    "Remontas",
  ]);
  const [localError, setLocalError] = useState<string | null>(null);

  if (isPro) {
    return (
      <div className="vauto-dashboard-card rounded-2xl p-4">
        <p className="text-sm font-semibold text-[var(--vauto-text-main)]">
          Paskyros vaizdas
        </p>
        <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
          Perjunkite tarp privataus pardavėjo ir verslo kabineto vaizdo.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setViewMode("private")}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition ${
              viewMode === "private"
                ? "bg-[color-mix(in_srgb,var(--vauto-primary)_20%,transparent)] text-[var(--vauto-primary)] ring-2 ring-[var(--vauto-primary)]"
                : "bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)] text-[var(--vauto-text-muted)]"
            }`}
          >
            <UserRound className="h-4 w-4" />
            Privatus
          </button>
          <button
            type="button"
            onClick={() => setViewMode("business")}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition ${
              viewMode === "business"
                ? "bg-[color-mix(in_srgb,var(--vauto-accent)_20%,transparent)] text-[var(--vauto-accent)] ring-2 ring-[var(--vauto-accent)]"
                : "bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)] text-[var(--vauto-text-muted)]"
            }`}
          >
            <Building2 className="h-4 w-4" />
            Verslas
          </button>
        </div>
      </div>
    );
  }

  const handleUpgrade = async (e?: FormEvent) => {
    e?.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (businessType === "services" && !serviceBaseCity.trim()) {
      setLocalError("Nurodykite bazinį miestą paslaugoms.");
      return;
    }

    const displayName =
      companyName.trim() ||
      user.nickname?.trim() ||
      user.name?.trim() ||
      "VAUTO Pro";

    const payload = {
      businessType,
      companyName: displayName,
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
    };

    const ok = await upgradeToPro(payload);
    if (ok) {
      showToast("Pro paskyra sėkmingai aktyvuota!", "success");
    }
  };

  const displayError = localError ?? authError;

  return (
    <div className="vauto-dashboard-card rounded-2xl p-4">
      <p className="text-sm font-semibold text-[var(--vauto-text-main)]">
        Pro Verslo paskyra
      </p>
      <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
        Analitika, matomumo planai ir verslo įrankiai — aktyvuokite čia, ne
        prisijungimo metu.
      </p>

      {displayError && (
        <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {displayError}
        </p>
      )}

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => void handleUpgrade(e)}
        noValidate
      >
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
          aria-label="Įmonės / veiklos pavadinimas (nebūtina)"
          placeholder="Įmonės / veiklos pavadinimas (nebūtina)"
          readOnly={false}
          disabled={false}
          aria-readonly={false}
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
          aria-label="Įmonės / IV kodas (nebūtina)"
          placeholder="Įmonės / IV kodas (nebūtina)"
          readOnly={false}
          disabled={false}
          aria-readonly={false}
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
          readOnly={false}
          disabled={false}
          aria-readonly={false}
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
              readOnly={false}
              disabled={false}
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
            <div className="flex flex-wrap gap-2">
              {[
                "Elektrika",
                "Santechnika",
                "Valymas",
                "Remontas",
                "Plytelių darbai",
              ].map((specialty) => {
                const active = serviceSpecialties.includes(specialty);
                return (
                  <button
                    key={specialty}
                    type="button"
                    onClick={() =>
                      setServiceSpecialties((prev) =>
                        active
                          ? prev.filter((x) => x !== specialty)
                          : [...prev, specialty]
                      )
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      active
                        ? "bg-[var(--vauto-primary)] text-white"
                        : "bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)] text-[var(--vauto-text-muted)]"
                    }`}
                  >
                    {specialty}
                  </button>
                );
              })}
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
    </div>
  );
}
