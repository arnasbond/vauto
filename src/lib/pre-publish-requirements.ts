import type { PrePublishReadiness } from "@/lib/pre-publish-validation";
import {
  GAP_CHIP_CITY,
  GAP_CHIP_PHONE,
  GAP_CHIP_PHOTO,
  GAP_CHIP_PRICE,
} from "@/lib/listing-wizard-flow";

export const PRE_PUBLISH_BLOCK_INTRO =
  "Trūksta kelių detalių — užpildykite žemiau:";

export interface PrePublishRequirementsPayload {
  missingPhoto: boolean;
  missingPhone: boolean;
  missingCity: boolean;
  missingPrice: boolean;
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
    missingPrice: readiness.missingPrice,
    missingAuth: readiness.missingAuth,
    resolvedPhone: readiness.resolvedPhone,
    resolvedCity: readiness.resolvedCity,
    hasPhoto: readiness.hasPhoto,
  };
}

export function buildGapQuickReplies(
  req: PrePublishRequirementsPayload
): string[] {
  const chips: string[] = [];
  if (req.missingPhoto) chips.push(GAP_CHIP_PHOTO);
  if (req.missingPhone) chips.push(GAP_CHIP_PHONE);
  if (req.missingCity) chips.push(GAP_CHIP_CITY);
  if (req.missingPrice) chips.push(GAP_CHIP_PRICE);
  return chips;
}

export function buildGapStatusSummary(
  req: PrePublishRequirementsPayload
): string {
  const missing: string[] = [];
  if (req.missingPhoto) missing.push("nuotrauka");
  if (req.missingPrice) missing.push("kaina");
  if (req.missingPhone) missing.push("telefonas");
  if (req.missingCity) missing.push("miestas");
  if (req.missingAuth) missing.push("prisijungimas");
  if (!missing.length) return "Viskas paruošta publikuoti.";
  return `Trūksta: ${missing.join(", ")}`;
}

export function mergeRequirementsWithReadiness(
  payload: PrePublishRequirementsPayload | null | undefined,
  live: PrePublishReadiness | null
): PrePublishRequirementsPayload | null {
  if (live && !live.ok) {
    return buildPrePublishRequirementsPayload(live);
  }
  if (
    payload &&
    (payload.missingPhoto ||
      payload.missingPhone ||
      payload.missingCity ||
      payload.missingPrice ||
      payload.missingAuth)
  ) {
    return payload;
  }
  return null;
}
