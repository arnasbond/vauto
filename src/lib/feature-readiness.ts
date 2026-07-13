import type { ApiHealthDetails } from "@/lib/api/client";

export type FeatureClaimState = "live" | "beta" | "demo" | "disabled";

export interface FeatureClaim {
  id: string;
  label: string;
  state: FeatureClaimState;
  hint: string;
}

const STATE_LABELS: Record<FeatureClaimState, string> = {
  live: "Veikia",
  beta: "Beta",
  demo: "Demo",
  disabled: "Neprijungta",
};

export function featureClaimStateLabel(state: FeatureClaimState): string {
  return STATE_LABELS[state];
}

/** Map server health into user-facing claim states for marketing and settings UI. */
export function deriveFeatureClaims(
  health: ApiHealthDetails | null,
  apiActive: boolean
): FeatureClaim[] {
  const live = Boolean(apiActive && health?.ok && health.db === "connected");
  const features = health?.features;
  const visual = health?.visualPipeline;
  const gemini = Boolean(features?.gemini);
  const stripeLive = Boolean(features?.stripe && features?.stripeWebhook);
  const ocrLive = visual?.ocr !== "none";
  const codeVision = Boolean(visual?.visionExtract);
  const studioBg = visual?.backgroundRemoval !== "none";
  const infra = health?.infra;
  const shippingCarrier = Boolean(infra?.shippingCarrierLive);

  return [
    {
      id: "ai_vision",
      label: "Universalus vaizdo atpažinimas",
      state: !live ? "demo" : gemini ? "live" : "disabled",
      hint: !live
        ? "Veikia demo režime šiame įrenginyje."
        : gemini
          ? "Gemini Vision aktyvus serveryje."
          : "Reikia GEMINI_API_KEY serveryje.",
    },
    {
      id: "code_scan",
      label: "VIN / brūkšninis kodas",
      state: !live ? "demo" : ocrLive || codeVision ? (ocrLive ? "live" : "beta") : "beta",
      hint: ocrLive
        ? `OCR: ${visual?.ocr ?? "none"}`
        : codeVision
          ? "Code Vision fallback per Gemini."
          : "Brūkšninis kodas (EAN) klientui; server OCR neprijungtas.",
    },
    {
      id: "studio_bg",
      label: "Studio BG fono valymas",
      state: !live ? "disabled" : studioBg ? "live" : "disabled",
      hint: studioBg
        ? `Tiekėjas: ${visual?.backgroundRemoval ?? "none"}`
        : "Reikia PhotoRoom, Clipdrop arba Remove.bg rakto.",
    },
    {
      id: "negotiator",
      label: "AI derybininkas 24/7",
      state: !live ? "demo" : gemini ? "beta" : "disabled",
      hint: gemini
        ? "Veikia su pardavėjo patvirtinimu ir min. kaina."
        : "Reikia Gemini AI serveryje.",
    },
    {
      id: "portal_sync",
      label: "Portalų importas / stebėjimas",
      state: !live ? "demo" : "beta",
      hint: "Importas ir atnaujinimo stebėjimas; ne pilnas autopublish į visus portalus.",
    },
    {
      id: "escrow",
      label: "Saugūs mokėjimai (escrow)",
      state: !live ? "demo" : stripeLive ? "live" : features?.stripe ? "beta" : "disabled",
      hint: stripeLive
        ? "Stripe checkout ir webhook aktyvūs."
        : features?.stripe
          ? "Stripe raktas yra, bet webhook dar neprijungtas."
          : "Reikia STRIPE_SECRET_KEY.",
    },
    {
      id: "shipping",
      label: "Siuntų sekimas",
      state: !live ? "demo" : shippingCarrier ? "live" : "beta",
      hint: shippingCarrier
        ? `Carrier: ${infra?.shippingCarrierProvider ?? "live"}`
        : "Lipdukai per adapterį; live carrier API prijungiamas per OMNIVA/DPD env.",
    },
    {
      id: "price_advisor",
      label: "Kainų patarėjas",
      state: !live ? "demo" : gemini ? "beta" : "disabled",
      hint: "Rekomendacija, ne garantuota rinkos kaina.",
    },
  ];
}

export function claimBadgeClass(state: FeatureClaimState): string {
  switch (state) {
    case "live":
      return "vauto-badge-success";
    case "beta":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "demo":
      return "vauto-badge-muted";
    default:
      return "vauto-badge-muted";
  }
}
