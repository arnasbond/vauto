/**
 * VAUTO legal issuer for PVM sąskaitos-faktūros.
 * Override via env on Render — never ship fake codes in production.
 */
export interface VautoLegalIssuer {
  name: string;
  companyCode: string;
  vatCode: string;
  address: string;
  email: string;
}

export function getVautoLegalIssuer(): VautoLegalIssuer {
  return {
    name:
      process.env.VAUTO_LEGAL_NAME?.trim() ||
      process.env.NEXT_PUBLIC_VAUTO_LEGAL_NAME?.trim() ||
      "UAB VAUTO Marketplace",
    companyCode:
      process.env.VAUTO_COMPANY_CODE?.trim() ||
      process.env.NEXT_PUBLIC_VAUTO_COMPANY_CODE?.trim() ||
      "",
    vatCode:
      process.env.VAUTO_VAT_CODE?.trim() ||
      process.env.NEXT_PUBLIC_VAUTO_VAT_CODE?.trim() ||
      "",
    address:
      process.env.VAUTO_LEGAL_ADDRESS?.trim() ||
      process.env.NEXT_PUBLIC_VAUTO_LEGAL_ADDRESS?.trim() ||
      "",
    email:
      process.env.VAUTO_BILLING_EMAIL?.trim() ||
      process.env.NEXT_PUBLIC_VAUTO_BILLING_EMAIL?.trim() ||
      "saskaitos@vauto.lt",
  };
}

export function calcVatFromGross(grossEur: number, vatRate = 0.21) {
  const amountGross = Math.round(grossEur * 100) / 100;
  const amountNet = Math.round((amountGross / (1 + vatRate)) * 100) / 100;
  const vatAmount = Math.round((amountGross - amountNet) * 100) / 100;
  return { amountNet, vatAmount, amountGross, vatRate };
}
