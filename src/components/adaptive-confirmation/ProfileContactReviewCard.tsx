"use client";

import { CheckCircle2, Pencil } from "lucide-react";
import { useState } from "react";
import type { AiExtractedListing } from "@/lib/types";

interface ProfileContactReviewCardProps {
  draft: AiExtractedListing;
  phone: string;
  email: string;
  appearance?: "dark" | "light";
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
}

export function ProfileContactReviewCard({
  draft,
  phone,
  email,
  appearance = "dark",
  onUpdate,
}: ProfileContactReviewCardProps) {
  const [editing, setEditing] = useState(false);
  const [editPhone, setEditPhone] = useState(phone);
  const [editEmail, setEditEmail] = useState(email);
  const [editCity, setEditCity] = useState(draft.location);

  const light = appearance === "light";

  const save = () => {
    const contact = [editPhone.trim(), editEmail.trim()].filter(Boolean).join(" · ");
    onUpdate({
      location: editCity.trim() || draft.location,
      contact,
      attributes: {
        ...(draft.attributes ?? {}),
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || undefined,
        contact,
        location: editCity.trim() || draft.location,
        profileContactSynced: "true",
      },
    });
    setEditing(false);
  };

  return (
    <div
      className={
        light
          ? "mb-4 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4"
          : "mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={`flex items-center gap-1.5 text-sm font-semibold ${
              light ? "text-[#15803d]" : "text-emerald-300"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Ar viskas tinka?
          </p>
          <p className={`mt-1 text-xs ${light ? "text-[#4b5563]" : "text-white/60"}`}>
            Kontaktai užpildyti iš jūsų profilio — patikrinkite arba pataisykite.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setEditPhone(phone);
              setEditEmail(email);
              setEditCity(draft.location);
              setEditing(true);
            }}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              light
                ? "bg-white text-[#1d4ed8] ring-1 ring-[#93c5fd]"
                : "bg-white/10 text-white/80"
            }`}
          >
            <Pencil className="h-3 w-3" />
            Keisti
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <label className={`block text-xs font-medium ${light ? "text-slate-700" : "text-white/70"}`}>
            Telefonas
            <input
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                light
                  ? "border-slate-300 bg-white text-slate-900"
                  : "border-white/10 bg-white/5 text-white"
              }`}
            />
          </label>
          <label className={`block text-xs font-medium ${light ? "text-slate-700" : "text-white/70"}`}>
            El. paštas
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                light
                  ? "border-slate-300 bg-white text-slate-900"
                  : "border-white/10 bg-white/5 text-white"
              }`}
            />
          </label>
          <label className={`block text-xs font-medium ${light ? "text-slate-700" : "text-white/70"}`}>
            Miestas
            <input
              type="text"
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                light
                  ? "border-slate-300 bg-white text-slate-900"
                  : "border-white/10 bg-white/5 text-white"
              }`}
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              className="rounded-lg bg-[#1167b1] px-3 py-2 text-xs font-semibold text-white"
            >
              Išsaugoti
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                light ? "text-slate-600" : "text-white/70"
              }`}
            >
              Atšaukti
            </button>
          </div>
        </div>
      ) : (
        <dl className={`mt-3 space-y-1.5 text-sm ${light ? "text-slate-800" : "text-white/90"}`}>
          {phone && (
            <div className="flex gap-2">
              <dt className={`w-20 shrink-0 text-xs ${light ? "text-slate-500" : "text-white/50"}`}>
                Telefonas
              </dt>
              <dd className="font-medium">{phone}</dd>
            </div>
          )}
          {email && (
            <div className="flex gap-2">
              <dt className={`w-20 shrink-0 text-xs ${light ? "text-slate-500" : "text-white/50"}`}>
                El. paštas
              </dt>
              <dd className="font-medium">{email}</dd>
            </div>
          )}
          {draft.location && (
            <div className="flex gap-2">
              <dt className={`w-20 shrink-0 text-xs ${light ? "text-slate-500" : "text-white/50"}`}>
                Miestas
              </dt>
              <dd className="font-medium">{draft.location}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
