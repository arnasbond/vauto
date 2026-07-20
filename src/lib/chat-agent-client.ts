import { apiNegotiationTwin } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import {
  pickTwinTemplate,
  type TwinTemplateId,
} from "@/lib/twin-templates";

export interface NegotiationTwinReply {
  shouldReply: boolean;
  offeredPrice?: number;
  counterPrice?: number;
  dealReady: boolean;
  autoReply: string;
  sellerNotification: string;
  escalate?: boolean;
  templateId?: TwinTemplateId;
  blockedReason?: string;
}

function localTwin(body: {
  buyerMessage: string;
  listingPrice: number;
  minPrice: number;
  listingTitle: string;
  sellerName: string;
}): NegotiationTwinReply {
  const picked = pickTwinTemplate(
    body.buyerMessage,
    body.minPrice,
    body.sellerName
  );
  return {
    shouldReply: true,
    offeredPrice: picked.offeredPrice,
    counterPrice:
      picked.templateId === "price_floor" ? body.minPrice : undefined,
    dealReady: picked.dealReady,
    autoReply: picked.autoReply,
    sellerNotification: picked.sellerNotification,
    escalate: picked.escalate,
    templateId: picked.templateId,
  };
}

export async function requestNegotiationTwin(body: {
  buyerMessage: string;
  listingPrice: number;
  minPrice: number;
  listingTitle: string;
  sellerName: string;
  sellerUserId?: string;
  profileType?: "private" | "business";
  sellerApproved?: boolean;
  autoNegotiationEnabled?: boolean;
  sellerConsent?: boolean | string;
  maxDiscountPercent?: number;
  threadId?: string;
  listingId?: string;
}): Promise<NegotiationTwinReply | null> {
  if (isAiProxyAvailable()) {
    const remote = await apiNegotiationTwin(body);
    if (
      remote &&
      (remote.shouldReply ||
        remote.escalate ||
        Boolean(remote.sellerNotification?.trim()))
    ) {
      return remote;
    }
  }
  return localTwin(body);
}
