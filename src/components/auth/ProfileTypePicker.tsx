"use client";

import { useState } from "react";
import { Briefcase, Shirt } from "lucide-react";
import { apiSetProfileType } from "@/lib/auth/api";
import { mapApiUserToProfile } from "@/lib/auth/api";
import type { ProfileType } from "@/lib/profile-type";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";

interface ProfileTypePickerProps {
  onComplete?: (type: ProfileType) => void;
  className?: string;
}

export function ProfileTypePicker({ onComplete, className }: ProfileTypePickerProps) {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState<ProfileType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (profileType: ProfileType) => {
    setLoading(profileType);
    setError(null);
    const res = await apiSetProfileType(profileType);
    if (!res.ok) {
      setError(res.error || "Nepavyko išsaugoti profilio tipo");
      setLoading(null);
      return;
    }
    const mapped = mapApiUserToProfile(res.data.user, {
      role: user.role ?? "private",
      provider: user.authProvider ?? "phone",
    });
    updateUser(mapped);
    setLoading(null);
    onComplete?.(profileType);
  };

  return (
    <div className={cn("w-full", className)}>
      <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
        Paskutinis žingsnis
      </p>
      <h2 className="text-center text-lg font-semibold text-foreground">
        Kaip naudosi VAUTO?
      </h2>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Nesijaudink – pasirinkimą visada galėsi pakeisti. Jis tik pritaikys tavo
        kabinetą ir įrankius.
      </p>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-3">
        <button
          type="button"
          disabled={Boolean(loading)}
          onClick={() => void handleSelect("private")}
          className="flex w-full items-center gap-4 rounded-3xl border border-border bg-card p-5 text-left transition hover:border-primary/50 hover:bg-accent disabled:opacity-60"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Shirt className="h-7 w-7" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-foreground">
              Parduodu asmeninius daiktus
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              Madą, drabužius, avalynę ir kitus asmeninius daiktus – supaprastinta
              „spinta“, AI atpažinimas ir šiltos derybos su pirkėjais už tave.
            </span>
          </span>
          {loading === "private" && (
            <span className="text-xs text-muted-foreground">Saugoma…</span>
          )}
        </button>

        <button
          type="button"
          disabled={Boolean(loading)}
          onClick={() => void handleSelect("business")}
          className="flex w-full items-center gap-4 rounded-3xl border border-border bg-card p-5 text-left transition hover:border-primary/50 hover:bg-accent disabled:opacity-60"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
            <Briefcase className="h-7 w-7" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-foreground">
              Turiu verslą ar teikiu paslaugas
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              Automobilių, nekilnojamojo turto ar paslaugų skelbimai – verslo
              kabinetas, analitika ir masinis valdymas visoje Lietuvoje.
            </span>
          </span>
          {loading === "business" && (
            <span className="text-xs text-muted-foreground">Saugoma…</span>
          )}
        </button>
      </div>
    </div>
  );
}
