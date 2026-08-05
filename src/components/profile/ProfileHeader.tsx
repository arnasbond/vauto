"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Clock,
  Loader2,
  LogOut,
  Pencil,
  ShoppingBag,
  Star,
  X,
} from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { Badge, Button, Card } from "@/design-system";
import { useVauto } from "@/context/VautoContext";
import {
  displayPublicNickname,
  splitUserName,
} from "@/lib/profile-display";
import { blockNativeClickThrough } from "@/lib/native-click-guard";
import {
  computeSellerRating,
  isVerifiedTrustedSeller,
} from "@/lib/reviews";
import { cn } from "@/lib/cn";

interface ProfileHeaderProps {
  user: UserProfile;
  onLogout: () => void;
}

function StarRow({ avg, count }: { avg: number; count: number }) {
  const filled = count > 0 ? Math.round(avg) : 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-3.5 w-3.5",
              i < filled
                ? "fill-amber-400 text-amber-400"
                : "text-[var(--ds-border-strong)]"
            )}
          />
        ))}
      </div>
      <span className="text-xs text-[var(--ds-text-muted)]">
        {count > 0 ? `${avg} · ${count} atsiliep.` : "Dar nėra atsiliepimų"}
      </span>
    </div>
  );
}

/**
 * Profile Hero 2.0 — pasitikėjimą kurianti pardavėjo kortelė.
 * Tik UI; edit / logout handleriai nepakeisti.
 */
export function ProfileHeader({ user, onLogout }: ProfileHeaderProps) {
  const { updateUser, showToast, reviews } = useVauto();
  const isPro = user.role === "pro";
  const publicNickname = displayPublicNickname(user);
  const { avg, count } = useMemo(
    () => computeSellerRating(reviews, user.id),
    [reviews, user.id]
  );
  const verified = isVerifiedTrustedSeller(
    user.id,
    reviews,
    user.authProvider,
    user
  );
  const responseLabel =
    typeof user.averageResponseMinutes === "number" &&
    Number.isFinite(user.averageResponseMinutes)
      ? `~${Math.max(1, Math.round(user.averageResponseMinutes))} min`
      : "Atsako per žinutes";
  const soldCount = user.soldCount ?? 0;

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");

  const openEdit = useCallback(() => {
    const split = splitUserName(user);
    setFirstName(split.firstName);
    setLastName(split.lastName);
    setNickname(split.nickname);
    setEditOpen(true);
  }, [user]);

  useEffect(() => {
    if (!editOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editOpen]);

  useEffect(() => {
    if (editOpen) return;
    setFirstName("");
    setLastName("");
    setNickname("");
  }, [editOpen, user.id]);

  const handleSave = async () => {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedNick = nickname.trim();
    if (!trimmedFirst && !trimmedLast && !trimmedNick) {
      showToast("Įveskite bent vardą, pavardę arba niką.", "error");
      return;
    }
    setSaving(true);
    try {
      const ok = await updateUser({
        firstName: trimmedFirst,
        lastName: trimmedLast,
        nickname: trimmedNick,
      });
      if (!ok) {
        showToast("Profilio duomenys neišsaugoti.", "error");
        return;
      }
      showToast("Profilis atnaujintas.", "success");
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card
        variant="elevated"
        data-profile-hero-2
        className="mb-4"
      >
        <div className="flex items-start gap-4">
          <ProfileAvatarEditor avatar={user.avatar} name={publicNickname} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openEdit}
                className="group flex min-w-0 items-center gap-1.5 text-left"
                aria-label="Redaguoti profilio duomenis"
              >
                <h1 className="truncate font-[family-name:var(--font-outfit)] text-lg font-bold text-[var(--ds-text-primary)] group-hover:text-[var(--ds-brand)]">
                  @{publicNickname}
                </h1>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-muted)] opacity-70 group-hover:text-[var(--ds-brand)]" />
              </button>
              <Badge tone={isPro ? "premium" : "brand"}>
                {isPro ? "Pro" : "Privatus"}
              </Badge>
              {verified ? (
                <Badge tone="success">Patvirtintas pardavėjas</Badge>
              ) : user.phone || user.authProvider ? (
                <Badge tone="info">Paskyra patvirtinta</Badge>
              ) : null}
            </div>

            {isPro && user.businessType ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--ds-brand)]">
                <Building2 className="h-3 w-3" />
                {user.businessType === "dealer"
                  ? "Auto salonas"
                  : user.businessType === "services"
                    ? "Paslaugos"
                    : "Verslas"}
              </p>
            ) : null}

            <div className="mt-3">
              <StarRow avg={avg} count={count} />
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--ds-text-secondary)]">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-[var(--ds-brand)]" aria-hidden />
                Atsako laikas: {responseLabel}
              </span>
              <span className="inline-flex items-center gap-1">
                <ShoppingBag
                  className="h-3.5 w-3.5 text-[var(--ds-brand)]"
                  aria-hidden
                />
                Pardavimai: {soldCount}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Atsijungti"
            onClick={onLogout}
            leftIcon={<LogOut className="h-4 w-4" />}
          />
        </div>
      </Card>

      {editOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={(e) => {
            blockNativeClickThrough();
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-edit-title"
        >
          <div className="w-full max-w-md rounded-[var(--ds-radius-card)] bg-[var(--ds-surface-elevated,var(--vauto-card-bg))] p-5 shadow-[var(--ds-shadow-md)]">
            <div className="mb-4 flex items-center justify-between">
              <h2
                id="profile-edit-title"
                className="text-lg font-bold text-[var(--ds-text-primary)]"
              >
                Redaguoti profilį
              </h2>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-xl p-2 text-[var(--ds-text-muted)] hover:bg-[var(--ds-surface-muted)]"
                aria-label="Uždaryti"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                  Vardas
                </span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-transparent px-3 py-2.5 text-sm text-[var(--ds-text-primary)] outline-none focus:border-[var(--ds-brand)]"
                  placeholder="Jonas"
                  autoComplete="given-name"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                  Pavardė
                </span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-transparent px-3 py-2.5 text-sm text-[var(--ds-text-primary)] outline-none focus:border-[var(--ds-brand)]"
                  placeholder="Jonaitis"
                  autoComplete="family-name"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                  Nikas / slapyvardis
                </span>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-transparent px-3 py-2.5 text-sm text-[var(--ds-text-primary)] outline-none focus:border-[var(--ds-brand)]"
                  placeholder="jonas_vauto"
                  autoComplete="nickname"
                />
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setEditOpen(false)}
                disabled={saving}
              >
                Atšaukti
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => void handleSave()}
                disabled={saving}
                leftIcon={
                  saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : undefined
                }
              >
                Išsaugoti
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
