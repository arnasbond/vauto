"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  MapPin,
  MessageCircle,
  Phone,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatDistance, formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";

export function ListingDetailPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const router = useRouter();
  const {
    listings,
    user,
    savedIds,
    toggleSave,
    startChat,
    deleteListing,
  } = useVauto();

  const listing = listings.find((l) => l.id === id);

  if (!id || !listing) {
    return (
      <AppShell variant="plain">
        <p className="py-12 text-center text-[var(--vauto-text-muted)]">
          Skelbimas nerastas.
        </p>
        <Link
          href="/"
          className="mx-auto block text-center text-sm text-[var(--vauto-blue)]"
        >
          Grįžti į paiešką
        </Link>
      </AppShell>
    );
  }

  const isSaved = savedIds.has(listing.id);
  const isOwn = listing.sellerId === user.id;
  const phone = listing.contact?.replace(/[^\d+]/g, "") ?? "";

  const handleChat = () => {
    const chatId = startChat(listing.id);
    if (chatId) router.push(`/chats/thread/?id=${chatId}`);
  };

  const handleDelete = () => {
    if (confirm("Ištrinti šį skelbimą?")) {
      deleteListing(listing.id);
      router.push("/profile/");
    }
  };

  return (
    <AppShell variant="plain" hideNav>
      <div className="flex flex-col">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gray-100">
          <Image
            src={listing.image}
            alt={listing.title}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
          <Link
            href="/"
            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={() => toggleSave(listing.id)}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
            aria-label={isSaved ? "Pašalinti iš mėgstamų" : "Išsaugoti"}
          >
            <Heart
              className={`h-5 w-5 ${
                isSaved
                  ? "fill-[var(--vauto-red)] text-[var(--vauto-red)]"
                  : "text-white"
              }`}
            />
          </button>
        </div>

        <div className="mt-4">
          <h1 className="text-xl font-bold text-[var(--vauto-text)]">
            {listing.title}
          </h1>
          <p className="mt-1 text-2xl font-bold text-[var(--vauto-orange)]">
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
          <div className="mt-2 flex items-center gap-1 text-sm text-[var(--vauto-text-muted)]">
            <MapPin className="h-4 w-4 shrink-0" />
            {listing.location} · {formatDistance(listing.distanceKm)}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {!isOwn && (
            <>
              <button
                type="button"
                onClick={handleChat}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--vauto-blue)] py-3.5 text-sm font-semibold text-white"
              >
                <MessageCircle className="h-5 w-5" />
                Rašyti pardavėjui
              </button>
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 py-3.5 text-sm font-semibold text-[var(--vauto-text)]"
                >
                  <Phone className="h-5 w-5" />
                  Skambinti
                </a>
              )}
            </>
          )}
          {isOwn && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 py-3.5 text-sm font-medium text-red-500"
            >
              <Trash2 className="h-4 w-4" />
              Ištrinti skelbimą
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
