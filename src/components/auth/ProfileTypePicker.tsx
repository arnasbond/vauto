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
      <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-teal)]">
        Paskutinis žingsnis
      </p>
      <h2 className="text-center text-lg font-semibold text-white">
        Kaip naudosite VAUTO?
      </h2>
      <p className="mt-2 text-center text-sm text-slate-400">
        Pasirinkimas pritaikys kabinetą ir portalų integracijas.
      </p>

      {error && (
        <p className="mt-4 rounded-xl bg-red-500/15 px-3 py-2 text-center text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-3">
        <button
          type="button"
          disabled={Boolean(loading)}
          onClick={() => void handleSelect("private")}
          className="flex w-full items-center gap-4 rounded-3xl border border-fuchsia-500/40 bg-fuchsia-600/10 p-5 text-left transition hover:border-fuchsia-400 hover:bg-fuchsia-600/20 disabled:opacity-60"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-600 text-white shadow-md">
            <Shirt className="h-7 w-7" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-white">
              Aš parduodu asmeninius daiktus
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-300">
              Vinted, Marktplaats, Depop — supaprastinta spinta ir daiktų valdymas.
            </span>
          </span>
          {loading === "private" && (
            <span className="text-xs text-fuchsia-200">Saugoma…</span>
          )}
        </button>

        <button
          type="button"
          disabled={Boolean(loading)}
          onClick={() => void handleSelect("business")}
          className="flex w-full items-center gap-4 rounded-3xl border border-[var(--vauto-teal)]/40 bg-[var(--vauto-teal)]/10 p-5 text-left transition hover:border-[var(--vauto-teal)] hover:bg-[var(--vauto-teal)]/20 disabled:opacity-60"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--vauto-teal)] text-white shadow-md">
            <Briefcase className="h-7 w-7" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-white">
              Aš esu Verslas / Teikiu paslaugas
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-300">
              Skelbiu, Autoplius, Aruodas, Paslaugos.lt — analitika ir masinis valdymas.
            </span>
          </span>
          {loading === "business" && (
            <span className="text-xs text-teal-200">Saugoma…</span>
          )}
        </button>
      </div>
    </div>
  );
}
