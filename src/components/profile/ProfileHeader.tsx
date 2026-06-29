"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, LogOut, Pencil, X } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { useVauto } from "@/context/VautoContext";
import {
  displayUserName,
  splitUserName,
} from "@/lib/profile-display";
import { blockNativeClickThrough } from "@/lib/native-click-guard";

interface ProfileHeaderProps {
  user: UserProfile;
  onLogout: () => void;
}

export function ProfileHeader({ user, onLogout }: ProfileHeaderProps) {
  const { updateUser, showToast } = useVauto();
  const isPro = user.role === "pro";
  const displayName = displayUserName(user);

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
      <div className="vauto-dashboard-card mb-4 rounded-3xl p-5">
        <div className="flex items-start gap-4">
          <ProfileAvatarEditor avatar={user.avatar} name={displayName} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openEdit}
                className="group flex min-w-0 items-center gap-1.5 text-left"
                aria-label="Redaguoti profilio duomenis"
              >
                <h1 className="truncate text-lg font-bold text-[var(--vauto-text-main)] group-hover:text-[var(--vauto-primary)]">
                  {displayName}
                </h1>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-[var(--vauto-text-muted)] opacity-70 group-hover:text-[var(--vauto-primary)]" />
              </button>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  isPro
                    ? "bg-[color-mix(in_srgb,var(--vauto-accent)_20%,transparent)] text-[var(--vauto-accent)]"
                    : "bg-[color-mix(in_srgb,var(--vauto-primary)_20%,transparent)] text-[var(--vauto-primary)]"
                }`}
              >
                {isPro ? "Pro" : "Privatus"}
              </span>
            </div>
            {user.nickname?.trim() &&
              displayName !== user.nickname.trim() && (
                <p className="mt-0.5 text-xs text-[var(--vauto-text-muted)]">
                  @{user.nickname.trim()}
                </p>
              )}
            <p className="mt-0.5 text-sm text-[var(--vauto-text-muted)]">
              {user.city} · {user.phone}
            </p>
            {isPro && user.businessType && (
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--vauto-primary)]">
                <Building2 className="h-3 w-3" />
                {user.businessType === "dealer"
                  ? "Auto salonas"
                  : user.businessType === "services"
                    ? "Paslaugos"
                    : "Verslas"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)] p-2.5 text-[var(--vauto-text-muted)] hover:text-[var(--vauto-text-main)]"
            aria-label="Atsijungti"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

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
          <div className="w-full max-w-md rounded-3xl bg-[var(--vauto-card-bg)] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2
                id="profile-edit-title"
                className="text-lg font-bold text-[var(--vauto-text-main)]"
              >
                Redaguoti profilį
              </h2>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-xl p-2 text-[var(--vauto-text-muted)] hover:bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)]"
                aria-label="Uždaryti"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--vauto-text-muted)]">
                  Vardas
                </span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-xl border border-[color-mix(in_srgb,var(--vauto-text-main)_12%,transparent)] bg-transparent px-3 py-2.5 text-sm text-[var(--vauto-text-main)] outline-none focus:border-[var(--vauto-primary)]"
                  placeholder="Jonas"
                  autoComplete="given-name"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--vauto-text-muted)]">
                  Pavardė
                </span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-xl border border-[color-mix(in_srgb,var(--vauto-text-main)_12%,transparent)] bg-transparent px-3 py-2.5 text-sm text-[var(--vauto-text-main)] outline-none focus:border-[var(--vauto-primary)]"
                  placeholder="Jonaitis"
                  autoComplete="family-name"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--vauto-text-muted)]">
                  Nikas / slapyvardis
                </span>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-xl border border-[color-mix(in_srgb,var(--vauto-text-main)_12%,transparent)] bg-transparent px-3 py-2.5 text-sm text-[var(--vauto-text-main)] outline-none focus:border-[var(--vauto-primary)]"
                  placeholder="jonas_vauto"
                  autoComplete="nickname"
                />
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                disabled={saving}
                className="flex-1 rounded-xl bg-[color-mix(in_srgb,var(--vauto-text-main)_8%,transparent)] py-2.5 text-sm font-semibold text-[var(--vauto-text-main)] disabled:opacity-60"
              >
                Atšaukti
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Išsaugoti
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
