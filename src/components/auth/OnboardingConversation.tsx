"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  apiFetchUserOnboarding,
  apiSaveUserOnboarding,
  type UserPreferencesPayload,
} from "@/lib/api/user-intelligence";
import { isDataApiEnabled } from "@/lib/api/config";

const QUESTIONS = [
  {
    key: "usageIntent",
    prompt: "Kaip dažniausiai naudositės VAUTO?",
    options: ["Pirkti", "Parduoti", "Verslui", "Viskuo"],
  },
  {
    key: "preferredCategories",
    prompt: "Kokios kategorijos jums aktualiausios?",
    options: ["Drabužiai", "Automobiliai", "Elektronika", "Buitis"],
  },
  {
    key: "notifyMatches",
    prompt: "Ar norite, kad praneščiau apie naujus atitikmenis?",
    options: ["Taip, pranešk", "Tik svarbius", "Ne dabar"],
  },
] as const;

interface OnboardingConversationProps {
  onComplete?: () => void;
}

export function OnboardingConversation({ onComplete }: OnboardingConversationProps) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { openWithGreeting } = useVautoAgent();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !isDataApiEnabled()) {
      setLoading(false);
      return;
    }
    void (async () => {
      const res = await apiFetchUserOnboarding();
      if (res.ok && res.data?.onboarding?.completedAt) {
        setDone(true);
      } else if (res.ok && res.data?.onboarding?.step) {
        setStep(Math.min(res.data.onboarding.step, QUESTIONS.length - 1));
        const stored = res.data.onboarding.answers ?? {};
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(stored)) {
          if (typeof v === "string") mapped[k] = v;
        }
        setAnswers(mapped);
      }
      setLoading(false);
    })();
  }, [isAuthenticated]);

  const persist = useCallback(
    async (nextStep: number, nextAnswers: Record<string, string>, completed = false) => {
      const prefs: UserPreferencesPayload = {
        usageIntent: nextAnswers.usageIntent,
        preferredCategories: nextAnswers.preferredCategories
          ? [nextAnswers.preferredCategories.toLowerCase()]
          : undefined,
        notificationPrefs: {
          notifyMatches: nextAnswers.notifyMatches,
        },
        wardrobeMode: nextAnswers.preferredCategories === "Drabužiai",
      };
      await apiSaveUserOnboarding({
        step: nextStep,
        completed,
        answers: nextAnswers,
        preferences: prefs,
      });
    },
    []
  );

  const handleSelect = useCallback(
    async (option: string) => {
      const q = QUESTIONS[step];
      if (!q) return;
      const nextAnswers = { ...answers, [q.key]: option };
      setAnswers(nextAnswers);
      const isLast = step >= QUESTIONS.length - 1;
      if (isLast) {
        await persist(step + 1, nextAnswers, true);
        setDone(true);
        openWithGreeting(
          "Puiku — dabar geriau suprantu, ko ieškote. Galime pradėti: parašykite, ką norite rasti ar parduoti.",
          { openSheet: true, quickReplies: ["Ieškoti prekių", "Kelti skelbimą"] }
        );
        onComplete?.();
        return;
      }
      const nextStep = step + 1;
      setStep(nextStep);
      await persist(nextStep, nextAnswers, false);
    },
    [answers, onComplete, openWithGreeting, persist, step]
  );

  if (loading || done || !isAuthenticated) return null;
  if (pathname !== "/" && pathname !== "/profile/") return null;

  const current = QUESTIONS[step];
  if (!current) return null;

  return (
    <section className="mx-auto mt-6 max-w-lg rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-primary)]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Susipažinkime ({step + 1}/{QUESTIONS.length})
      </div>
      <p className="mb-4 text-sm font-medium text-[var(--vauto-text)]">{current.prompt}</p>
      <div className="flex flex-wrap gap-2">
        {current.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => void handleSelect(option)}
            className="rounded-full border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3 py-2 text-sm font-medium text-[var(--vauto-text)] transition hover:border-[var(--vauto-primary)] hover:text-[var(--vauto-primary)]"
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  );
}
