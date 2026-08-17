"use client";

import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { Disclosure, Panel } from "@/components/ui/surface";
import type { UserProfile } from "@/lib/types";

const DISMISS_KEY = "vauto_ai_personalization_survey_dismissed_v1";

const SELECT_CLASS =
  "mt-1 w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-input,var(--vauto-card-bg))] px-3 py-2 text-sm text-[var(--vauto-text-main)]";

function parseHobbies(raw: string): string[] {
  const cleaned = raw
    .split(/[,\n;]/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((s) => s.slice(0, 40));
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

  const filled = hasAnyPersonalization(user);

  const show = useMemo(() => {
    if (!isAuthenticated) return false;
    if (embedded) return true;
    if (dismissed) return false;
    return !filled;
  }, [dismissed, embedded, filled, isAuthenticated]);

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

  const form: ReactNode = (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold text-[var(--vauto-text-main)]">
            Amžiaus grupė
          </span>
          <select
            value={ageGroup}
            onChange={(e) =>
              setAgeGroup((e.target.value as UserProfile["ageGroup"]) || "")
            }
            className={SELECT_CLASS}
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
            className={SELECT_CLASS}
          >
            <option value="">Nenurodyta</option>
            <option value="Male">Vyras</option>
            <option value="Female">Moteris</option>
            <option value="PreferNot">Nenoriu nurodyti</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-[var(--vauto-text-main)]">
            Pomėgiai
          </span>
          <input
            value={hobbiesRaw}
            onChange={(e) => setHobbiesRaw(e.target.value)}
            placeholder="Pvz. NT, elektronika, paslaugos, sodas…"
            className={SELECT_CLASS}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {!embedded && (
          <button
            type="button"
            onClick={handleDismiss}
            className="vauto-btn-quiet px-4 py-2 text-sm"
          >
            Praleisti
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-xl bg-[var(--vauto-primary)] px-4 py-2 text-sm font-semibold text-[var(--vauto-primary-contrast,#fff)] disabled:opacity-60"
        >
          {saving ? "Saugoma…" : "Išsaugoti"}
        </button>
      </div>
    </>
  );

  // On the AI tab / settings page this is a secondary detail: collapsed once
  // filled, so it never competes with the main AI profile save action.
  if (embedded) {
    return (
      <Disclosure
        title="Amžius, lytis, pomėgiai"
        subtitle={
          filled
            ? "Užpildyta — AI naudoja šiuos duomenis pokalbio tonui"
            : "Neprivaloma — padeda AI pritaikyti bendravimo toną"
        }
        icon={<Sparkles className="h-4 w-4 text-[var(--vauto-primary)]" />}
        defaultOpen={!filled}
      >
        {form}
      </Disclosure>
    );
  }

  return (
    <Panel
      tone="accent"
      icon={<Sparkles className="h-4 w-4 text-[var(--vauto-primary)]" />}
      title="Padėkime AI jus pažinti"
      description="Trys neprivalomi laukai — AI pritaikys pokalbio toną ir rekomendacijas."
    >
      {form}
    </Panel>
  );
}
