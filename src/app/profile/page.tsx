"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useVauto } from "@/context/VautoContext";
import { AiSettingsCard } from "@/components/AiSettingsCard";
import { formatDistance, formatPrice } from "@/data/mockListings";
import { MapPin, Pencil, Phone, X } from "lucide-react";

type ProfileTab = "mine" | "saved";

export default function ProfilePage() {
  const { user, updateUser, listings, savedIds } = useVauto();
  const [tab, setTab] = useState<ProfileTab>("mine");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: user.name, city: user.city, phone: user.phone });

  const myListings = listings.filter((l) => l.sellerId === user.id);
  const savedListings = listings.filter((l) => savedIds.has(l.id));
  const shown = tab === "mine" ? myListings : savedListings;

  const saveProfile = () => {
    updateUser(draft);
    setEditing(false);
  };

  return (
    <AppShell variant="plain">
      <div className="flex flex-col items-center py-6">
        <Image
          src={user.avatar}
          alt={user.name}
          width={80}
          height={80}
          className="h-20 w-20 rounded-full ring-4 ring-[var(--vauto-blue)]/20"
        />
        {editing ? (
          <div className="mt-4 w-full space-y-2">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[var(--vauto-blue)]"
              placeholder="Vardas"
            />
            <input
              value={draft.city}
              onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[var(--vauto-blue)]"
              placeholder="Miestas"
            />
            <input
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[var(--vauto-blue)]"
              placeholder="Telefonas"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveProfile}
                className="flex-1 rounded-xl bg-[var(--vauto-blue)] py-2.5 text-sm font-medium text-white"
              >
                Išsaugoti
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-[var(--vauto-text-muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--vauto-text)]">
                {user.name}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setDraft({ name: user.name, city: user.city, phone: user.phone });
                  setEditing(true);
                }}
                className="rounded-full p-1.5 text-[var(--vauto-text-muted)] hover:bg-gray-100"
                aria-label="Redaguoti profilį"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-4 text-sm text-[var(--vauto-text-muted)]">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {user.city}
              </span>
              <span className="flex items-center gap-1">
                <Phone className="h-4 w-4" />
                {user.phone}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`rounded-2xl py-3 text-sm font-medium transition ${
            tab === "mine"
              ? "bg-[var(--vauto-orange)] text-white"
              : "bg-white text-[var(--vauto-text-muted)] card-shadow"
          }`}
        >
          Mano ({myListings.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("saved")}
          className={`rounded-2xl py-3 text-sm font-medium transition ${
            tab === "saved"
              ? "bg-[var(--vauto-blue)] text-white"
              : "bg-white text-[var(--vauto-text-muted)] card-shadow"
          }`}
        >
          Išsaugoti ({savedListings.length})
        </button>
      </div>

      <div className="space-y-2">
        {shown.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--vauto-text-muted)]">
            {tab === "mine" ? "Dar neturite skelbimų." : "Nėra išsaugotų skelbimų."}
          </p>
        )}
        {shown.map((listing) => (
          <Link
            key={listing.id}
            href={`/listing/?id=${listing.id}`}
            className="card-shadow flex gap-3 rounded-2xl bg-white p-3"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
              <Image
                src={listing.image}
                alt={listing.title}
                fill
                sizes="64px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-sm text-[var(--vauto-text)]">
                {listing.title}
              </p>
              <p className="text-sm font-bold text-[var(--vauto-orange)]">
                {formatPrice(listing.price, listing.priceLabel)}
              </p>
              <p className="text-xs text-[var(--vauto-text-muted)]">
                {listing.location} · {formatDistance(listing.distanceKm)}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <AiSettingsCard />

      <p className="mt-6 text-center text-xs text-[var(--vauto-text-muted)]">
        Kontaktinė informacija automatiškai užpildoma AI skelbimo kūrime.
      </p>
    </AppShell>
  );
}
