"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Heart,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Tag,
  EyeOff,
  Sparkles,
  Truck,
} from "lucide-react";
import { OrderWithShippingModal } from "@/components/shipping/OrderWithShippingModal";
import { ListingBuyerTipsModal } from "@/components/listing/ListingBuyerTipsModal";
import { listingOffersOmnivaShipping } from "@/lib/logistics-ready";
import { AppShell } from "@/components/AppShell";
import { ListingSeoHead } from "@/components/seo/ListingSeoHead";
import { ListingJsonLd } from "@/components/seo/ListingJsonLd";
import { ReportButton } from "@/components/support/ReportButton";
import { TrustBadges } from "@/components/trust/TrustBadges";
import { ListingImageGallery } from "@/components/listing/ListingImageGallery";
import { SafeMeetingTips } from "@/components/listing/SafeMeetingTips";
import { ShareListingPanel } from "@/components/social/ShareListingPanel";
import { OwnerListingPromote } from "@/components/listing/OwnerListingPromote";
import { SellerRatingBadge } from "@/components/listing/SellerRatingBadge";
import { SimilarListingsSection } from "@/components/listing/SimilarListingsSection";
import { formatListingPlaceLine, formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import { useVautoBridge } from "@/context/VautoBridge";
import { useSellerFlow } from "@/context/SellerFlowContext";
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
  resolveDisplayListingCategory,
  resolveListingPhone,
} from "@/lib/listing-display";
import {
  formatAiTagChip,
  getAiListingTagChips,
} from "@/lib/listing-dynamic-attributes";
import { LISTING_DWELL_MS } from "@/lib/offer-engine-client";
import {
  isAgentClarificationText,
  resolvePublishListingDescription,
  sanitizeListingDescription,
} from "@/lib/listing-text-sanitize";
import { computeVatBreakdown } from "@vauto/shared/vat-pricing";

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

/** Render marketplace description with newlines + lightweight **bold**. */
function ListingSalesDescription({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-semibold text-slate-800">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
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
    sendMessage,
    deleteListing,
    showToast,
    trackListingView,
    trackListingCall,
    reviews,
    listings,
    chameleonTheme,
  } = useVauto();
  const { startEditListingFlow } = useSellerFlow();
  const { hydrated } = useVautoBridge();
  const { trackEvent } = useUserBehavior();
  const dwellFiredRef = useRef(false);
  const [orderShippingOpen, setOrderShippingOpen] = useState(false);
  const [buyerTipsOpen, setBuyerTipsOpen] = useState(false);

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

  const displayCategory = listing ? resolveDisplayListingCategory(listing) : null;
  const wardrobeContext =
    chameleonTheme === "wardrobe" ||
    pathname === "/fashion" ||
    pathname === "/fashion/" ||
    displayCategory === "clothing";

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
        <div className="py-12 text-center">
          <p className="text-slate-500">Kraunama...</p>
        </div>
      </AppShell>
    );
  }

  if (!listing || listing.banned) {
    return (
      <AppShell variant="plain" hideNav>
        <div className="py-12 text-center">
          <p className="text-slate-500">Skelbimas nerastas.</p>
          <Link href="/" className="mt-4 inline-block text-sm text-[var(--vauto-teal)]">
            ← Grįžti į skelbimus
          </Link>
        </div>
      </AppShell>
    );
  }

  const isSaved = savedIds.has(listing.id);
  const isOwner =
    Boolean(user?.id) && user.id !== "guest" && listing.sellerId === user.id;
  const phone = resolveListingPhone(listing);
  const phoneDisplay = formatListingPhoneDisplay(phone);
  const phoneTel = listingPhoneTelHref(phone);
  const demoPhone = isDemoListingPhone(listing);
  const detailRows = getListingDetailRows(listing);
  const categoryLabel = getCategoryLabel(listing);
  const similarListings = getSimilarListings(listing, listings);
  const publicTags = getAiListingTagChips(
    listing.tags ?? [],
    displayCategory ?? listing.category
  );
  const aboutDescription = (() => {
    const raw = listing.description?.trim() ?? "";
    if (!raw || isAgentClarificationText(raw)) {
      return resolvePublishListingDescription({
        title: listing.title,
        price: listing.price,
        location: listing.location,
        contact: listing.contact ?? "",
        category: displayCategory ?? listing.category,
        confidence: 1,
        description: listing.description,
        attributes: listing.attributes,
      });
    }
    return sanitizeListingDescription(raw);
  })();

  const handleNegotiate = () => {
    if (isOwner) {
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
    const chatId = startChat(listing.id);
    if (chatId) router.push(chatThreadPath(chatId));
  };

  const handleChat = () => {
    if (isOwner) {
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
    window.location.href = phoneTel || `tel:${phone}`;
  };

  const handleMessage = handleChat;
  const offersOmnivaShipping = listingOffersOmnivaShipping(listing);

  const handleAskTip = (question: string) => {
    setBuyerTipsOpen(false);
    if (isOwner) {
      showToast("Tai jūsų skelbimas.", "info");
      return;
    }
    const chatId = startChat(listing.id);
    if (!chatId) return;
    // Seed greeting already sent by startChat; send the FAQ tip as follow-up.
    window.setTimeout(() => sendMessage(chatId, question), 40);
    router.push(chatThreadPath(chatId));
  };

  const handleEdit = () => {
    startEditListingFlow(listing);
  };

  const handleDelete = () => {
    if (
      confirm(
        "Paslėpti šį skelbimą? Jis dings iš katalogo, bet galėsite jį atkurti skiltyje „Mano skelbimai“."
      )
    ) {
      deleteListing(listing.id);
      router.push("/mano-skelbimai/");
    }
  };

  const messagePrimaryClass =
    "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-3 text-sm font-bold text-[var(--vauto-primary-contrast)] shadow-md shadow-[rgba(27,77,255,0.2)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70";
  const callSecondaryClass =
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--vauto-border-input)] bg-white px-3 text-sm font-bold text-[var(--vauto-ink)] shadow-sm transition hover:bg-[var(--vauto-surface-page)] disabled:cursor-not-allowed disabled:opacity-70";
  const iconActionClass =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--vauto-border-input)] bg-white text-[var(--vauto-ink)] shadow-sm transition hover:bg-[var(--vauto-surface-page)] disabled:cursor-not-allowed disabled:opacity-70";
  // Desktop column CTAs (full width)
  const callButtonClass =
    "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--vauto-border-input)] bg-white px-4 text-sm font-bold text-[var(--vauto-ink)] shadow-sm transition hover:bg-[var(--vauto-surface-page)] disabled:cursor-not-allowed disabled:opacity-70";
  const messageButtonClass =
    "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-4 text-sm font-bold text-[var(--vauto-primary-contrast)] shadow-md shadow-[rgba(27,77,255,0.2)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70";

  const vatCode = String(
    listing.attributes?.vatCode ?? listing.attributes?.vat_code ?? ""
  ).trim();
  const vatBreakdown = computeVatBreakdown(listing.price, vatCode);

  const titlePriceBlock = (
    <div>
      {categoryLabel ? (
        <span className="rounded-full bg-[var(--vauto-surface-page)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--vauto-body)]">
          {categoryLabel}
        </span>
      ) : null}
      <h1 className="mt-2 font-[family-name:var(--font-outfit)] text-xl font-bold leading-snug text-[var(--vauto-ink)]">
        {listing.title}
      </h1>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--vauto-ink)]">
        {formatPrice(listing.price, listing.priceLabel)}
      </p>
      {vatBreakdown.hasVat ? (
        <p
          className="mt-1 text-xs font-medium text-[var(--vauto-subtle)]"
          data-vat-line="1"
        >
          {vatBreakdown.labelGross} · {vatBreakdown.labelNet}
        </p>
      ) : null}
    </div>
  );

  const metaBlock = (
    <div className="space-y-2">
      <TrustBadges listing={listing} size="md" />
      <SellerRatingBadge sellerId={listing.sellerId} reviews={reviews} />
      <Link
        href={sellerPath(listing.sellerId)}
        className="inline-flex text-sm font-medium text-[var(--vauto-primary)] hover:underline"
      >
        {sellerDisplayName(listing.sellerId, { listing, user })} →
      </Link>
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--vauto-muted)]">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-4 w-4 shrink-0" />
          {formatListingPlaceLine(listing.location, listing.distanceKm)}
        </span>
        {listing.createdAt && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatPostedDate(listing.createdAt)}
          </span>
        )}
      </div>
    </div>
  );

  const desktopCtas = (
    <div className="mt-4 hidden flex-col gap-2 md:flex">
      {isOwner ? (
        <>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Taip matys pirkėjai — žinutės sau nesiunčiamos"
            className={messageButtonClass}
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            Rašyti žinutę
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Taip matys pirkėjai — jūsų skelbime skambutis neaktyvus"
            className={callButtonClass}
          >
            <Phone className="h-5 w-5" aria-hidden />
            Skambinti ({phoneDisplay})
          </button>
          <p className="text-center text-[11px] font-medium text-[var(--vauto-subtle)]">
            Peržiūra — taip pirkėjai matys kontaktų mygtukus
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={handleMessage}
            className={messageButtonClass}
            data-listing-message-cta="1"
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            Rašyti žinutę
          </button>
          {!demoPhone && phoneTel ? (
            <a
              href={phoneTel}
              onClick={() => trackListingCall(listing.id)}
              className={callButtonClass}
            >
              <Phone className="h-5 w-5" aria-hidden />
              Skambinti ({phoneDisplay})
            </a>
          ) : (
            <button type="button" onClick={handleCall} className={callButtonClass}>
              <Phone className="h-5 w-5" aria-hidden />
              Skambinti
            </button>
          )}
          {offersOmnivaShipping ? (
            <button
              type="button"
              onClick={() => setOrderShippingOpen(true)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--vauto-primary)]/40 bg-[var(--vauto-primary)]/8 px-4 text-sm font-bold text-[var(--vauto-primary)] transition hover:bg-[var(--vauto-primary)]/12"
              data-order-shipping-cta="1"
            >
              <Truck className="h-5 w-5" aria-hidden />
              Užsakyti su siuntimu
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setBuyerTipsOpen(true)}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-[var(--vauto-teal)] hover:bg-[var(--vauto-teal)]/8"
            data-listing-ai-tips="1"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            AI klausimai pardavėjui
          </button>
          {wardrobeContext ? (
            <button
              type="button"
              onClick={handleNegotiate}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-[var(--vauto-text-muted)] hover:bg-slate-50"
            >
              AI Derybininkas
            </button>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <AppShell variant="plain" hideNav>
      <ListingSeoHead listing={listing} />
      <ListingJsonLd listing={listing} />

      {/* Mobile-only back crumb — site DesktopHeader is the sole desktop chrome */}
      <nav className="mb-3 md:hidden" aria-label="Navigacija">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--vauto-muted)] transition hover:text-[var(--vauto-ink)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Skelbimai
        </Link>
      </nav>

      {isOwner && (
        <div
          className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-sm font-semibold text-amber-950"
          role="status"
        >
          Puslapio peržiūra (Jūsų skelbimas)
        </div>
      )}

      <div className="flex flex-col pb-24 md:pb-8">
        <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
          {/* Left: gallery + description */}
          <div className="min-w-0 lg:col-span-7">
            <ListingImageGallery
              listing={listing}
              topRightSlot={
                <button
                  type="button"
                  onClick={() => toggleSave(listing.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
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
              }
            />

            {/* Mobile title/price directly under gallery */}
            <div className="mt-4 lg:hidden">{titlePriceBlock}</div>

            {(aboutDescription || detailRows.length > 0) && (
              <section className="mt-6 rounded-2xl border border-[var(--vauto-border-subtle)] bg-white p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-[var(--vauto-ink)]">Apie skelbimą</h2>
                {aboutDescription ? (
                  <ListingSalesDescription text={aboutDescription} />
                ) : null}
                {detailRows.length > 0 && (
                  <dl
                    className={`mt-3 grid gap-2 ${
                      aboutDescription ? "border-t border-[var(--vauto-border-subtle)] pt-3" : ""
                    }`}
                  >
                    {detailRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex justify-between gap-4 rounded-xl border border-[var(--vauto-border-subtle)] bg-[var(--vauto-surface-page)] px-3 py-2.5 text-sm"
                      >
                        <dt className="text-[var(--vauto-subtle)]">{row.label}</dt>
                        <dd className="text-right font-semibold text-[var(--vauto-ink)]">
                          {row.value}
                        </dd>
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
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      {formatAiTagChip(tag)}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right: price, seller, desktop CTAs */}
          <aside className="mt-5 min-w-0 lg:col-span-5 lg:mt-0">
            <div className="lg:sticky lg:top-20 lg:rounded-2xl lg:border lg:border-[var(--vauto-border-subtle)] lg:bg-white lg:p-5 lg:shadow-[0_8px_30px_rgba(11,18,32,0.06)]">
              <div className="hidden lg:block">{titlePriceBlock}</div>
              {desktopCtas}
              <div className="mt-4">{metaBlock}</div>
            </div>
          </aside>
        </div>

        {isOwner && listing.status !== "sold" && (
          <section className="mt-6 space-y-3 rounded-2xl border border-[var(--vauto-border-subtle)] bg-[var(--vauto-surface-page)] p-4">
            <h2 className="text-sm font-bold tracking-wide text-[var(--vauto-ink)]">
              Savininko Valdymas
            </h2>
            <p className="text-xs text-[var(--vauto-muted)]">
              Šie mygtukai matomi tik jums — pirkėjai jų nemato.
            </p>
            <button
              type="button"
              onClick={handleEdit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] py-3 text-sm font-bold text-[var(--vauto-primary-contrast)] shadow-md transition hover:opacity-90"
            >
              <Pencil className="h-4 w-4" />
              Redaguoti
            </button>
            <OwnerListingPromote listing={listing} />
            <div className="rounded-2xl border border-[var(--vauto-border-subtle)] bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-[var(--vauto-ink)]">
                Papildoma reklama socialiniuose tinkluose
              </h3>
              <ShareListingPanel listing={listing} compact />
            </div>
            <button
              type="button"
              onClick={handleDelete}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              <EyeOff className="h-4 w-4" />
              Paslėpti skelbimą
            </button>
          </section>
        )}

        {!isOwner && <SafeMeetingTips />}

        <SimilarListingsSection listings={similarListings} />

        {!isOwner && (
          <div className="mt-6">
            <ReportButton
              listingId={listing.id}
              listingTitle={listing.title}
              reportedUserId={listing.sellerId}
            />
          </div>
        )}
      </div>

      {/* Sticky mobile contact bar — primary CTA = Rašyti žinutę */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-2 border-t border-[var(--vauto-border-subtle)] bg-white/95 p-3 shadow-lg backdrop-blur-md md:hidden">
        {isOwner ? (
          <>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className={messagePrimaryClass}
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              Rašyti žinutę
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className={callSecondaryClass}
            >
              <Phone className="h-5 w-5" aria-hidden />
              Skambinti
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleMessage}
              className={messagePrimaryClass}
              data-listing-message-cta="1"
            >
              <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
              Rašyti žinutę
            </button>
            {!demoPhone && phoneTel ? (
              <a
                href={phoneTel}
                onClick={() => trackListingCall(listing.id)}
                className={callSecondaryClass}
                aria-label="Skambinti"
              >
                <Phone className="h-5 w-5" aria-hidden />
                <span className="hidden xs:inline sm:inline">Skambinti</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={handleCall}
                className={callSecondaryClass}
                aria-label="Skambinti"
              >
                <Phone className="h-5 w-5" aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => setBuyerTipsOpen(true)}
              className={iconActionClass}
              aria-label="AI klausimai pardavėjui"
              title="AI klausimai pardavėjui"
              data-listing-ai-tips="1"
            >
              <Sparkles className="h-5 w-5 text-[var(--vauto-teal)]" aria-hidden />
            </button>
            {offersOmnivaShipping ? (
              <button
                type="button"
                onClick={() => setOrderShippingOpen(true)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--vauto-primary)]/40 bg-[var(--vauto-primary)]/10 text-[var(--vauto-primary)]"
                aria-label="Užsakyti su siuntimu"
                data-order-shipping-cta="1"
              >
                <Truck className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
          </>
        )}
      </div>

      {orderShippingOpen && listing && !isOwner ? (
        <OrderWithShippingModal
          listing={listing}
          onClose={() => setOrderShippingOpen(false)}
        />
      ) : null}

      {buyerTipsOpen && listing && !isOwner ? (
        <ListingBuyerTipsModal
          listing={listing}
          onClose={() => setBuyerTipsOpen(false)}
          onAsk={handleAskTip}
        />
      ) : null}
    </AppShell>
  );
}
