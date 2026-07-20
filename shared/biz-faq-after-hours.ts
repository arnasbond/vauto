import {
  formatBusinessHoursSummary,
  isWithinBusinessHours,
  type BusinessHours,
} from "./business-hours.js";

export interface BizFaqContext {
  companyName?: string;
  businessHours?: BusinessHours | null;
  profileType?: "private" | "business" | string;
  city?: string;
  phone?: string;
}

export function shouldAutoReplyAfterHours(input: {
  seller: BizFaqContext;
  latestSenderId: string;
  sellerId: string;
  buyerId: string;
  now?: Date;
}): boolean {
  if (input.seller.profileType !== "business") return false;
  if (input.latestSenderId !== input.buyerId) return false;
  if (isWithinBusinessHours(input.seller.businessHours, input.now)) return false;
  return true;
}

export function buildAfterHoursFaqReply(seller: BizFaqContext): string {
  const brand = seller.companyName?.trim() || "Įmonė";
  const hours = formatBusinessHoursSummary(seller.businessHours);
  const city = seller.city?.trim();
  const phone = seller.phone?.trim();
  const lines = [
    `Sveiki! Čia ${brand} automatinis asistentas.`,
    "Šiuo metu esame ne darbo laiku, todėl greitas žmogaus atsakymas gali vėluoti.",
    hours + ".",
  ];
  if (city) lines.push(`Esame ${city}.`);
  if (phone) lines.push(`Skubiais atvejais skambinkite: ${phone}.`);
  lines.push(
    "Parašykite klausimą apie prekę, kainą ar pristatymą — perduosime komandai darbo valandomis."
  );
  return lines.join("\n");
}
