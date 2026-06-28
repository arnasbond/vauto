/** Platform buyer protection fee — 5% of negotiated item price. */
export const BUYER_PROTECTION_FEE_PERCENT = 5;

export function calculateBuyerProtectionFee(
  amountEur: number,
  freeCredits = 0
): number {
  if (freeCredits > 0) return 0;
  const fee = (amountEur * BUYER_PROTECTION_FEE_PERCENT) / 100;
  return Math.round(Math.max(0.01, fee) * 100) / 100;
}

export function calculateBuyerTotal(amountEur: number, freeCredits = 0): number {
  const fee = calculateBuyerProtectionFee(amountEur, freeCredits);
  return Math.round((amountEur + fee) * 100) / 100;
}

export function buyerProtectionExplanation(): string {
  return (
    "Šis mokestis garantuoja visišką pinigų grąžinimą, jei prekė neatitiks nuotraukos."
  );
}
