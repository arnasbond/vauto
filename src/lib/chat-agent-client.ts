import { apiNegotiationTwin } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";

export interface NegotiationTwinReply {
  shouldReply: boolean;
  offeredPrice?: number;
  counterPrice?: number;
  dealReady: boolean;
  autoReply: string;
  sellerNotification: string;
}

function localTwin(body: {
  buyerMessage: string;
  listingPrice: number;
  minPrice: number;
  listingTitle: string;
  sellerName: string;
}): NegotiationTwinReply | null {
  const offered = body.buyerMessage.match(/(\d[\d\s.,]*)\s*(?:€|eur)/i);
  const price = offered ? Number(offered[1]!.replace(/[^\d]/g, "")) : NaN;
  if (!Number.isFinite(price) || price <= 0) return null;

  const min = body.minPrice;
  const sellerFirst = body.sellerName.trim().split(/\s+/)[0] || "Pardavėja";

  if (price >= min) {
    return {
      shouldReply: true,
      offeredPrice: price,
      counterPrice: price,
      dealReady: true,
      autoReply: `Puiku! ${sellerFirst} sutinka su ${price} € — galime tęsti saugų pirkimą per VAUTO escrow.`,
      sellerNotification: `${sellerFirst}, AI Dvynys užbaigė derybas — pirkėja sutinka ${price} €.`,
    };
  }

  const counter = Math.max(min, Math.round((min + body.listingPrice) / 2));
  return {
    shouldReply: true,
    offeredPrice: price,
    counterPrice: counter,
    dealReady: false,
    autoReply: `Ačiū už ${price} €. ${sellerFirst} gali sutikti su ${counter} € — ar tinka?`,
    sellerNotification: `${sellerFirst}, AI Dvynys pasiūlė ${counter} € (min ${min} €).`,
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
}): Promise<NegotiationTwinReply | null> {
  if (isAiProxyAvailable()) {
    const remote = await apiNegotiationTwin(body);
    if (remote?.shouldReply) return remote;
  }
  return localTwin(body);
}
