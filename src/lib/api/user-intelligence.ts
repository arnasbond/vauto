import { dataFetch } from "@/lib/api/client";
import type { BodyMeasurements } from "@/lib/types";

export interface UserPreferencesPayload {
  defaultRegion?: string;
  preferredCategories?: string[];
  preferredSizes?: string[];
  primaryVehicle?: Record<string, unknown> | null;
  wardrobeMode?: boolean;
  notificationPrefs?: Record<string, unknown>;
  usageIntent?: string;
  /** AI Twin — EU shoe size */
  shoeSizeEu?: string;
  /** AI Twin — clothing size S/M/L/XL or free text */
  clothingSize?: string;
  /** AI Twin — optional body cm + usualSize/shoeSizeEu */
  bodyMeasurements?: BodyMeasurements;
  /** AI Twin — purchase preferences / interests */
  purchasePrefs?: string[];
}

export interface ProactiveNudgePayload {
  key: string;
  message: string;
  quickReplies?: string[];
}

export async function apiFetchUserPreferences() {
  return dataFetch<{ preferences: UserPreferencesPayload | null }>(
    "/api/user/preferences"
  );
}

export async function apiSaveUserPreferences(prefs: UserPreferencesPayload) {
  return dataFetch<{ preferences: UserPreferencesPayload }>("/api/user/preferences", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
}

export async function apiPostBehaviorEvents(
  events: { type: string; payload?: Record<string, unknown>; at?: number }[]
) {
  return dataFetch<{ ok: true }>("/api/user/behavior-events", {
    method: "POST",
    body: JSON.stringify({ events }),
  });
}

export async function apiFetchUserNudges() {
  return dataFetch<{ nudges: ProactiveNudgePayload[] }>("/api/user/nudges");
}

export async function apiFetchUserOnboarding() {
  return dataFetch<{
    onboarding: {
      step: number;
      completedAt?: string;
      answers: Record<string, unknown>;
    } | null;
  }>("/api/user/onboarding");
}

export async function apiSaveUserOnboarding(body: {
  step?: number;
  completed?: boolean;
  answers?: Record<string, unknown>;
  preferences?: UserPreferencesPayload;
}) {
  return dataFetch<{ onboarding: { step: number; completedAt?: string; answers: Record<string, unknown> } }>(
    "/api/user/onboarding",
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );
}
