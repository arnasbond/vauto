"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  Calendar,
  Heart,
  MapPin,
  MessageCircle,
  Phone,
  Tag,
  Trash2,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ListingSeoHead } from "@/components/seo/ListingSeoHead";
import { ReportButton } from "@/components/support/ReportButton";
import { TrustBadges } from "@/components/trust/TrustBadges";
import { ListingImageGallery } from "@/components/listing/ListingImageGallery";
import { SafeMeetingTips } from "@/components/listing/SafeMeetingTips";
import { ShareListingPanel } from "@/components/social/ShareListingPanel";
import { OwnerListingPromote } from "@/components/listing/OwnerListingPromote";
import { SellerRatingBadge } from "@/components/listing/SellerRatingBadge";
import { SimilarListingsSection } from "@/components/listing/SimilarListingsSection";
import { formatDistanceBadge, formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import { useVautoBridge } from "@/context/VautoBridge";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { getSimilarListings } from "@/lib/similar-listings";
import { sellerDisplayName } from "@/lib/seller-display";
import { sellerPath } from "@/lib/seo";
import { chatThreadPath } from "@/lib/chat-routes";
import {
  formatListingPhoneDisplay,
  getCategoryLabel,
  getListingDetailRows,
  isDemoListingPhone,
  listingPhoneTelHref,
  resolveListingPhone,
} from "@/lib/listing-display";
import { filterPublicListingTags } from "@/lib/listing-attributes";
import { LISTING_DWELL_MS } from "@/lib/offer-engine-client";
import {
  isAgentClarificationText,
  resolvePublishListingDescription,
  sanitizeListingDescription,
} from "@/lib/listing-text-sanitize";

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
  const pathname = usePathname();
  const id = searchParams.get("id")?.trim() || undefined;
  const slugFromQuery = searchParams.get("slug")?.trim() || undefined;
  const slugFromPath = (() => {
    const m = pathname.match(/\/listing\/([^/]+)\/?$/);
    const segment = m?.[1];
    if (!segment || segment === "listing") return undefined;
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  })();
  const slug = slugProp ?? slugFromQuery ?? slugFromPath ?? undefined;
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
    reviews,
    listings,
    chameleonTheme,
  } = useVauto();
  const { hydrated } = useVautoBridge();
  const { trackEvent } = useUserBehavior();
  const dwellFiredRef = useRef(false);

  // Prefer stable id (dashboard links); fall back to slug for SEO/pretty URLs.
  const listing =
    (id ? findListing(id) : undefined) ??
    (slug ? findListing(slug) : undefined);

  useEffect(() => {
    if (listing?.id && !listing.banned) {
      trackListingView(listing.id);
      trackEvent("listing_view", {
        listingId: listing.id,
        title: listing.title,
        category: listing.category,
        price: listing.price,
      });
    }
  }, [listing?.id, listing?.banned, listing?.title, listing?.category, listing?.price, trackListingView, trackEvent]);

  const wardrobeContext =
    chameleonTheme === "wardrobe" ||
    pathname === "/fashion" ||
    pathname === "/fashion/" ||
    listing?.category === "clothing";

  useEffect(() => {
    dwellFiredRef.current = false;
    if (!listing?.id || listing.banned || !wardrobeContext) return;
    const timer = window.setTimeout(() => {
      if (dwellFiredRef.current) return;
      dwellFiredRef.current = true;
      trackEvent("listing_dwell", {
        listingId: listing.id,
        title: listing.title,
        category: listing.category,
        price: listing.price,
        dwellMs: LISTING_DWELL_MS,
      });
    }, LISTING_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [listing?.id, listing?.banned, listing?.title, listing?.category, listing?.price, wardrobeContext, trackEvent]);

  if (!hydrated) {
    return (
      <AppShell variant="plain" hideNav>
        <div className="px-4 py-12 text-center">
          <p className="text-slate-500">Kraunama...</p>
        </div>
      </AppShell>
    );
  }

  if (!listing || listing.banned) {
    return (
      <AppShell variant="plain" hideNav>
        <div className="px-4 py-12 text-center">
          <p className="text-slate-500">Skelbimas nerastas.</p>
          <Link href="/" className="mt-4 inline-block text-sm text-[var(--vauto-teal)]">
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
  const phoneTel = listingPhoneTelHref(phone);
  const demoPhone = isDemoListingPhone(listing);
  const detailRows = getListingDetailRows(listing);
  const categoryLabel = getCategoryLabel(listing);
  const similarListings = getSimilarListings(listing, listings);
  const publicTags = filterPublicListingTags(listing.tags);
  const aboutDescription = (() => {
    const raw = listing.description?.trim() ?? "";
    if (!raw || isAgentClarificationText(raw)) {
      return resolvePublishListingDescription({
        title: listing.title,
        price: listing.price,
        location: listing.location,
        contact: listing.contact ?? "",
        category: listing.category,
        confidence: 1,
        description: listing.description,
        attributes: listing.attributes,
      });
    }
    return sanitizeListingDescription(raw);
  })();

  const handleNegotiate = () => {
    if (isOwn) {
      showToast("Tai jūsų skelbimas.", "info");
      return;
    }
    trackEvent("negotiate_click", {
      listingId: listing.id,
      title: listing.title,
      category: listing.category,
      price: listing.price,
      wardrobeMode: wardrobeContext,
    });
  };

  const handleChat = () => {
    if (isOwn) {
      showToast("Tai jūsų skelbimas — negalite rašyti sau.", "info");
      return;
    }
    const chatId = startChat(listing.id);
    if (chatId) router.push(chatThreadPath(chatId));
  };

  const handleCall = () => {
    trackListingCall(listing.id);
    if (demoPhone) {
      showToast("Demo režimas: kontaktas nerodomas. Prisijunkite arba naudokite chat.", "info");
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const handleDelete = () => {
    if (confirm("Ištrinti šį skelbimą?")) {
      deleteListing(listing.id);
      router.push("/profile/");
    }
  };

  return (
    <AppShell variant="plain" hideNav>
      <ListingSeoHead listing={listing} />
      <div className="flex flex-col px-4 pb-8 pt-2">
        <div className="relative w-full overflow-hidden rounded-2xl bg-black/20">
          <ListingImageGallery listing={listing} />
          <Link
            href="/"
            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
            aria-label="Grįžti į paiešką"
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
          <span className="rounded-full bg-[var(--vauto-teal)]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--vauto-teal)]">
            {categoryLabel}
          </span>
          <h1 className="mt-2 font-display text-xl font-bold text-slate-900">
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
          <Link
            href={sellerPath(listing.sellerId)}
            className="mt-2 inline-flex text-sm font-medium text-[var(--vauto-teal)] hover:underline"
          >
            {sellerDisplayName(listing.sellerId, { listing, user })} →
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
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
            {!demoPhone && phoneTel ? (
              <a
                href={phoneTel}
                onClick={() => trackListingCall(listing.id)}
                className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--vauto-orange)] py-4 text-base font-bold text-white shadow-lg shadow-[var(--vauto-orange)]/30 transition hover:brightness-110"
              >
                <Phone className="h-6 w-6" />
                Skambinti ·{" "}
                <span className="font-semibold underline decoration-white/40 underline-offset-2">
                  {phoneDisplay}
                </span>
              </a>
            ) : (
              <button
                type="button"
                onClick={handleCall}
                className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--vauto-orange)] py-4 text-base font-bold text-white shadow-lg shadow-[var(--vauto-orange)]/30 transition hover:brightness-110"
              >
                <Phone className="h-6 w-6" />
                Skambinti
              </button>
            )}
            <button
              type="button"
              onClick={handleChat}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--vauto-primary)] py-3.5 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] shadow-md transition hover:opacity-95"
            >
              <MessageCircle className="h-5 w-5" />
              💬 Rašyti žinutę
            </button>
            {wardrobeContext && (
              <button
                type="button"
                onClick={handleNegotiate}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 py-3 text-sm font-semibold text-fuchsia-900"
              >
                <Sparkles className="h-5 w-5 text-fuchsia-600" />
                Derėtis su AI
              </button>
            )}
          </div>
        )}

        {!isOwn && !demoPhone && phoneTel && (
          <p className="mt-2 text-center">
            <a
              href={phoneTel}
              className="text-sm font-semibold text-blue-600 hover:underline"
            >
              {phoneDisplay}
            </a>
          </p>
        )}

        {(aboutDescription || detailRows.length > 0) && (
          <section className="vauto-glass-card mt-6 rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-slate-900">Apie skelbimą</h2>
            {aboutDescription && (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {aboutDescription}
              </p>
            )}
            {detailRows.length > 0 && (
              <dl className={`mt-3 grid gap-2 ${aboutDescription ? "border-t border-slate-100 pt-3" : ""}`}>
                {detailRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between gap-4 text-sm"
                  >
                    <dt className="text-slate-500">{row.label}</dt>
                    <dd className="text-right font-medium text-slate-900">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}

        {publicTags.length > 0 && (
          <section className="mt-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Tag className="h-3.5 w-3.5" />
              Žymos
            </h2>
            <div className="flex flex-wrap gap-2">
              {publicTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}

        {!isOwn && <SafeMeetingTips />}

        <SimilarListingsSection listings={similarListings} />

        <div className="mt-6 flex flex-col gap-3">
          {isOwn && listing.status !== "sold" && (
            <OwnerListingPromote listing={listing} />
          )}
          {isOwn && listing.status !== "sold" && (
            <section className="vauto-glass-card rounded-2xl p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">
                Papildoma reklama socialiniuose tinkluose
              </h2>
              <ShareListingPanel listing={listing} compact />
            </section>
          )}
          {isOwn && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 py-3.5 text-sm font-medium text-red-700"
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
