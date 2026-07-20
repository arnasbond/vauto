/** Lithuanian standard VAT rate for marketplace display. */
export const LT_VAT_RATE = 0.21;

export interface VatPriceBreakdown {
  hasVat: boolean;
  priceGross: number;
  priceNet: number;
  vatAmount: number;
  vatRate: number;
  labelGross: string;
  labelNet: string;
}

/**
 * Seller-entered price is treated as GROSS (with VAT) when vatCode is present.
 */
export function computeVatBreakdown(
  priceGross: number,
  vatCode?: string | null
): VatPriceBreakdown {
  const gross = Math.max(0, Number(priceGross) || 0);
  const hasVat = Boolean(String(vatCode ?? "").trim());
  if (!hasVat || gross <= 0) {
    return {
      hasVat: false,
      priceGross: gross,
      priceNet: gross,
      vatAmount: 0,
      vatRate: LT_VAT_RATE,
      labelGross: gross > 0 ? `${gross} €` : "",
      labelNet: gross > 0 ? `${gross} €` : "",
    };
  }
  const net = Math.round((gross / (1 + LT_VAT_RATE)) * 100) / 100;
  const vatAmount = Math.round((gross - net) * 100) / 100;
  return {
    hasVat: true,
    priceGross: gross,
    priceNet: net,
    vatAmount,
    vatRate: LT_VAT_RATE,
    labelGross: `${gross} € su PVM`,
    labelNet: `${net} € be PVM`,
  };
}
