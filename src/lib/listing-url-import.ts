import { apiImportListingFromUrl } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import {
  clientExtractListingFromPageText,
  isClientGeminiAvailable,
} from "@/lib/gemini-browser";
import type { AiExtractedListing } from "@/lib/types";

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

/** Žaibiškas importas iš Autoplius, Aruodas, Vinted, Skelbiu, CVBankas nuorodų. */
export async function importListingFromUrl(
  url: string,
  opts?: { userCity?: string; contact?: string }
): Promise<AiExtractedListing> {
  const trimmed = url.trim();
  const portal = detectImportPortal(trimmed);
  if (!portal) {
    throw new Error(
      "Palaikomos tik Autoplius, Aruodas, Vinted, Skelbiu ir CVBankas nuorodos."
    );
  }

  const userCity = opts?.userCity?.trim() || "Lietuva";
  const contact = opts?.contact?.trim() || "+370 612 34567";

  if (isAiProxyAvailable()) {
    const fromApi = await apiImportListingFromUrl({
      url: trimmed,
      userCity,
      contact,
    });
    if (fromApi) return fromApi;
  }

  if (!isClientGeminiAvailable()) {
    throw new Error(
      "AI importas nepasiekiamas — sukonfigūruokite NEXT_PUBLIC_GEMINI_API_KEY arba Live API."
    );
  }

  const pageText = "";
  try {
    const res = await fetch(trimmed, { mode: "no-cors" });
    void res;
  } catch {
    /* CORS expected in browser — fall through to URL + Gemini */
  }

  return clientExtractListingFromPageText({
    url: trimmed,
    portal,
    pageText,
    userCity,
    contact,
  });
}
