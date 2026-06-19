"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  ArrowLeft,
  Calendar,
  Heart,
  MapPin,
  MessageCircle,
  Phone,
  Tag,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ListingSeoHead } from "@/components/seo/ListingSeoHead";
import { ReportButton } from "@/components/support/ReportButton";
import { TrustBadges } from "@/components/trust/TrustBadges";
import { SafeMeetingTips } from "@/components/listing/SafeMeetingTips";
import { SellerRatingBadge } from "@/components/listing/SellerRatingBadge";
import { formatDistanceBadge, formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import {
  formatListingPhoneDisplay,
  getCategoryLabel,
  getListingDetailRows,
  resolveListingPhone,
} from "@/lib/listing-display";

interface ListingDetailPageProps {
  slug?: string;
}

function formatPostedDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("lt-LT", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ListingDetailPage({ slug: slugProp }: ListingDetailPageProps = {}) {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const slug = slugProp ?? searchParams.get("slug") ?? undefined;
  const router = useRouter();
  const {
    findListing,
    user,
    savedIds,
    toggleSave,
    startChat,
    deleteListing,
    showToast,
    trackListingView,
    trackListingCall,
    queueReviewPrompt,
    reviews,
  } = useVauto();

  const listing = slug
    ? findListing(slug)
    : id
      ? findListing(id)
      : undefined;

  useEffect(() => {
    if (listing?.id && !listing.banned) trackListingView(listing.id);
  }, [listing?.id, listing?.banned, trackListingView]);

  if (!listing || listing.banned) {
    return (
      <AppShell hideNav>
        <div className="px-4 py-12 text-center">
          <p className="text-[var(--vauto-text-muted)]">Skelbimas nerastas.</p>
          <Link href="/" className="mt-4 inline-block text-sm text-[var(--flux-teal)]">
            Grįžti į paiešką
          </Link>
        </div>
      </AppShell>
    );
  }

  const isSaved = savedIds.has(listing.id);
  const isOwn = listing.sellerId === user.id;
  const phone = resolveListingPhone(listing);
  const phoneDisplay = formatListingPhoneDisplay(phone);
  const detailRows = getListingDetailRows(listing);
  const categoryLabel = getCategoryLabel(listing);

  const handleChat = () => {
    if (isOwn) {
      showToast("Tai jūsų skelbimas — negalite rašyti sau.", "info");
      return;
    }
    const chatId = startChat(listing.id);
    if (chatId) router.push(`/chats/thread/?id=${chatId}`);
  };

  const handleCall = () => {
    trackListingCall(listing.id);
    queueReviewPrompt({
      listingId: listing.id,
      listingTitle: listing.title,
      sellerId: listing.sellerId,
      delayMs: 6000,
    });
    window.location.href = `tel:${phone}`;
  };

  const handleDelete = () => {
    if (confirm("Ištrinti šį skelbimą?")) {
      deleteListing(listing.id);
      router.push("/profile/");
    }
  };

  return (
    <AppShell hideNav>
      <ListingSeoHead listing={listing} />
      <div className="flex flex-col px-4 pb-8 pt-2">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black/20">
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
          <span className="rounded-full bg-[var(--flux-teal)]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--flux-teal)]">
            {categoryLabel}
          </span>
          <h1 className="mt-2 font-display text-xl font-bold text-white">
            {listing.title}
          </h1>
          <p className="vauto-flux-price mt-1 text-2xl">
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
          <div className="mt-2">
            <TrustBadges listing={listing} size="md" />
          </div>
          <SellerRatingBadge
            sellerId={listing.sellerId}
            reviews={reviews}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--vauto-text-muted)]">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4 shrink-0" />
              {listing.location} · {formatDistanceBadge(listing.distanceKm)}
            </span>
            {listing.createdAt && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatPostedDate(listing.createdAt)}
              </span>
            )}
          </div>
        </div>

        {!isOwn && (
          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleCall}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--vauto-orange)] py-4 text-base font-bold text-white shadow-lg shadow-[var(--vauto-orange)]/30 transition hover:brightness-110"
            >
              <Phone className="h-6 w-6" />
              Skambinti
            </button>
            <button
              type="button"
              onClick={handleChat}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white"
            >
              <MessageCircle className="h-5 w-5" />
              Rašyti pardavėjui
            </button>
          </div>
        )}

        <p className="mt-2 text-center text-xs text-white/40">
          {phoneDisplay}
        </p>

        {(listing.description || detailRows.length > 0) && (
          <section className="vauto-glass-card mt-6 rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-white">Apie skelbimą</h2>
            {listing.description && (
              <p className="mt-2 text-sm leading-relaxed text-[var(--vauto-text-muted)]">
                {listing.description}
              </p>
            )}
            {detailRows.length > 0 && (
              <dl className={`mt-3 grid gap-2 ${listing.description ? "border-t border-white/5 pt-3" : ""}`}>
                {detailRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between gap-4 text-sm"
                  >
                    <dt className="text-[var(--vauto-text-muted)]">{row.label}</dt>
                    <dd className="text-right font-medium text-white">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}

        {listing.tags.length > 0 && (
          <section className="mt-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
              <Tag className="h-3.5 w-3.5" />
              Žymos
            </h2>
            <div className="flex flex-wrap gap-2">
              {listing.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[var(--vauto-text-muted)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}

        {!isOwn && <SafeMeetingTips />}

        <div className="mt-6 flex flex-col gap-3">
          {isOwn && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 py-3.5 text-sm font-medium text-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Ištrinti skelbimą
            </button>
          )}
          {!isOwn && (
            <ReportButton
              listingId={listing.id}
              listingTitle={listing.title}
              reportedUserId={listing.sellerId}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
