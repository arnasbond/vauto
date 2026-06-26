import { apiImportListingFromUrl } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import {
  clientExtractListingFromPageText,
  isClientGeminiAvailable,
} from "@/lib/gemini-browser";
import type { AiExtractedListing, ListingCategory } from "@/lib/types";

export type SupportedImportPortal =
  | "autoplius"
  | "aruodas"
  | "vinted"
  | "skelbiu"
  | "cvbankas";

const PORTAL_HOSTS: Record<SupportedImportPortal, RegExp> = {
  autoplius: /(^|\.)autoplius\.lt$/i,
  aruodas: /(^|\.)aruodas\.lt$/i,
  vinted: /(^|\.)vinted\.(lt|com)$/i,
  skelbiu: /(^|\.)skelbiu\.lt$/i,
  cvbankas: /(^|\.)cvbankas\.lt$/i,
};

const PORTAL_CATEGORY: Record<SupportedImportPortal, ListingCategory> = {
  autoplius: "vehicles",
  aruodas: "real_estate",
  vinted: "clothing",
  skelbiu: "other",
  cvbankas: "jobs",
};

export class ListingImportError extends Error {
  readonly code: string;
  readonly fallbackDraft?: AiExtractedListing;

  constructor(message: string, code: string, fallbackDraft?: AiExtractedListing) {
    super(message);
    this.name = "ListingImportError";
    this.code = code;
    this.fallbackDraft = fallbackDraft;
  }
}

export function detectImportPortal(url: string): SupportedImportPortal | null {
  try {
    const host = new URL(url.trim()).hostname;
    for (const [portal, re] of Object.entries(PORTAL_HOSTS) as [
      SupportedImportPortal,
      RegExp,
    ][]) {
      if (re.test(host)) return portal;
    }
  } catch {
    return null;
  }
  return null;
}

export function isSupportedImportUrl(url: string): boolean {
  return detectImportPortal(url) !== null;
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Tuščias juodraštis rankiniam užpildymui po nepavykusio importo. */
export function createImportFallbackDraft(
  url: string,
  opts?: { userCity?: string; contact?: string }
): AiExtractedListing {
  const trimmed = url.trim();
  const portal = detectImportPortal(trimmed);
  const userCity = opts?.userCity?.trim() || "Lietuva";
  const contact = opts?.contact?.trim() || "+370 612 34567";
  const category = portal ? PORTAL_CATEGORY[portal] : "other";

  return {
    title: "",
    description: "",
    price: 0,
    location: userCity,
    contact,
    category,
    confidence: 0,
    attributes: {
      _importUrl: trimmed,
      _importFailed: "1",
      ...(portal ? { _importPortal: portal } : {}),
    },
  };
}

function friendlyImportError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "fetch_failed":
      return "Nepavyko atsisiųsti skelbimo puslapio — portalas neatsakė arba nuoroda neteisinga.";
    case "empty_content":
      return "Portalo puslapis tuščias arba nepalaikomas — užpildykite laukus ranka.";
    case "timeout":
      return "Importas užtruko per ilgai — bandykite vėliau arba užpildykite ranka.";
    case "unavailable":
      return "AI importo serveris nepasiekiamas — užpildykite skelbimą ranka.";
    default:
      return fallback;
  }
}

/** Žaibiškas importas iš Autoplius, Aruodas, Vinted, Skelbiu, CVBankas nuorodų. */
export async function importListingFromUrl(
  url: string,
  opts?: { userCity?: string; contact?: string }
): Promise<AiExtractedListing> {
  const trimmed = url.trim();
  const portal = detectImportPortal(trimmed);
  const userCity = opts?.userCity?.trim() || "Lietuva";
  const contact = opts?.contact?.trim() || "+370 612 34567";
  const fallbackDraft = createImportFallbackDraft(trimmed, { userCity, contact });

  if (!portal) {
    throw new ListingImportError(
      "Palaikomos tik Autoplius, Aruodas, Vinted, Skelbiu ir CVBankas nuorodos.",
      "unsupported_portal",
      fallbackDraft
    );
  }

  if (isAiProxyAvailable()) {
    const fromApi = await apiImportListingFromUrl({ url: trimmed, userCity, contact });
    if (fromApi.ok) {
      return {
        ...fromApi.data,
        attributes: {
          ...(fromApi.data.attributes ?? {}),
          _importUrl: trimmed,
          _importPortal: portal,
        },
      };
    }
    throw new ListingImportError(
      friendlyImportError(fromApi.code, fromApi.error),
      fromApi.code ?? "import_failed",
      fallbackDraft
    );
  }

  if (!isClientGeminiAvailable()) {
    throw new ListingImportError(
      "AI importas nepasiekiamas — užpildykite skelbimą ranka.",
      "ai_unavailable",
      fallbackDraft
    );
  }

  try {
    return await clientExtractListingFromPageText({
      url: trimmed,
      portal,
      pageText: "",
      userCity,
      contact,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Nepavyko importuoti skelbimo";
    throw new ListingImportError(msg, "client_extract_failed", fallbackDraft);
  }
}
