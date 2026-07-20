/** S5 AI twin MVP — fixed templates only (constitution). No free-form negotiation. */

export type TwinTemplateId =
  | "still_available"
  | "price_floor"
  | "escalate_human";

export const TWIN_TEMPLATE_CHIPS: ReadonlyArray<{
  id: TwinTemplateId;
  label: string;
}> = [
  { id: "still_available", label: "Dar aktualu?" },
  { id: "price_floor", label: "Kainos riba" },
  { id: "escalate_human", label: "Perduoti žmogui" },
];

export function twinTemplateText(
  id: TwinTemplateId,
  minPrice: number
): string {
  const min = Math.max(1, Math.round(minPrice));
  switch (id) {
    case "still_available":
      return "Taip, dar aktualu.";
    case "price_floor":
      return `Minimali kaina — ${min} €.`;
    case "escalate_human":
      return "Perduodu pokalbį pardavėjui — netrukus atsakys žmogus.";
  }
}

function extractOfferedPrice(text: string): number | undefined {
  const normalized = text.replace(/\s/g, " ");
  const eurMatch = normalized.match(/(\d[\d\s.,]*)\s*(?:€|eur|euro)/i);
  if (eurMatch) {
    const n = Number(eurMatch[1]!.replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const bare = normalized.match(
    /\b(?:siūlau|siulau|duodu|moku|galiu)\s*(\d[\d\s.,]*)/i
  );
  if (bare) {
    const n = Number(bare[1]!.replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

const AVAILABILITY_PATTERN =
  /\b(aktualu|ar\s+dar\s+(yra|turit|turite|parduodat)|dar\s+yra|available|laisva|nenupirkta)\b/i;
const PRICE_PATTERN =
  /\b(kain|nuolaid|pigiau|der[eė]|siūl|siul|€|eur|moku|galiu\s+duot)/i;

export interface TwinTemplatePick {
  templateId: TwinTemplateId;
  autoReply: string;
  escalate: boolean;
  offeredPrice?: number;
  dealReady: boolean;
  sellerNotification: string;
}

/** Map buyer message → one of three S5 templates (keyword/regex only). */
export function pickTwinTemplate(
  buyerMessage: string,
  minPrice: number,
  sellerName = "Pardavėja"
): TwinTemplatePick {
  const sellerFirst = sellerName.trim().split(/\s+/)[0] || "Pardavėja";
  const min = Math.max(1, Math.round(minPrice));
  const offered = extractOfferedPrice(buyerMessage);
  const text = buyerMessage.trim();

  if (offered != null || PRICE_PATTERN.test(text)) {
    const dealReady = offered != null && offered >= min;
    return {
      templateId: "price_floor",
      autoReply: twinTemplateText("price_floor", min),
      escalate: false,
      offeredPrice: offered,
      dealReady,
      sellerNotification: dealReady
        ? `${sellerFirst}, pirkėjas siūlo ≥ min (${min} €) — patvirtinkite žmogumi.`
        : `${sellerFirst}, AI dvynys nurodė kainos ribą ${min} €.`,
    };
  }

  if (AVAILABILITY_PATTERN.test(text)) {
    return {
      templateId: "still_available",
      autoReply: twinTemplateText("still_available", min),
      escalate: false,
      dealReady: false,
      sellerNotification: `${sellerFirst}, AI dvynys patvirtino, kad dar aktualu.`,
    };
  }

  return {
    templateId: "escalate_human",
    autoReply: twinTemplateText("escalate_human", min),
    escalate: true,
    dealReady: false,
    sellerNotification: `${sellerFirst}, AI dvynys perdavė pokalbį jums.`,
  };
}
