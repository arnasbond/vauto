export type PaymentProviderId = "montonio" | "kevin" | "bank_link";

export interface PaymentProviderOption {
  id: PaymentProviderId;
  label: string;
  description: string;
  feePercent: number;
}

export interface DemoPaymentIntent {
  id: string;
  provider: PaymentProviderOption;
  amount: number;
  buyerProtectionFee: number;
  total: number;
  status: "created" | "paid";
}

export const PAYMENT_PROVIDERS: PaymentProviderOption[] = [
  {
    id: "montonio",
    label: "Montonio Bank Link",
    description: "El. bankininkystė Lietuvoje, kortelės ir Apple/Google Pay paruošta.",
    feePercent: 1.2,
  },
  {
    id: "kevin",
    label: "Kevin account-to-account",
    description: "Greitas bankinis mokėjimas su mažesniu transakcijos mokesčiu.",
    feePercent: 0.8,
  },
  {
    id: "bank_link",
    label: "Bank Link demo",
    description: "Fallback bankinio mokėjimo scenarijus prototipui.",
    feePercent: 1,
  },
];

export function createDemoPaymentIntent(
  amount: number,
  providerId: PaymentProviderId
): DemoPaymentIntent {
  const provider =
    PAYMENT_PROVIDERS.find((p) => p.id === providerId) ?? PAYMENT_PROVIDERS[0];
  const buyerProtectionFee = Math.max(0.5, Math.round(amount * provider.feePercent) / 100);
  return {
    id: `pay-${provider.id}-${Date.now()}`,
    provider,
    amount,
    buyerProtectionFee,
    total: Math.round((amount + buyerProtectionFee) * 100) / 100,
    status: "paid",
  };
}
