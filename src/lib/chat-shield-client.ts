import { apiChatShield } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";

export interface ChatShieldClientResult {
  shouldShield: boolean;
  autoReply?: string;
  sellerNotification?: string;
  reason?: string;
}

function localShieldFallback(body: {
  message: string;
  listingPrice: number;
  listingTitle: string;
  sellerName?: string;
}): ChatShieldClientResult {
  const offered = body.message.match(/(\d[\d\s.,]*)\s*(?:€|eur)/i);
  const price = offered ? Number(offered[1]!.replace(/[^\d]/g, "")) : NaN;
  if (
    body.listingPrice > 0 &&
    Number.isFinite(price) &&
    price < body.listingPrice * 0.7
  ) {
    const name = body.sellerName?.trim() || "Pardavėjas";
    return {
      shouldShield: true,
      reason: "lowball_offer",
      autoReply: `Ačiū už pasiūlymą! ${name} nurodė, kad kaina derinama tik minimaliai ir arti skelbime nurodytos vertės.`,
      sellerNotification: `${name}, AI Ghost Shield mandagiai atsakė už tave — gautas per žemas pasiūlymas (${price} €).`,
    };
  }
  return { shouldShield: false };
}

export async function requestChatShieldAnalysis(body: {
  message: string;
  listingPrice: number;
  listingTitle: string;
  sellerName?: string;
}): Promise<ChatShieldClientResult | null> {
  if (isAiProxyAvailable()) {
    const remote = await apiChatShield(body);
    if (remote) return remote;
  }
  const local = localShieldFallback(body);
  return local.shouldShield ? local : null;
}
