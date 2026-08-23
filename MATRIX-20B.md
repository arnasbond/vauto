# VAUTO Stage 20B — Migracijos matrica (P0–P3)

Migracijos būsena: **BAIGTA**. Šaltinis: git working-tree delta prieš `d4b7b41a`.

## P0 — Core marketplace

| Maršrutas | Komponentai | Migruota | Pastabos |
|---|---|---|---|
| `/` | HomeAiHero, HotKeywordsGrid, PrePublishListingCard, kategorijos | ✅ | Emerald hero, AI įėjimo taškas, 0 overflow |
| `/search/` | MarketplaceFilterBar, FilterBubbles, VisualSearchStrip, AiCommandBar, ListingGrid, ListingCard | ✅ | AI chips emerald, view toggles, results |
| `/listing/` | TrustBadges, SellerTrustCard, AiTrustScoreBanner, ListingDetail | ✅ | Emerald trust/AI signalai |
| `/discover/` | Discover puslapis | ✅ | Emerald akcentai |

## P1 — Pagrindiniai paviršiai

| Maršrutas | Komponentai | Migruota | Pastabos |
|---|---|---|---|
| `/add/` | PhotoSourceSheet, AiIntroModal, PrePublishModal, native-media | ✅ | Emerald CTA, AI modal |
| `/chats/` | ChatThreadView, BuddyAvatar, BuddyQuickActions | ✅ | AI funkcijų emerald |
| `/sandoriai/` | EscrowModal, EscrowActionBlock, ParcelLockerPicker | ✅ | Deal Room emerald brand |
| `/profile/` | WishlistSection, ProfileSettingsMenu, dashboard kortelės | ✅ | Visos B2B/pro kortelės |
| `/apie/` | About puslapis | ✅ | |
| `/registracija/` | Registracija | ✅ | |
| `/install/` | Install | ✅ | |
| `/ui-kit/` | UiKitPage | ✅ | Reference paviršius (P1) |

## P2 — Antriniai paviršiai

| Paviršius | Migruota |
|---|---|
| Escrow / transaction surfaces | ✅ |
| BarcodeLookupCard, VehicleLookupCard | ✅ |
| SmartBrokerCard (broker signalai) | ✅ |
| Wishlist / WantedEmptyState | ✅ |
| AiSettingsCard, AiPreferenceCenter | ✅ |
| GdprConsentModal, Privacy | ✅ |
| Billing / InvoicePrintView / PaymentHistory | ✅ |
| BusinessHoursEditor, BusinessIdentityCard, ServiceCalendar, ServiceLeadInbox | ✅ |
| ZeroUiPaymentGate, ZeroUiListingPreview, ZeroUiScreenChrome, ZeroUiBusinessDashboard | ✅ |
| StoryVisualGenerator, ShareSpintaButton | ✅ |

## P3 — Supporting / error / empty / loading

| Paviršius | Migruota |
|---|---|
| ToastHost, NotificationBell | ✅ |
| AiProcessingMilestones, AudioWaveAnimation | ✅ |
| BuddyVoicePulse, FleetMatchBuddyHost | ✅ |
| Trust badges, FeedTierBadge | ✅ |
| ServiceRequestCard, ListingPublishSocialOptions | ✅ |
| CategoryFieldsEditor, CreatableCombobox | ✅ |
| PhotoCategoryMismatchBanner, BulkUploadCard | ✅ |

## Vizualiniai tikrinimai

| Check | Rezultatas |
|---|---|
| Overflow (390/1440, LIGHT/DARK) | 0 px — 48/48 |
| Theme paritetas | 0 mismatch — 48/48 |
| Emerald brand (#10b981) | Patvirtinta CDP |
| h1 hierarchija | 27.2px (mobile) → 50.4px (desktop) |
| Console pageerror P0 | 0 |
