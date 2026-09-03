"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Heart,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  SearchX,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
  Handshake,
} from "lucide-react";
import { OrderWithShippingModal } from "@/components/shipping/OrderWithShippingModal";
import { ListingBuyerTipsModal } from "@/components/listing/ListingBuyerTipsModal";
import { listingOffersOmnivaShipping } from "@/lib/logistics-ready";
import { AppShell } from "@/components/AppShell";
import { ListingSeoHead } from "@/components/seo/ListingSeoHead";
import { ListingJsonLd } from "@/components/seo/ListingJsonLd";
import { ReportButton } from "@/components/support/ReportButton";
import { ListingImageGallery } from "@/components/listing/ListingImageGallery";
import { SafeMeetingTips } from "@/components/listing/SafeMeetingTips";
import { ListingDetailOwnerBar } from "@/components/listing/ListingDetailOwnerBar";
import { ListingDetailStickyPanel } from "@/components/listing/ListingDetailStickyPanel";
import { SimilarListingsSection } from "@/components/listing/SimilarListingsSection";
import { resolveAiPriceSignal } from "@/components/marketplace/ListingCard";
import { AiInsightCard, Badge, Card } from "@/design-system";
import { formatListingPlaceLine, formatPrice } from "@/data/mockListings";
import { apiFetchListingById } from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import { normalizeListing } from "@/lib/listing-normalize";
import type { Listing } from "@/lib/types";
import { useVauto } from "@/context/VautoContext";
import { useVautoBridge } from "@/context/VautoBridge";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { getSimilarListings } from "@/lib/similar-listings";
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

/** Render marketplace description with newlines + lightweight **bold**. */
function ListingSalesDescription({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ds-text-secondary,var(--vauto-body))]">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong
              key={i}
              className="font-semibold text-[var(--ds-text-primary,var(--vauto-ink))]"
            >
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
    markListingSold,
    showToast,
    trackListingView,
    trackListingCall,
    reviews,
    listings,
    chameleonTheme,
    isAuthenticated,
    openAuthModal,
  } = useVauto();
  const { startEditListingFlow } = useSellerFlow();
  const { hydrated } = useVautoBridge();
  const { trackEvent } = useUserBehavior();
  const dwellFiredRef = useRef(false);
  const [orderShippingOpen, setOrderShippingOpen] = useState(false);
  const [buyerTipsOpen, setBuyerTipsOpen] = useState(false);

  // F7 — unified list→detail data contract. The feed catalog is a LIMITED
  // slice (top-N / region); when the local lookup misses, the detail
  // hydrates the SAME public listing from the server by id/slug under the
  // same visibility rules. No per-listing exceptions; 404 means the listing
  // truly does not exist publicly.
  const [serverListing, setServerListing] = useState<Listing | null>(null);
  const [serverLookupFailed, setServerLookupFailed] = useState(false);
  useEffect(() => {
    setServerListing(null);
    setServerLookupFailed(false);
    if (!hydrated || !(id || slug)) return;
    const local = id ? findListing(id) : slug ? findListing(slug) : undefined;
    if (local || !isDataApiEnabled()) return;
    let cancelled = false;
    void apiFetchListingById(id ?? slug!).then((res) => {
      if (cancelled) return;
      if (res.ok) setServerListing(normalizeListing(res.data));
      else setServerLookupFailed(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, id, slug]);

  // Prefer stable id (dashboard links); fall back to slug for SEO/pretty URLs;
  // last resort: the server-side public listing fetch (limited-slice feed).
  const listing =
    (id ? findListing(id) : undefined) ??
    (slug ? findListing(slug) : undefined) ??
    serverListing;

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
        {/* F8 — full-height loading shell: the real detail content is tall;
            reserving the viewport height up front prevents the footer (and
            everything below) from shifting when content hydrates. */}
        <div className="flex min-h-[100dvh] items-center justify-center">
          <p className="text-[var(--ds-text-muted,var(--vauto-subtle))]">Kraunama...</p>
        </div>
      </AppShell>
    );
  }

  // Local lookup missed AND the server fallback is still in flight: keep the
  // loading state (never flash a false "not found").
  if (!listing && !serverLookupFailed && (id || slug) && isDataApiEnabled()) {
    return (
      <AppShell variant="plain" hideNav>
        <div className="flex min-h-[100dvh] items-center justify-center">
          <p className="text-[var(--ds-text-muted,var(--vauto-subtle))]">Kraunama...</p>
        </div>
      </AppShell>
    );
  }

  if (!listing || listing.banned) {
    return (
      <AppShell variant="plain" hideNav>
        <div className="flex min-h-[60dvh] items-center justify-center px-4 py-12">
          <div
            className="w-full max-w-md rounded-[var(--ds-radius-panel)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-8 text-center shadow-[var(--ds-shadow-sm)]"
            data-listing-not-found
          >
            <SearchX
              className="mx-auto mb-4 h-12 w-12 text-[var(--ds-text-muted)]"
              aria-hidden
            />
            <h1 className="font-[family-name:var(--font-outfit)] text-xl font-bold text-[var(--ds-text-primary)]">
              Skelbimas nerastas
            </h1>
            <p className="mt-2 text-sm text-[var(--ds-text-secondary)]">
              Šis skelbimas nebeegzistuoja arba buvo paslėptas pardavėjo.
              Peržiūrėkite kitus skelbimus arba grįžkite į pagrindinį puslapį.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-[var(--ds-radius-control)] bg-[var(--ds-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--ds-brand-contrast)] transition hover:bg-[var(--ds-brand-hover)]"
              >
                Grįžti į skelbimus
              </Link>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="inline-flex items-center justify-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-state-hover)]"
              >
                ← Atgal
              </button>
            </div>
          </div>
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
  const aiPrice = resolveAiPriceSignal(listing);
  const offersOmnivaShipping = listingOffersOmnivaShipping(listing);

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

  const handleStartDeal = () => {
    if (isOwner) {
      showToast("Tai jūsų skelbimas.", "info");
      return;
    }
    if (!isAuthenticated) {
      openAuthModal(`/sandoriai/?listingId=${encodeURIComponent(listing.id)}`);
      return;
    }
    router.push(`/sandoriai/?listingId=${encodeURIComponent(listing.id)}`);
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

  const handleMarkSold = () => {
    if (
      confirm(
        "Pažymėti skelbimą kaip parduotą? Jis nebebus rodomas kataloge."
      )
    ) {
      markListingSold(listing.id);
      showToast("Skelbimas pažymėtas kaip parduotas.", "success");
    }
  };

  const messagePrimaryClass =
    "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--ds-brand,var(--vauto-primary))] px-3 text-sm font-bold text-[var(--ds-brand-contrast,var(--vauto-primary-contrast))] shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70";
  const callSecondaryClass =
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--ds-border-strong,var(--vauto-border-input))] bg-[var(--ds-surface-card,#fff)] px-3 text-sm font-bold text-[var(--ds-text-primary,var(--vauto-ink))] shadow-sm transition hover:bg-[var(--ds-surface-muted,var(--vauto-surface-page))] disabled:cursor-not-allowed disabled:opacity-70";
  const iconActionClass =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--ds-border-strong,var(--vauto-border-input))] bg-[var(--ds-surface-card,#fff)] text-[var(--ds-text-primary,var(--vauto-ink))] shadow-sm transition hover:bg-[var(--ds-surface-muted,var(--vauto-surface-page))] disabled:cursor-not-allowed disabled:opacity-70";

  const vatCode = String(
    listing.attributes?.vatCode ?? listing.attributes?.vat_code ?? ""
  ).trim();
  const vatBreakdown = computeVatBreakdown(listing.price, vatCode);
  const vatLine = vatBreakdown.hasVat ? (
    <p
      className="mt-1 text-xs font-medium text-[var(--ds-text-muted,var(--vauto-subtle))]"
      data-vat-line="1"
    >
      {vatBreakdown.labelGross} · {vatBreakdown.labelNet}
    </p>
  ) : null;

  const mobileTitleBlock = (
    <div>
      {categoryLabel ? (
        <Badge tone="category">{categoryLabel}</Badge>
      ) : null}
      <h1 className="mt-2 font-[family-name:var(--font-outfit)] text-xl font-bold leading-snug text-[var(--ds-text-primary,var(--vauto-ink))]">
        {listing.title}
      </h1>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--ds-brand,var(--vauto-ink))]">
        {formatPrice(listing.price, listing.priceLabel)}
      </p>
      {vatLine}
      {!isOwner ? (
        <div className="mt-3">
          {aiPrice ? (
            <AiInsightCard
              title={aiPrice.label}
              body={
                aiPrice.label === "Gera kaina"
                  ? "Pagal panašius skelbimus ši kaina atrodo patraukli pirkėjui."
                  : aiPrice.label === "Rinkos mediana"
                    ? "Kaina artima rinkos viduriui — derėtis galima, bet vertė aiški."
                    : "AI įvertino šį skelbimą pagal nuotrauką ir aprašymą — tai rekomendacija, ne garantija."
              }
              ctaLabel="AI klausimai"
              onCta={() => setBuyerTipsOpen(true)}
              className="p-3"
            />
          ) : (
            <AiInsightCard
              title="Paklauskite AI"
              body="Gaukite saugius klausimus pardavėjui — kainą, būklę, pristatymą."
              ctaLabel="AI klausimai"
              onCta={() => setBuyerTipsOpen(true)}
              className="p-3"
            />
          )}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {offersOmnivaShipping ? (
          <Badge tone="success" className="gap-1">
            <Package className="mr-1 inline h-3 w-3" aria-hidden />
            Omniva
          </Badge>
        ) : null}
        <Badge tone="info" className="gap-1">
          <ShieldCheck className="mr-1 inline h-3 w-3" aria-hidden />
          Sandorio eiga per platformą
        </Badge>
      </div>
      {offersOmnivaShipping ? (
        <p
          className="mt-2 text-xs leading-relaxed text-[var(--ds-text-muted,var(--vauto-subtle))] lg:hidden"
          data-omniva-hint
        >
          Siuntos būseną atnaujina Omniva. Sandorio „Išsiųsta“ — po vežėjo
          skenavimo. Lėšos laikomos, kol patvirtinate gavimą.
        </p>
      ) : null}
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
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--ds-text-muted,var(--vauto-muted))] transition hover:text-[var(--ds-text-primary,var(--vauto-ink))]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Skelbimai
        </Link>
      </nav>

      {isOwner ? (
        <ListingDetailOwnerBar
          listing={listing}
          onEdit={handleEdit}
          onMarkSold={handleMarkSold}
          onHide={handleDelete}
          onAiOptimize={handleEdit}
        />
      ) : null}

      <div
        className="flex flex-col pb-24 md:pb-8"
        data-listing-detail-2
      >
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
            <div className="mt-4 lg:hidden">{mobileTitleBlock}</div>

            {(aboutDescription || detailRows.length > 0) && (
              <Card variant="default" className="mt-6">
                <section aria-labelledby="listing-about-heading">
                  <h2
                    id="listing-about-heading"
                    className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-[var(--ds-text-primary,var(--vauto-ink))]"
                  >
                    Apie skelbimą
                  </h2>
                  {aboutDescription ? (
                    <ListingSalesDescription text={aboutDescription} />
                  ) : null}
                  {detailRows.length > 0 && (
                    <dl
                      className={`mt-4 grid gap-2 sm:grid-cols-2 ${
                        aboutDescription
                          ? "border-t border-[var(--ds-border-subtle,var(--vauto-border-subtle))] pt-4"
                          : ""
                      }`}
                    >
                      {detailRows.map((row) => (
                        <div
                          key={row.label}
                          className="flex justify-between gap-4 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle,var(--vauto-border-subtle))] bg-[var(--ds-surface-muted,var(--vauto-surface-page))] px-3 py-2.5 text-sm"
                        >
                          <dt className="text-[var(--ds-text-muted,var(--vauto-subtle))]">
                            {row.label}
                          </dt>
                          <dd className="text-right font-semibold text-[var(--ds-text-primary,var(--vauto-ink))]">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              </Card>
            )}

            <Card variant="muted" className="mt-4">
              <section aria-labelledby="listing-location-heading">
                <h2
                  id="listing-location-heading"
                  className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-[var(--ds-text-primary,var(--vauto-ink))]"
                >
                  Vietovė
                </h2>
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--ds-text-secondary,var(--vauto-body))]">
                  <MapPin
                    className="h-4 w-4 shrink-0 text-[var(--ds-brand,var(--vauto-primary))]"
                    aria-hidden
                  />
                  {formatListingPlaceLine(listing.location, listing.distanceKm)}
                </p>
                {listing.latitude != null && listing.longitude != null ? (
                  <p className="mt-1 text-xs text-[var(--ds-text-muted,var(--vauto-subtle))]">
                    Koordinatės patvirtintos skelbimo publikuojant
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[var(--ds-text-muted,var(--vauto-subtle))]">
                    Tikslus adresas dalijamasi susitarus su pardavėju
                  </p>
                )}
              </section>
            </Card>

            {publicTags.length > 0 && (
              <section className="mt-4">
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted,var(--vauto-subtle))]">
                  <Tag className="h-3.5 w-3.5" />
                  Žymos
                </h2>
                <div className="flex flex-wrap gap-2">
                  {publicTags.map((tag) => (
                    <Badge key={tag} tone="category">
                      {formatAiTagChip(tag)}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right: sticky buyer / contact panel (desktop) */}
          <aside className="mt-5 min-w-0 lg:col-span-5 lg:mt-0">
            <ListingDetailStickyPanel
              listing={listing}
              categoryLabel={categoryLabel}
              isOwner={isOwner}
              phoneDisplay={phoneDisplay}
              phoneTel={phoneTel}
              demoPhone={demoPhone}
              offersOmnivaShipping={offersOmnivaShipping}
              wardrobeContext={wardrobeContext}
              reviews={reviews}
              currentUser={user}
              vatLine={vatLine}
              onMessage={handleMessage}
              onCall={handleCall}
              onTrackCall={() => trackListingCall(listing.id)}
              onOpenShipping={() => setOrderShippingOpen(true)}
              onOpenTips={() => setBuyerTipsOpen(true)}
              onNegotiate={handleNegotiate}
              onStartDeal={handleStartDeal}
            />
          </aside>
        </div>

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
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-2 border-t border-[var(--ds-border-subtle,var(--vauto-border-subtle))] bg-[color-mix(in_srgb,var(--ds-surface-card,#fff)_95%,transparent)] p-3 shadow-lg backdrop-blur-md md:hidden">
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
              <Sparkles className="h-5 w-5 text-[var(--ds-ai-strong,var(--vauto-teal))]" aria-hidden />
            </button>
            {offersOmnivaShipping ? (
              <button
                type="button"
                onClick={() => setOrderShippingOpen(true)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--ds-brand,var(--vauto-primary))]/40 bg-[var(--ds-brand-soft,rgba(27,77,255,0.1))] text-[var(--ds-brand,var(--vauto-primary))]"
                aria-label="Užsakyti su siuntimu"
                data-order-shipping-cta="1"
              >
                <Truck className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleStartDeal}
              className={iconActionClass}
              aria-label="Pradėti sandorio eigą"
              title="Pradėti sandorio eigą"
              data-start-deal-cta="1"
            >
              <Handshake className="h-5 w-5" aria-hidden />
            </button>
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
