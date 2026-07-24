import { getDataApiBaseUrl, isDataApiEnabled } from "@/lib/api/config";
import type { ApiResult } from "@/lib/api/client";
import { getAuthHeaders } from "@/lib/auth/session";

export interface ChatTranslateResult {
  translated: string;
  sourceLang: string;
  targetLang: string;
  isAlreadyTarget?: boolean;
}

/** Lightweight offline fallback when AI API is unavailable. */
function demoTranslate(text: string): ChatTranslateResult {
  return {
    translated: text,
    sourceLang: "auto",
    targetLang: "lt",
    isAlreadyTarget: true,
  };
}

export async function apiTranslateChatMessage(
  text: string,
  targetLang = "lt"
): Promise<ApiResult<ChatTranslateResult>> {
  const base = getDataApiBaseUrl();
  if (!base || !isDataApiEnabled()) {
    return { ok: true, data: demoTranslate(text) };
  }
  try {
    const res = await fetch(`${base}/api/ai/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ text, targetLang }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      return { ok: false, error: err || res.statusText, status: res.status };
    }
    return { ok: true, data: (await res.json()) as ChatTranslateResult };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
