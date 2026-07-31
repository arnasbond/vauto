"use client";

import { useCallback, useEffect, useState } from "react";
import { Car, Loader2, Save, Shirt, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import {
  apiFetchUserPreferences,
  apiSaveUserPreferences,
} from "@/lib/api/user-intelligence";
import {
  CLOTHING_PRESETS,
  EMPTY_AI_TWIN_FORM,
  formFromPreferences,
  formToPreferencesPayload,
  userPatchFromPreferences,
  type AiTwinProfileForm,
} from "@/lib/ai-preference-profile";
import { isDataApiEnabled } from "@/lib/api/config";
import { cn } from "@/lib/cn";

interface AiPreferenceCenterProps {
  /** Compact card mode (settings page). */
  embedded?: boolean;
  className?: string;
}

/**
 * Mano AI Dvynio duomenys — Preference Center for Magic Mirror / Fleet / tone.
 */
export function AiPreferenceCenter({
  embedded = false,
  className,
}: AiPreferenceCenterProps) {
  const { user, isAuthenticated, updateUser, showToast } = useVauto();
  const { updateUser: patchAuthUser } = useAuth();
  const [form, setForm] = useState<AiTwinProfileForm>(EMPTY_AI_TWIN_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated || user.id === "guest") {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let prefs = null;
      if (isDataApiEnabled()) {
        const res = await apiFetchUserPreferences();
        if (res.ok) prefs = res.data.preferences;
      }
      const next = formFromPreferences(prefs, user);
      setForm(next);
      // Hydrate Magic Mirror / Fleet fields into session user (local).
      if (prefs) {
        const patch = userPatchFromPreferences(prefs);
        if (Object.keys(patch).length) patchAuthUser(patch);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, patchAuthUser, user]);

  useEffect(() => {
    void load();
    // Intentionally once per auth identity — avoid loops on user patch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate on login only
  }, [isAuthenticated, user.id]);

  const setField = <K extends keyof AiTwinProfileForm>(
    key: K,
    value: AiTwinProfileForm[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = formToPreferencesPayload(form);
      if (isDataApiEnabled()) {
        const res = await apiSaveUserPreferences(payload);
        if (!res.ok) {
          showToast(`Nepavyko išsaugoti: ${res.error}`, "error");
          return;
        }
      }
      const patch = userPatchFromPreferences(payload);
      // Session hydrate for Magic Mirror / Fleet (body + vehicle live in preferences).
      patchAuthUser(patch);
      // Persist purchase prefs also as users.hobbies for tone personalization.
      if (patch.hobbies?.length) {
        await updateUser({ hobbies: patch.hobbies });
      }
      showToast("AI Dvynio duomenys išsaugoti — patarimai bus tikslesni.", "success");
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <section
      id="ai-preference-center"
      className={cn(
        embedded ? "" : "px-1",
        className
      )}
      aria-labelledby="ai-twin-heading"
    >
      <div className="vauto-dashboard-card rounded-3xl p-4">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--vauto-teal)_18%,transparent)]">
            <Sparkles className="h-5 w-5 text-[var(--vauto-teal)]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="ai-twin-heading"
              className="text-sm font-bold text-[var(--vauto-text-main)]"
            >
              Mano AI Dvynio duomenys
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
              Dydžiai, automobilis ir preferencijos — Magic Mirror bei asistentas
              naudos tik šiuos realius duomenis (be spėlionių).
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-[var(--vauto-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Kraunami AI nustatymai…
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
                <Shirt className="h-3.5 w-3.5" aria-hidden />
                Drabužiai ir batai
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-[var(--vauto-text-main)]">
                  Drabužių dydis
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {CLOTHING_PRESETS.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setField("clothingSize", size)}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                          form.clothingSize.toUpperCase() === size
                            ? "border-[var(--vauto-teal)] bg-[var(--vauto-teal)]/15 text-[var(--vauto-teal)]"
                            : "border-[var(--vauto-border)] text-[var(--vauto-text-muted)] hover:border-[var(--vauto-teal)]/40"
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <input
                    value={form.clothingSize}
                    onChange={(e) => setField("clothingSize", e.target.value)}
                    placeholder="Arba įrašykite laisvai (pvz. 38, M/L)"
                    className="mt-2 w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--vauto-teal)]/30"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--vauto-text-main)]">
                  Batų dydis (EU)
                  <input
                    inputMode="decimal"
                    value={form.shoeSizeEu}
                    onChange={(e) => setField("shoeSizeEu", e.target.value)}
                    placeholder="Pvz. 42"
                    className="mt-1.5 w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--vauto-teal)]/30"
                  />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["heightCm", "Ūgis cm"],
                    ["bustCm", "Krūtinė cm"],
                    ["waistCm", "Juosmuo cm"],
                    ["hipsCm", "Klubai cm"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="block text-[11px] font-medium text-[var(--vauto-text-muted)]"
                  >
                    {label}
                    <input
                      inputMode="numeric"
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-2.5 py-2 text-sm text-[var(--vauto-text-main)] outline-none focus:ring-2 focus:ring-[var(--vauto-teal)]/30"
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
                <Car className="h-3.5 w-3.5" aria-hidden />
                Automobilis
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block text-xs font-medium text-[var(--vauto-text-main)]">
                  Markė
                  <input
                    value={form.vehicleMake}
                    onChange={(e) => setField("vehicleMake", e.target.value)}
                    placeholder="VW"
                    className="mt-1.5 w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--vauto-teal)]/30"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--vauto-text-main)]">
                  Modelis
                  <input
                    value={form.vehicleModel}
                    onChange={(e) => setField("vehicleModel", e.target.value)}
                    placeholder="Golf"
                    className="mt-1.5 w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--vauto-teal)]/30"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--vauto-text-main)]">
                  Metai
                  <input
                    inputMode="numeric"
                    value={form.vehicleYear}
                    onChange={(e) => setField("vehicleYear", e.target.value)}
                    placeholder="2018"
                    className="mt-1.5 w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--vauto-teal)]/30"
                  />
                </label>
              </div>
            </fieldset>

            <label className="block text-xs font-medium text-[var(--vauto-text-main)]">
              Pomėgiai / pirkimo preferencijos
              <textarea
                value={form.purchasePrefsRaw}
                onChange={(e) => setField("purchasePrefsRaw", e.target.value)}
                rows={2}
                placeholder="Pvz. dviračiai, vintage mada, elektriniai įrankiai"
                className="mt-1.5 w-full resize-none rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--vauto-teal)]/30"
              />
              <span className="mt-1 block text-[11px] text-[var(--vauto-text-muted)]">
                Atskirkite kableliais — asistentas siūlys aktualesnius skelbimus.
              </span>
            </label>

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--vauto-teal)] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Išsaugoti AI Dvynio duomenis
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
