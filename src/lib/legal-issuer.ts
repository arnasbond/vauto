/** Client-safe VAUTO legal issuer (NEXT_PUBLIC_* only). */
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
      process.env.NEXT_PUBLIC_VAUTO_LEGAL_NAME?.trim() ||
      "UAB VAUTO Marketplace",
    companyCode: process.env.NEXT_PUBLIC_VAUTO_COMPANY_CODE?.trim() || "",
    vatCode: process.env.NEXT_PUBLIC_VAUTO_VAT_CODE?.trim() || "",
    address: process.env.NEXT_PUBLIC_VAUTO_LEGAL_ADDRESS?.trim() || "",
    email:
      process.env.NEXT_PUBLIC_VAUTO_BILLING_EMAIL?.trim() ||
      "saskaitos@vauto.lt",
  };
}

export function hasRealLegalIssuer(issuer = getVautoLegalIssuer()): boolean {
  return Boolean(issuer.companyCode && issuer.vatCode);
}
