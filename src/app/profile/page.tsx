"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useVauto } from "@/context/VautoContext";
import { AiSettingsCard } from "@/components/AiSettingsCard";
import { formatDistance, formatPrice } from "@/data/mockListings";
import {
  formatExpiryLabel,
  isListingActive,
} from "@/lib/listing-expiry";
import type { Listing } from "@/lib/types";
import { MapPin, Pencil, Phone, RefreshCw, Smartphone, Trash2, X } from "lucide-react";

type ProfileTab = "mine" | "saved";

function ProfileListingRow({
  listing,
  isMine,
  onDelete,
  onRenew,
}: {
  listing: Listing;
  isMine: boolean;
  onDelete?: () => void;
  onRenew?: () => void;
}) {
  const expired = !isListingActive(listing);
  const expiryLabel = formatExpiryLabel(listing);

  return (
    <div className="card-shadow flex gap-3 rounded-2xl bg-white p-3">
      <Link
        href={`/listing/?id=${listing.id}`}
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl"
      >
        <Image
          src={listing.image}
          alt={listing.title}
          fill
          sizes="64px"
          className={`object-cover ${expired ? "opacity-60" : ""}`}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/listing/?id=${listing.id}`}>
          <p className="truncate font-semibold text-sm text-[var(--vauto-text)]">
            {listing.title}
          </p>
          <p className="text-sm font-bold text-[var(--vauto-orange)]">
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
          <p className="text-xs text-[var(--vauto-text-muted)]">
            {listing.location} · {formatDistance(listing.distanceKm)}
          </p>
        </Link>
        {expiryLabel && (
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
              expired
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {expiryLabel}
          </span>
        )}
        {isMine && (
          <div className="mt-2 flex gap-2">
            {expired && onRenew && (
              <button
                type="button"
                onClick={onRenew}
                className="flex items-center gap-1 rounded-lg bg-[var(--vauto-blue)]/10 px-2.5 py-1 text-xs font-medium text-[var(--vauto-blue)]"
              >
                <RefreshCw className="h-3 w-3" />
                Pratęsti
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600"
              >
                <Trash2 className="h-3 w-3" />
                Ištrinti
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateUser, listings, savedIds, deleteListing, renewListing } =
    useVauto();
  const [tab, setTab] = useState<ProfileTab>("mine");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: user.name,
    city: user.city,
    phone: user.phone,
  });

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
                  setDraft({
                    name: user.name,
                    city: user.city,
                    phone: user.phone,
                  });
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
            {tab === "mine"
              ? "Dar neturite skelbimų."
              : "Nėra išsaugotų skelbimų."}
          </p>
        )}
        {shown.map((listing) => (
          <ProfileListingRow
            key={listing.id}
            listing={listing}
            isMine={tab === "mine"}
            onDelete={
              tab === "mine"
                ? () => {
                    if (confirm("Ištrinti šį skelbimą?")) deleteListing(listing.id);
                  }
                : undefined
            }
            onRenew={
              tab === "mine" ? () => void renewListing(listing.id) : undefined
            }
          />
        ))}
      </div>

      <AiSettingsCard />

      <Link
        href="/install/"
        className="card-shadow mt-4 flex items-center gap-3 rounded-2xl bg-white p-4 transition active:scale-[0.99]"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--vauto-blue)]/10 text-[var(--vauto-blue)]">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-[var(--vauto-text)]">
            Įdiekite programėlę
          </p>
          <p className="text-xs text-[var(--vauto-text-muted)]">
            Atsisiųskite Android APK į telefoną
          </p>
        </div>
      </Link>

      <p className="mt-6 text-center text-xs text-[var(--vauto-text-muted)]">
        Skelbimai galioja 90 dienų. Pasibaigus — pratęskite profilyje.
      </p>
    </AppShell>
  );
}
