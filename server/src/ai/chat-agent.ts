import { unifiedLlmJson } from "./llm-provider.js";

export interface NegotiationTwinInput {
  buyerMessage: string;
  listingPrice: number;
  minPrice: number;
  listingTitle: string;
  sellerName: string;
}

export interface NegotiationTwinResult {
  shouldReply: boolean;
  offeredPrice?: number;
  counterPrice?: number;
  dealReady: boolean;
  autoReply: string;
  sellerNotification: string;
}

function extractOfferedPrice(text: string): number | undefined {
  const normalized = text.replace(/\s/g, " ");
  const eurMatch = normalized.match(/(\d[\d\s.,]*)\s*(?:€|eur|euro)/i);
  if (eurMatch) {
    const n = Number(eurMatch[1]!.replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const bare = normalized.match(/\b(?:siūlau|siulau|duodu|moku|galiu)\s*(\d[\d\s.,]*)/i);
  if (bare) {
    const n = Number(bare[1]!.replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function counterPrice(listingPrice: number, minPrice: number, offered: number): number {
  if (offered >= minPrice) return offered;
  const mid = Math.round((minPrice + listingPrice) / 2);
  return Math.max(minPrice, Math.min(listingPrice - 1, mid));
}

function localNegotiationTwin(input: NegotiationTwinInput): NegotiationTwinResult {
  const sellerFirst = input.sellerName.trim().split(/\s+/)[0] || "Pardavėja";
  const offered = extractOfferedPrice(input.buyerMessage);
  const min = Math.max(1, input.minPrice);
  const list = Math.max(min, input.listingPrice);

  if (!offered) {
    return {
      shouldReply: false,
      dealReady: false,
      autoReply: "",
      sellerNotification: "",
    };
  }

  if (offered >= min) {
    return {
      shouldReply: true,
      offeredPrice: offered,
      counterPrice: offered,
      dealReady: true,
      autoReply: `Puiku! ${sellerFirst} sutinka su ${offered} € — galime tęsti saugų pirkimą per VAUTO escrow. Ar patvirtinate?`,
      sellerNotification: `${sellerFirst}, AI Dvynys užbaigė derybas — pirkėja sutinka ${offered} €.`,
    };
  }

  const counter = counterPrice(list, min, offered);
  return {
    shouldReply: true,
    offeredPrice: offered,
    counterPrice: counter,
    dealReady: false,
    autoReply: `Ačiū už pasiūlymą ${offered} €. ${sellerFirst} gali sutikti su ${counter} € — tai artima jos minimaliai kainai. Ar tinka?`,
    sellerNotification: `${sellerFirst}, AI Dvynys pasiūlė ${counter} € (min ${min} €, pirkėja siūlė ${offered} €).`,
  };
}

/** Negotiation Twin — AI derasi fone pagal pardavėjos minimalią kainą. */
export async function analyzeNegotiationTwin(
  input: NegotiationTwinInput
): Promise<NegotiationTwinResult> {
  const local = localNegotiationTwin(input);
  if (!local.shouldReply) return local;

  try {
    const raw = await unifiedLlmJson({
      systemInstruction: `Tu esi VAUTO Negotiation Twin — mandagus pardavėjos AI dvynys derybose.
Grąžink JSON: {"shouldReply":true,"offeredPrice":number,"counterPrice":number|null,"dealReady":boolean,"autoReply":"string","sellerNotification":"string"}
Jokių geografinių apribojimų. Jei pasiūlymas >= minPrice — dealReady true.`,
      prompt: `Pardavėja: ${input.sellerName}
Skelbimas: ${input.listingTitle}
Kaina: ${input.listingPrice} €, minimumas: ${input.minPrice} €
Pirkėjos žinutė: "${input.buyerMessage}"`,
    });

    return {
      shouldReply: Boolean(raw.shouldReply ?? true),
      offeredPrice: Number(raw.offeredPrice) || local.offeredPrice,
      counterPrice:
        raw.counterPrice != null ? Number(raw.counterPrice) : local.counterPrice,
      dealReady: Boolean(raw.dealReady ?? local.dealReady),
      autoReply: String(raw.autoReply ?? local.autoReply).trim() || local.autoReply,
      sellerNotification:
        String(raw.sellerNotification ?? local.sellerNotification).trim() ||
        local.sellerNotification,
    };
  } catch {
    return local;
  }
}
