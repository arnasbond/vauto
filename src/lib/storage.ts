import type {
  AuthSession,
  ChatThread,
  Listing,
  SellerReview,
  SupportReport,
  UserProfile,
} from "@/lib/types";
import type { SearchIntentEvent } from "@/lib/search-intent";
import type { ServiceLead } from "@/lib/service-leads";
import type { SocialSyncPrefs } from "@/lib/social-share";
import type { VautoInvoice } from "@/lib/invoices";

const KEYS = {
  listings: "vauto_listings_v1",
  chats: "vauto_chats_v1",
  saved: "vauto_saved_v1",
  user: "vauto_user_v1",
  auth: "vauto_auth_v1",
  reports: "vauto_reports_v1",
  bannedUsers: "vauto_banned_users_v1",
  gdprConsent: "vauto_gdpr_consent_v1",
  reviews: "vauto_reviews_v1",
  searchIntent: "vauto_search_intent_v1",
  soldPromptDismissed: "vauto_sold_prompt_dismissed_v1",
  wakeWordEnabled: "vauto_wake_word_v1",
  alertQueries: "vauto_alert_queries_v1",
  pushAlertsSeen: "vauto_push_alerts_seen_v1",
  pushAlertsEnabled: "vauto_push_alerts_v1",
  socialSync: "vauto_social_sync_v1",
  appTheme: "vauto_app_theme_v1",
  serviceLeads: "vauto_service_leads_v1",
  openedServiceLeads: "vauto_opened_service_leads_v1",
  invoices: "vauto_invoices_v1",
  invoiceSeries: "vauto_invoice_series_v1",
} as const;

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function loadListings(): Listing[] | null {
  return read<Listing[]>(KEYS.listings);
}

export function saveListings(listings: Listing[]): void {
  write(KEYS.listings, listings);
}

export function loadChats(): ChatThread[] | null {
  return read<ChatThread[]>(KEYS.chats);
}

export function saveChats(chats: ChatThread[]): void {
  write(KEYS.chats, chats);
}

export function loadSavedIds(): string[] | null {
  return read<string[]>(KEYS.saved);
}

export function saveSavedIds(ids: Set<string>): void {
  write(KEYS.saved, Array.from(ids));
}

export function loadUser(): UserProfile | null {
  return read<UserProfile>(KEYS.user);
}

export function saveUser(user: UserProfile): void {
  write(KEYS.user, user);
}

export function clearUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.user);
}

export function loadAuthSession(): AuthSession | null {
  return read<AuthSession>(KEYS.auth);
}

export function saveAuthSession(session: AuthSession): void {
  write(KEYS.auth, session);
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.auth);
}

export function loadReports(): SupportReport[] | null {
  return read<SupportReport[]>(KEYS.reports);
}

export function saveReports(reports: SupportReport[]): void {
  write(KEYS.reports, reports);
}

export function loadBannedUserIds(): string[] | null {
  return read<string[]>(KEYS.bannedUsers);
}

export function saveBannedUserIds(ids: string[]): void {
  write(KEYS.bannedUsers, ids);
}

export function loadGdprConsent(): boolean {
  return read<boolean>(KEYS.gdprConsent) === true;
}

export function saveGdprConsent(accepted: boolean): void {
  write(KEYS.gdprConsent, accepted);
}

export function loadReviews(): SellerReview[] | null {
  return read<SellerReview[]>(KEYS.reviews);
}

export function saveReviews(reviews: SellerReview[]): void {
  write(KEYS.reviews, reviews);
}

export function loadSearchIntent(): SearchIntentEvent[] | null {
  return read<SearchIntentEvent[]>(KEYS.searchIntent);
}

export function saveSearchIntent(events: SearchIntentEvent[]): void {
  write(KEYS.searchIntent, events);
}

export function loadSoldPromptDismissed(): string[] | null {
  return read<string[]>(KEYS.soldPromptDismissed);
}

export function saveSoldPromptDismissed(ids: string[]): void {
  write(KEYS.soldPromptDismissed, ids);
}

export function loadWakeWordEnabled(): boolean {
  return read<boolean>(KEYS.wakeWordEnabled) === true;
}

export function saveWakeWordEnabled(enabled: boolean): void {
  write(KEYS.wakeWordEnabled, enabled);
}

export function loadAlertQueries(): string[] | null {
  return read<string[]>(KEYS.alertQueries);
}

export function saveAlertQueries(queries: string[]): void {
  write(KEYS.alertQueries, queries);
}

export function loadPushAlertsSeen(): string[] | null {
  return read<string[]>(KEYS.pushAlertsSeen);
}

export function savePushAlertsSeen(ids: string[]): void {
  write(KEYS.pushAlertsSeen, ids);
}

export function loadPushAlertsEnabled(): boolean {
  const v = read<boolean>(KEYS.pushAlertsEnabled);
  return v !== false;
}

export function savePushAlertsEnabled(enabled: boolean): void {
  write(KEYS.pushAlertsEnabled, enabled);
}

export function loadSocialSyncPrefs(): SocialSyncPrefs | null {
  return read<SocialSyncPrefs>(KEYS.socialSync);
}

export function saveSocialSyncPrefs(prefs: SocialSyncPrefs): void {
  write(KEYS.socialSync, prefs);
}

export function loadAppTheme(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEYS.appTheme);
}

export function saveAppTheme(theme: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.appTheme, theme);
}

export function loadServiceLeads(): ServiceLead[] | null {
  return read<ServiceLead[]>(KEYS.serviceLeads);
}

export function saveServiceLeads(leads: ServiceLead[]): void {
  write(KEYS.serviceLeads, leads);
}

export function loadOpenedServiceLeads(): string[] | null {
  return read<string[]>(KEYS.openedServiceLeads);
}

export function saveOpenedServiceLeads(ids: string[]): void {
  write(KEYS.openedServiceLeads, ids);
}

export function loadInvoices(): VautoInvoice[] | null {
  return read<VautoInvoice[]>(KEYS.invoices);
}

export function saveInvoices(invoices: VautoInvoice[]): void {
  write(KEYS.invoices, invoices);
}

export function loadInvoiceSeries(): { year: number; seq: number } | null {
  return read<{ year: number; seq: number }>(KEYS.invoiceSeries);
}

export function saveInvoiceSeries(series: { year: number; seq: number }): void {
  write(KEYS.invoiceSeries, series);
}

export function clearAllData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}
