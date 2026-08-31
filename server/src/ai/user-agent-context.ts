import { getListings, getUser } from "../repository.js";
import type { ApiListing, ApiUser } from "../types.js";

export interface MyListingForAgent {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  status: string;
}

export interface UserAgentContextPayload {
  userName: string;
  accountType: string;
  userCity: string;
  contact: string;
  userRole: "buyer" | "seller" | "business" | "admin";
  isAuthenticated: boolean;
  myListings: MyListingForAgent[];
  myListingsSummary: string;
  /** When true, leave myListings empty — fresh listing Vision must not see prior ads. */
  omitPriorListingDraft?: boolean;
  freshListingSession?: boolean;
}

/** Field-appropriate bounds for user-derived profile text (Lithuanian-friendly). */
const PROFILE_FIELD_MAX = {
  userName: 60,
  userCity: 40,
  contact: 32,
  accountType: 40,
} as const;

const USER_ROLES: readonly UserAgentContextPayload["userRole"][] = [
  "buyer",
  "seller",
  "business",
  "admin",
];

export function isUserRole(value: unknown): value is UserAgentContextPayload["userRole"] {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Bounded, field-appropriate sanitizer for user-derived profile text:
 * strips control characters (newlines, tabs, NUL…), collapses whitespace and
 * caps length. Preserves ordinary Lithuanian names, cities and marketplace
 * wording — it performs no destructive prompt scrubbing.
 */
export function sanitizeProfileField(value: unknown, maxLen: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function resolveAccountTypeLabel(user: Pick<ApiUser, "role" | "businessType">): string {
  if (user.role === "super_admin" || user.role === "admin") return "Administratorius";
  if (user.role === "pro") {
    if (user.businessType === "dealer") return "Verslas · Auto salonas";
    if (user.businessType === "services") return "Verslas · Paslaugos";
    return "Verslas · Pro";
  }
  return "Privatus pardavėjas";
}

export function resolveAgentRole(user: Pick<ApiUser, "role">): UserAgentContextPayload["userRole"] {
  if (user.role === "super_admin" || user.role === "admin") return "admin";
  if (user.role === "pro") return "business";
  return "buyer";
}

function listingStatusLabel(status: string | undefined): string {
  if (status === "sold") return "parduotas";
  if (status === "active") return "aktyvus";
  return status ?? "aktyvus";
}

export function summarizeMyListings(
  listings: MyListingForAgent[],
  firstName: string,
  userRole?: UserAgentContextPayload["userRole"]
): string {
  const active = listings.filter((l) => l.status !== "sold");
  const sold = listings.filter((l) => l.status === "sold");
  const isBusiness = userRole === "business" || userRole === "admin";

  if (!listings.length) {
    if (isBusiness) {
      return `${firstName} dar neturi aktyvių skelbimų. Kaip verslo partneris proaktyviai padėk: pasiūlyk paruošti pirmą profesionalų skelbimą (create_listing_draft / navigateToScreen add_listing), priminti apie kokybiškas nuotraukas, konkurencingą kainą (analyzeMarketPrice) ir matomumą (Smart Boost). Taip pat pasiūlyk peržiūrėti verslo skydelį ir leadus (getBusinessInsights / listServiceLeads).`;
    }
    return `${firstName} neturi skelbimų — Spinta tuščia. Proaktyviai paskatink: nufotografuoti drabužius/techniką ir paruošti skelbimą per kelias sekundes (create_listing_draft / navigateToScreen add_listing).`;
  }
  if (active.length === 1) {
    const l = active[0]!;
    return `Turi 1 aktyvų skelbimą: „${l.title}" (${l.location}, ${l.price}€).`;
  }
  if (active.length > 1) {
    const sample = active
      .slice(0, 3)
      .map((l) => `„${l.title}" (${l.location})`)
      .join("; ");
    return `Turi ${active.length} aktyvius skelbimus: ${sample}.`;
  }
  if (sold.length) {
    return `Aktyvių skelbimų nėra; ${sold.length} archyvuota (-i).`;
  }
  return `${firstName} skelbimų sąrašas tuščias.`;
}

export function buildUserContextInjectionBlock(payload: UserAgentContextPayload): string {
  const firstName = payload.userName.split(/\s+/)[0] || payload.userName;
  const lines = [
    "[Vartotojo profilis — gyvi duomenys, privaloma naudoti]",
    `Vardas: ${payload.userName} (kreipkis: ${firstName})`,
    `Paskyra: ${payload.accountType}`,
    `Miestas: ${payload.userCity}`,
    `Prisijungęs: ${payload.isAuthenticated ? "taip" : "ne"}`,
    `Mano skelbimai: ${payload.myListingsSummary}`,
  ];

  if (payload.myListings.length) {
    const detail = payload.myListings
      .slice(0, 12)
      .map(
        (l) =>
          `- id=${l.id} | ${listingStatusLabel(l.status)} | ${l.title} | ${l.location} | ${l.price}€ | ${l.category}`
      )
      .join("\n");
    lines.push(`Detalus sąrašas:\n${detail}`);
  }

  lines.push(
    `Asmeninio sveikinimo pavyzdys (pritaikyk): „Labas, ${firstName}! ${payload.myListingsSummary.replace(firstName + " ", "")} Nori papildyti nuotraukas, pakoreguoti kainą, ar kelti naują skelbimą?"`
  );

  return lines.join("\n");
}

function mapListing(l: ApiListing): MyListingForAgent {
  return {
    id: l.id,
    title: l.title,
    price: l.price,
    category: l.category,
    location: l.location,
    status: l.status ?? "active",
  };
}

export async function resolveAuthenticatedAgentContext(
  authUserId: string | undefined,
  clientFallback?: Partial<UserAgentContextPayload>
): Promise<UserAgentContextPayload> {
  const omitPrior =
    Boolean(clientFallback?.omitPriorListingDraft) ||
    Boolean(clientFallback?.freshListingSession);

  if (!authUserId) {
    // GUEST — no server-accepted profile state exists. Client fallback values
    // for identity, role, listings and summaries are UNTRUSTED and must never
    // shape the model-visible profile block. Only bounded free-text fields
    // (name/city/contact) pass through field-appropriate sanitization; the
    // summary is the server-generated legitimate empty-guest template.
    const name = sanitizeProfileField(clientFallback?.userName, PROFILE_FIELD_MAX.userName) || "Svečias";
    const firstName = name.split(/\s+/)[0] || name;
    const rawCity = sanitizeProfileField(clientFallback?.userCity, PROFILE_FIELD_MAX.userCity);
    // Never invent Lietuva/Vilnius for guests — empty city = nationwide / manual.
    const userCity =
      !rawCity || /^(lietuva|lithuania|lt|ltu|visa lietuva)$/i.test(rawCity)
        ? ""
        : rawCity;
    const guestRole: UserAgentContextPayload["userRole"] = "buyer";
    return {
      userName: name,
      accountType: "Svečias",
      userCity,
      contact: sanitizeProfileField(clientFallback?.contact, PROFILE_FIELD_MAX.contact),
      userRole: guestRole,
      isAuthenticated: false,
      myListings: [],
      myListingsSummary: summarizeMyListings([], firstName, guestRole),
      omitPriorListingDraft: omitPrior || undefined,
      freshListingSession: clientFallback?.freshListingSession || undefined,
    };
  }

  const user = await getUser(authUserId);
  if (!user) {
    return resolveAuthenticatedAgentContext(undefined, clientFallback);
  }

  let myListings: MyListingForAgent[] = [];
  if (!omitPrior) {
    try {
      const rows = await getListings();
      myListings = rows
        .filter((l) => l.sellerId === authUserId && !l.banned)
        .map(mapListing);
    } catch {
      // Fail closed: no client-provided listing fallback — summaries must be
      // derived from server/database listings only.
      myListings = [];
    }
  }

  return resolveAuthenticatedContextFromServerState(user, myListings, clientFallback, omitPrior);
}

/**
 * Pure server-state derivation for the AUTHENTICATED profile block (exposed
 * for deterministic testing without a database). All identity, role and
 * summary fields come from the server `user` and server `myListings`; client
 * fallback values are used ONLY as bounded free-text fallbacks for
 * city/contact. A client-provided summary is never consulted.
 */
export function resolveAuthenticatedContextFromServerState(
  user: Pick<ApiUser, "name" | "role" | "businessType" | "city" | "phone">,
  myListings: MyListingForAgent[],
  clientFallback?: Partial<UserAgentContextPayload>,
  omitPrior = false
): UserAgentContextPayload {
  const sanitizedName =
    sanitizeProfileField(user.name, PROFILE_FIELD_MAX.userName) || "Vartotojas";
  const firstName = sanitizedName.split(/\s+/)[0] || sanitizedName;
  const resolvedRole = resolveAgentRole(user);
  const serverCity = sanitizeProfileField(user.city, PROFILE_FIELD_MAX.userCity);
  const fallbackCity = sanitizeProfileField(
    clientFallback?.userCity,
    PROFILE_FIELD_MAX.userCity
  );
  const fallbackContact = sanitizeProfileField(
    clientFallback?.contact,
    PROFILE_FIELD_MAX.contact
  );

  return {
    userName: sanitizedName,
    accountType: resolveAccountTypeLabel(user),
    userCity: serverCity || fallbackCity || "Lietuva",
    contact:
      sanitizeProfileField(user.phone, PROFILE_FIELD_MAX.contact) ||
      fallbackContact ||
      "",
    userRole: resolvedRole,
    isAuthenticated: true,
    myListings,
    myListingsSummary: omitPrior
      ? ""
      : summarizeMyListings(myListings, firstName, resolvedRole),
    omitPriorListingDraft: omitPrior || undefined,
    freshListingSession: clientFallback?.freshListingSession || undefined,
  };
}
