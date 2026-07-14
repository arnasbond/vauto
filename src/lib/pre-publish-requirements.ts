import type { PrePublishReadiness } from "@/lib/pre-publish-validation";

export const PRE_PUBLISH_BLOCK_INTRO =
  "Trūksta kelių detalių — užpildykite žemiau ir galėsite publikuoti:";

export interface PrePublishRequirementsPayload {
  missingPhoto: boolean;
  missingPhone: boolean;
  missingCity: boolean;
  missingAuth: boolean;
  resolvedPhone?: string;
  resolvedCity?: string;
  hasPhoto?: boolean;
}

export function buildPrePublishRequirementsPayload(
  readiness: PrePublishReadiness
): PrePublishRequirementsPayload {
  return {
    missingPhoto: readiness.missingPhoto,
    missingPhone: readiness.missingPhone,
    missingCity: readiness.missingCity,
    missingAuth: readiness.missingAuth,
    resolvedPhone: readiness.resolvedPhone,
    resolvedCity: readiness.resolvedCity,
    hasPhoto: readiness.hasPhoto,
  };
}

export function mergeRequirementsWithReadiness(
  payload: PrePublishRequirementsPayload | null | undefined,
  live: PrePublishReadiness | null
): PrePublishRequirementsPayload | null {
  if (live && !live.ok) {
    return buildPrePublishRequirementsPayload(live);
  }
  if (payload && (payload.missingPhoto || payload.missingPhone || payload.missingCity || payload.missingAuth)) {
    return payload;
  }
  return null;
}
