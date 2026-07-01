import type { BarcodeLookupResult } from "./barcode-lookup";

export interface PendingBarcodeOffer {
  barcode: string;
  message: string;
  savedAt: number;
}

let pending: PendingBarcodeOffer | null = null;

export function buildBarcodeOfferMessage(barcode: string): string {
  return `Aptikau prekės kodą ${barcode}. Ar norite automatiškai užpildyti gamyklinius duomenis?`;
}

export function setPendingBarcodeOffer(barcode: string): void {
  pending = {
    barcode,
    message: buildBarcodeOfferMessage(barcode),
    savedAt: Date.now(),
  };
}

export function peekPendingBarcodeOffer(): PendingBarcodeOffer | null {
  return pending;
}

export function clearPendingBarcodeOffer(): void {
  pending = null;
}

export function consumePendingBarcodeOffer(): PendingBarcodeOffer | null {
  const hit = pending;
  pending = null;
  return hit;
}

export const BARCODE_OFFER_ACCEPT_CHIP = "✅ Taip, užpildyti duomenis";
export const BARCODE_OFFER_DECLINE_CHIP = "✏️ Įvesiu pati";

export function isBarcodeOfferAccept(text: string): boolean {
  const n = text.trim().toLowerCase();
  return (
    n.includes("užpildyti") ||
    n.includes("taip") ||
    n === BARCODE_OFFER_ACCEPT_CHIP.toLowerCase()
  );
}

export type { BarcodeLookupResult };
