# VAUTO Stage 20B — Migration Route Matrix (detali)

## Tikslas

Detaliai aprašyti, kurie realūs produkto maršrutai/paviršiai buvo
vizualiai migruoti į Design System 2.0 emerald brand šio etapo metu.

## Maršrutų lentelė

| ID | Maršrutas | Prioritetas | Screenshot | Migracijos objektai |
|---|---|---|---|---|
| R-01 | `/` (Homepage) | P0 | ✅ 4 | HomeAiHero, HotKeywordsGrid, hero gradient, AI įėjimo taškas |
| R-02 | `/search/` | P0 | ✅ 4 | MarketplaceFilterBar, FilterBubbles, VisualSearchStrip, AiCommandBar, ListingGrid/ListingCard priceColor |
| R-03 | `/listing/?id=lt-auto-016` | P0 | ✅ 4 | TrustBadges, SellerTrustCard, AiTrustScoreBanner |
| R-04 | `/discover/` | P0 | ✅ 4 | Discover informaciniai blokai, AI akcentai |
| R-05 | `/add/` | P1 | ✅ 4 | PhotoSourceSheet, AiIntroModal, PrePublishModal, ListingPublishSocialOptions, PhotoCategoryMismatchBanner |
| R-06 | `/chats/` | P1 | ✅ 4 | ChatThreadView, BuddyAvatar, BuddyQuickActions, EscrowActionBlock |
| R-07 | `/sandoriai/` | P1 | ✅ 4 | EscrowModal, EscrowActionBlock, ParcelLockerPicker, Barcode/VehicleLookup |
| R-08 | `/profile/` | P1 | ✅ 4 | WishlistSection, ProfileSettingsMenu, ProListingCard, dashboard kortelės |
| R-09 | `/apie/` | P1 | ✅ 4 | About ikonos, gradientai, CTA |
| R-10 | `/registracija/` | P1 | ✅ 4 | Gėlės/promo elementai |
| R-11 | `/install/` | P1 | ✅ 4 | Install paviršius |
| R-12 | `/ui-kit/` | P1 | ✅ 4 | UiKitPage (reference paviršius) |

## Komponentų migracijos žemėlapis (Wave pagal)

| Wave | Komponentai/failai |
|---|---|
| Wave 1 (shell) | AppHeader, NativeShell, ToastHost, NotificationBell, AudioWaveAnimation |
| Wave 2 (home) | HomeAiHero, HotKeywordsGrid, PrePublishListingCard, PrePublishModal |
| Wave 3 (search) | MarketplaceFilterBar, FilterBubbles, VisualSearchStrip, AiCommandBar, ListingCard/Grid, FeedTierBadge, SmartBrokerCard, ListingMapViewInner, discover |
| Wave 4 (detail) | TrustBadges, SellerTrustCard, AiTrustScoreBanner |
| Wave 5 (create) | PhotoSourceSheet, AiIntroModal, PhotoCategoryMismatchBanner, ListingPublishSocialOptions, native-media |
| Wave 6 (deal) | EscrowModal, EscrowActionBlock, ParcelLockerPicker, BarcodeLookupCard, VehicleLookupCard, BuddyQuickActions |
| Wave 7 (profile) | WishlistSection, WantedEmptyState, ProfileSettingsMenu, AiSettingsCard, B2B/B2C billing kortelės, BusinessHours/Identity, ServiceCalendar/LeadInbox, ProUpsell, ReferralInvite, LaunchTrial, VisibilityPricing, BulkUpload, EditListingModal, CallAndSell, MicroAnalytics, BusinessMarketInsights |
| Wave 8 (supporting) | GdprConsentModal, ZeroUi*, StoryVisualGenerator, ShareSpintaButton, AiProcessingMilestones, CategoryFieldsEditor, CreatableCombobox, BuddyVoicePulse, FleetMatchBuddyHost, ServiceRequestCard, InvoicePrintView, PaymentHistorySection |

## Sertifikuoti brand šaltiniai (pakeisti šioje delta)

| Failas | Pakeitimas |
|---|---|
| `src/lib/chameleon-portal-ui.ts` | flux theme → emerald |
| `src/lib/portal-experience.ts` | flux color → emerald |
| `src/components/VautoHexMark.tsx` | emerald gradient |
| `src/components/VautoLogo.tsx` | emerald dot |
| `src/app/globals.css` | flux-coral/anonser/buddyPulse/orange alias → emerald |
| `src/lib/story-visual.ts` | BRAND_EMERALD |

## Verifikacijos rezultatai

- 48/48 screenshot: overflow 0 px
- 48/48: theme LIGHT/DARK paritetas
- P0 maršrutai: 0 pageerror
- E2E: 148/154 PASS (visi 6 failai dokumentuoti, ne 20B regresijos)
