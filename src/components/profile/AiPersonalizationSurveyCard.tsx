"use client";

import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { Info, Sparkles } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import type { UserProfile } from "@/lib/types";

const DISMISS_KEY = "vauto_ai_personalization_survey_dismissed_v1";

const TOOLTIP_TEXT =
  "Užpildykite šiuos trumpus duomenis, kad jūsų asmeninis AI asistentas geriau suprastų jūsų poreikius, prisitaikytų prie jūsų bendravimo stiliaus ir padėtų parduoti prekes efektyviau!";

function parseHobbies(raw: string): string[] {
  const cleaned = raw
    .split(/[,\n;]/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((s) => s.slice(0, 40));
  // de-dupe (case-insensitive) but keep original casing
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of cleaned) {
    const k = h.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

function hasAnyPersonalization(user: UserProfile): boolean {
  return Boolean(user.ageGroup || user.gender || (user.hobbies?.length ?? 0) > 0);
}

export function AiPersonalizationSurveyCard(props: {
  embedded?: boolean;
}): ReactElement | null {
  const { user, isAuthenticated, updateUser, showToast } = useVauto();
  const embedded = Boolean(props.embedded);

  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);

  const [ageGroup, setAgeGroup] = useState<UserProfile["ageGroup"] | "">("");
  const [gender, setGender] = useState<UserProfile["gender"] | "">("");
  const [hobbiesRaw, setHobbiesRaw] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setAgeGroup(user.ageGroup ?? "");
    setGender(user.gender ?? "");
    setHobbiesRaw((user.hobbies ?? []).join(", "));
  }, [isAuthenticated, user.ageGroup, user.gender, user.hobbies]);

  const show = useMemo(() => {
    if (!isAuthenticated) return false;
    if (embedded) return true;
    if (dismissed) return false;
    return !hasAnyPersonalization(user);
  }, [dismissed, embedded, isAuthenticated, user]);

  if (!show) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") localStorage.setItem(DISMISS_KEY, "1");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const hobbies = parseHobbies(hobbiesRaw);
      const ok = await updateUser({
        ageGroup: ageGroup || undefined,
        gender: gender || undefined,
        hobbies: hobbies.length ? hobbies : undefined,
      });
      if (ok) {
        showToast("Išsaugota — AI prisitaikys prie jūsų stiliaus.", "success");
        if (!embedded) handleDismiss();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={embedded ? "" : "px-1"}>
      <div className="vauto-dashboard-card rounded-3xl p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--vauto-teal)_18%,transparent)]">
            <Sparkles className="h-5 w-5 text-[var(--vauto-teal)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--vauto-text-main)]">
                AI personalizacija (neprivaloma)
              </p>
              {!embedded && (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-xl px-2 py-1 text-xs font-semibold text-[var(--vauto-text-muted)] hover:bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)]"
                >
                  Praleisti
                </button>
              )}
            </div>

            <div className="mt-1 flex items-start gap-2 text-xs text-[var(--vauto-text-muted)]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="leading-relaxed">{TOOLTIP_TEXT}</p>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold text-[var(--vauto-text-main)]">
                  Amžiaus grupė
                </span>
                <select
                  value={ageGroup}
                  onChange={(e) =>
                    setAgeGroup((e.target.value as UserProfile["ageGroup"]) || "")
                  }
                  className="mt-1 w-full rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3 py-2 text-sm text-[var(--vauto-text-main)]"
                >
                  <option value="">Nenurodyta</option>
                  <option value="Youth">Jaunimas</option>
                  <option value="Adult">Suaugęs</option>
                  <option value="Senior">Senjoras</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[var(--vauto-text-main)]">
                  Lytis
                </span>
                <select
                  value={gender}
                  onChange={(e) =>
                    setGender((e.target.value as UserProfile["gender"]) || "")
                  }
                  className="mt-1 w-full rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3 py-2 text-sm text-[var(--vauto-text-main)]"
                >
                  <option value="">Nenurodyta</option>
                  <option value="Male">Vyras</option>
                  <option value="Female">Moteris</option>
                  <option value="PreferNot">Nenoriu nurodyti</option>
                </select>
              </label>

              <label className="block md:col-span-1">
                <span className="text-xs font-semibold text-[var(--vauto-text-main)]">
                  Pomėgiai
                </span>
                <input
                  value={hobbiesRaw}
                  onChange={(e) => setHobbiesRaw(e.target.value)}
                  placeholder="Pvz. automobiliai, mada, sodas…"
                  className="mt-1 w-full rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3 py-2 text-sm text-[var(--vauto-text-main)] placeholder:text-[color-mix(in_srgb,var(--vauto-text-main)_45%,transparent)]"
                />
              </label>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              {embedded && (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-2xl border border-[var(--vauto-border)] px-4 py-2 text-sm font-semibold text-[var(--vauto-text-main)] hover:bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)]"
                >
                  Uždaryti
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-2xl bg-[var(--vauto-teal)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saugoma…" : "Išsaugoti"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

