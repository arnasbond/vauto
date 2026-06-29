import { getDataApiBaseUrl } from "@/lib/api/config";
import { getAuthHeaders } from "@/lib/auth/session";

export interface UserRequirementPayload {
  query: string;
  category?: string;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
  size?: string;
  subcategory?: string;
  wardrobeMode?: boolean;
  filters?: Record<string, unknown>;
  source?: string;
}

export interface ProactiveOfferContext {
  kind: "no_match" | "bargaining";
  query?: string;
  listingId?: string;
  listingTitle?: string;
  listingPrice?: number;
  category?: string;
  wardrobeMode?: boolean;
  filters?: import("@/lib/vauto-agent-client").AgentSearchFilters | null;
}

/** Persist buyer requirement via Render API (/api/requirements). */
export async function apiCreateUserRequirement(
  payload: UserRequirementPayload
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const base = getDataApiBaseUrl();
  if (!base) return { ok: false, error: "API not configured" };
  try {
    const res = await fetch(`${base}/api/requirements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: text || res.statusText };
    }
    const data = (await res.json()) as { ok?: boolean; id?: string };
    return { ok: Boolean(data.ok), id: data.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export const LISTING_DWELL_MS = 15_000;

export function buildNoMatchInterventionMessage(query: string, wardrobeMode: boolean): string {
  if (wardrobeMode) {
    return `Matau, kad tavo spintoje pagal „${query}" kol kas tuščia. Leisk man užfiksuoti tavo norą fone — pranešiu, kai atsiras!`;
  }
  return `Matau, kad šiuo metu tokios prekės neturime. Leisk man užfiksuoti tavo norą fone — stebėsiu rinką ir pranešiu!`;
}

export function buildBargainingInterventionMessage(
  title: string,
  price: number,
  wardrobeMode: boolean
): string {
  if (wardrobeMode) {
    return `„${title}" (${price} €) sulaukė daug peržiūrų tavo spintoje. Nori, padėsiu suderinti 5–10% nuolaidą tiesiogiai su pardavėju?`;
  }
  return `„${title}" (${price} €) sulaukė daug susidomėjimo. Nori, padėsiu suderinti nuolaidą su pardavėju?`;
}
