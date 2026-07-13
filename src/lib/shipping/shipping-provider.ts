export type ShippingProviderId = "omniva" | "lp_express" | "dpd";
export type ParcelSize = "S" | "M" | "L";

export interface ShippingProviderOption {
  id: ShippingProviderId;
  label: string;
  description: string;
  lockerNetwork: string;
}

export interface DemoShipmentLabel {
  provider: ShippingProviderOption;
  parcelSize: ParcelSize;
  trackingCode: string;
  qrPayload: string;
  instructions: string;
}

export const SHIPPING_PROVIDERS: ShippingProviderOption[] = [
  {
    id: "omniva",
    label: "Omniva paštomatas",
    description: "Plačiausias paštomatų tinklas C2C siuntoms.",
    lockerNetwork: "Omniva LT",
  },
  {
    id: "lp_express",
    label: "LP Express",
    description: "Lietuvos pašto paštomatai ir siuntų terminalai.",
    lockerNetwork: "LP Express",
  },
  {
    id: "dpd",
    label: "DPD Pickup",
    description: "Paštomatai ir Pickup taškai visoje Lietuvoje.",
    lockerNetwork: "DPD Lietuva",
  },
];

/** Kurjerių webhook statusas — aktyvuoja 24h express escrow. */
export const COURIER_LOCKER_DELIVERED_STATUS = "Pristatyta į paštomatą";

export function isLockerDeliveredStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (
    s === COURIER_LOCKER_DELIVERED_STATUS.toLowerCase() ||
    s.includes("pristatyta") && s.includes("paštomat")
  );
}

export function createDemoShipmentLabel(params: {
  providerId: ShippingProviderId;
  parcelSize: ParcelSize;
  listingTitle: string;
  amount: number;
}): DemoShipmentLabel {
  const provider =
    SHIPPING_PROVIDERS.find((p) => p.id === params.providerId) ??
    SHIPPING_PROVIDERS[0];
  const suffix = Math.floor(100000 + Math.random() * 900000);
  const trackingCode = `${provider.id.toUpperCase().replace("_", "")}-${suffix}`;
  return {
    provider,
    parcelSize: params.parcelSize,
    trackingCode,
    qrPayload: `VAUTO-SHIP:${trackingCode}:${params.listingTitle}:${params.amount}`,
    instructions: `Nueikite prie ${provider.label} ir įdėkite ${params.parcelSize} dydžio siuntą pagal nurodymus telefone.`,
  };
}
