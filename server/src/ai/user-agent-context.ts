import { getListings, getUser } from "../repository.js";
import type { ApiListing, ApiUser } from "../types.js";
import {
  detectPromptInjection,
  UNTRUSTED_DATA_SYSTEM_WARNING,
  wrapUntrustedXml,
} from "../shared/prompt-injection.js";

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

/**
 * Additional Lithuanian instruction markers for PROFILE fields (names/cities).
 * Profile metadata is NOT a general chat-message channel: instruction
 * sentences do not need to survive as a userName or city.
 */
const PROFILE_INSTRUCTION_MARKER_RE =
  /\b(ignoruok\w*|ignoruoti|nurodym\w*|instrukcij\w*|taisyk\w*|taisykl\w*|publikuok\w*|publikuoti|vykdyk\w*|apeik\w*|apeiti|privalom\w*|prompt\w*|jail\s*break|sistemos\s+perrašym|system\s*override)\b/i;

/**
 * Reject or safely default instruction-like profile values. Uses the shared
 * prompt-injection detector plus a Lithuanian profile-marker list; a matching
 * value is replaced with the caller-supplied safe default so it can never
 * appear as trusted text inside the high-priority profile block.
 */
export function neutralizeProfileInstruction(value: string, fallback: string): string {
  const s = String(value ?? "").trim();
  if (!s) return fallback;
  if (detectPromptInjection(s) || PROFILE_INSTRUCTION_MARKER_RE.test(s)) {
    return fallback;
  }
  return s;
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
  const safeFirstName = sanitizeProfileField(firstName, PROFILE_FIELD_MAX.userName);

  if (!listings.length) {
    if (isBusiness) {
      return `${safeFirstName} dar neturi aktyvių skelbimų. Kaip verslo partneris proaktyviai padėk: pasiūlyk paruošti pirmą profesionalų skelbimą (create_listing_draft / navigateToScreen add_listing), priminti apie kokybiškas nuotraukas, konkurencingą kainą (analyzeMarketPrice) ir matomumą (Smart Boost). Taip pat pasiūlyk peržiūrėti verslo skydelį ir leadus (getBusinessInsights / listServiceLeads).`;
    }
    return `${safeFirstName} neturi skelbimų — Spinta tuščia. Proaktyviai paskatink: nufotografuoti drabužius/techniką ir paruošti skelbimą per kelias sekundes (create_listing_draft / navigateToScreen add_listing).`;
  }
  const titleOf = (l: MyListingForAgent) => sanitizeProfileField(l.title, 120);
  const locationOf = (l: MyListingForAgent) => sanitizeProfileField(l.location, 40);
  if (active.length === 1) {
    const l = active[0]!;
    return `Turi 1 aktyvų skelbimą: „${titleOf(l)}" (${locationOf(l)}, ${l.price}€).`;
  }
  if (active.length > 1) {
    const sample = active
      .slice(0, 3)
      .map((l) => `„${titleOf(l)}" (${locationOf(l)})`)
      .join("; ");
    return `Turi ${active.length} aktyvius skelbimus: ${sample}.`;
  }
  if (sold.length) {
    return `Aktyvių skelbimų nėra; ${sold.length} archyvuota (-i).`;
  }
  return `${safeFirstName} skelbimų sąrašas tuščias.`;
}

export function buildUserContextInjectionBlock(payload: UserAgentContextPayload): string {
  // Every user-authored string is DATA, never instructions. Profile fields are
  // bounded, neutralized (instruction-like values → safe default) and wrapped
  // in explicit untrusted-data boundaries; server-controlled structural fields
  // (accountType, isAuthenticated, the block header) stay trusted.
  const safeName =
    neutralizeProfileInstruction(
      sanitizeProfileField(payload.userName, PROFILE_FIELD_MAX.userName),
      "Svečias"
    ) || "Svečias";
  const firstName = safeName.split(/\s+/)[0] || safeName;
  const safeCity = neutralizeProfileInstruction(
    sanitizeProfileField(payload.userCity, PROFILE_FIELD_MAX.userCity),
    ""
  );
  const accountType = sanitizeProfileField(
    payload.accountType,
    PROFILE_FIELD_MAX.accountType
  );

  const lines = [
    "[Vartotojo profilis — gyvi duomenys, privaloma naudoti]",
    `Vardas: ${wrapUntrustedXml("untrusted_user_name", safeName, 80)} (kreipkis: ${firstName})`,
    `Paskyra: ${accountType}`,
    `Miestas: ${wrapUntrustedXml("untrusted_user_city", safeCity, 60)}`,
    `Prisijungęs: ${payload.isAuthenticated ? "taip" : "ne"}`,
  ];

  if (payload.myListings.length) {
    // Listing titles/locations are user-authored even when read from the DB —
    // they are wrapped in an explicit untrusted-data boundary with the
    // injection warning, never merged into the trusted profile instructions.
    lines.push(UNTRUSTED_DATA_SYSTEM_WARNING);
    lines.push(
      `Mano skelbimai: ${wrapUntrustedXml("untrusted_my_listings", payload.myListingsSummary, 2_000)}`
    );
    const detail = payload.myListings
      .slice(0, 12)
      .map((l) => {
        const title = sanitizeProfileField(l.title, 120);
        const location = sanitizeProfileField(l.location, 40);
        const category = sanitizeProfileField(l.category, 40);
        return `- id=${sanitizeProfileField(l.id, 60)} | ${listingStatusLabel(l.status)} | ${title} | ${location} | ${l.price}€ | ${category}`;
      })
      .join("\n");
    lines.push(
      `Detalus sąrašas:\n${wrapUntrustedXml("untrusted_my_listings_detail", detail, 4_000)}`
    );
  } else {
    // Server-generated empty-list template (the embedded first name is already
    // neutralized above).
    lines.push(`Mano skelbimai: ${payload.myListingsSummary}`);
  }

  lines.push(
    `Asmeninio sveikinimo pavyzdys (pritaikyk): „Labas, ${firstName}! Nori papildyti nuotraukas, pakoreguoti kainą, ar kelti naują skelbimą?"`
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
    // shape the model-visible profile block. Only bounded, instruction-free
    // free-text fields (name/city/contact) pass through; the summary is the
    // server-generated legitimate empty-guest template.
    const name =
      neutralizeProfileInstruction(
        sanitizeProfileField(clientFallback?.userName, PROFILE_FIELD_MAX.userName),
        "Svečias"
      ) || "Svečias";
    const firstName = name.split(/\s+/)[0] || name;
    const rawCity = neutralizeProfileInstruction(
      sanitizeProfileField(clientFallback?.userCity, PROFILE_FIELD_MAX.userCity),
      ""
    );
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
    neutralizeProfileInstruction(
      sanitizeProfileField(user.name, PROFILE_FIELD_MAX.userName),
      "Vartotojas"
    ) || "Vartotojas";
  const firstName = sanitizedName.split(/\s+/)[0] || sanitizedName;
  const resolvedRole = resolveAgentRole(user);
  const serverCity = neutralizeProfileInstruction(
    sanitizeProfileField(user.city, PROFILE_FIELD_MAX.userCity),
    ""
  );
  const fallbackCity = neutralizeProfileInstruction(
    sanitizeProfileField(clientFallback?.userCity, PROFILE_FIELD_MAX.userCity),
    ""
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
