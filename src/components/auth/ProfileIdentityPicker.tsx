"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import {
  hasRealAvatar,
  hasRealNickname,
  isPlaceholderDisplayName,
} from "@/lib/profile-identity";
import { cn } from "@/lib/cn";

interface ProfileIdentityPickerProps {
  onComplete?: () => void;
  className?: string;
}

export function ProfileIdentityPicker({
  onComplete,
  className,
}: ProfileIdentityPickerProps) {
  const { user } = useAuth();
  const { updateUser, showToast } = useVauto();
  const [nickname, setNickname] = useState(
    () => (hasRealNickname(user) ? user.nickname!.trim() : "")
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarOk = hasRealAvatar(user);

  const handleContinue = async () => {
    setError(null);
    const nick = nickname.trim();
    if (nick.length < 2 || isPlaceholderDisplayName(nick)) {
      setError("Įveskite slapyvardį (bent 2 simboliai) — taip AI kreipsis į jus asmeniškai.");
      return;
    }
    if (!hasRealAvatar(user)) {
      setError("Įkelkite savo nuotrauką — stock avataras nepakanka.");
      return;
    }
    setSaving(true);
    try {
      const ok = await updateUser({
        nickname: nick,
        // Keep display name warm when it was a placeholder.
        name: isPlaceholderDisplayName(user.name) ? nick : user.name,
      });
      if (!ok) {
        setError("Nepavyko išsaugoti — bandykite dar kartą.");
        setSaving(false);
        return;
      }
      showToast("Profilis paruoštas — sveiki atvykę!", "success");
      onComplete?.();
    } catch {
      setError("Nepavyko išsaugoti — bandykite dar kartą.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
        Asmeninis profilis
      </p>
      <h2 className="text-center text-lg font-semibold text-foreground">
        Kaip jus vadinti?
      </h2>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Slapyvardis ir nuotrauka — privalomi. Taip VAUTO asistentas kreipsis šiltai ir
        asmeniškai, o pirkėjai matys patikimą profilį.
      </p>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col items-center gap-4">
        <ProfileAvatarEditor
          avatar={user.avatar || ""}
          name={nickname.trim() || user.name || "VAUTO"}
        />
        {!avatarOk && (
          <p className="text-center text-xs text-muted-foreground">
            Spauskite kamerą ir įkelkite savo nuotrauką
          </p>
        )}
      </div>

      <label className="mt-6 block">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <UserRound className="h-3.5 w-3.5" />
          Slapyvardis
        </span>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="pvz. Arnas"
          maxLength={40}
          autoComplete="nickname"
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none ring-primary/30 placeholder:text-muted-foreground focus:ring-2"
        />
      </label>

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleContinue()}
        className="mt-6 w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-90 disabled:opacity-60"
      >
        {saving ? "Saugoma…" : "Tęsti"}
      </button>
    </div>
  );
}
