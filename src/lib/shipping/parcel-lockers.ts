import type { ShippingProviderId } from "@/lib/shipping/shipping-provider";

export interface ParcelLocker {
  id: string;
  name: string;
  city: string;
  address: string;
}

/** LP Express / Omniva placeholder — real API integracija vėlesniame etape. */
export const PARCEL_LOCKERS: Record<ShippingProviderId, ParcelLocker[]> = {
  omniva: [
    {
      id: "omniva-vilnius-akropolis",
      name: "Omniva — Akropolis",
      city: "Vilnius",
      address: "Ozo g. 25, PC Akropolis",
    },
    {
      id: "omniva-kaunas-megos",
      name: "Omniva — Mega",
      city: "Kaunas",
      address: "Islandijos pl. 32",
    },
    {
      id: "omniva-klaipeda-akropolis",
      name: "Omniva — Akropolis",
      city: "Klaipėda",
      address: "Taikos pr. 61",
    },
  ],
  lp_express: [
    {
      id: "lp-vilnius-gedimino",
      name: "LP Express — Gedimino",
      city: "Vilnius",
      address: "Gedimino pr. 12",
    },
    {
      id: "lp-kaunas-savanes",
      name: "LP Express — Savanorių",
      city: "Kaunas",
      address: "Savanorių pr. 255",
    },
    {
      id: "lp-panevezys-centras",
      name: "LP Express — Centras",
      city: "Panevėžys",
      address: "Respublikos g. 40",
    },
  ],
  dpd: [
    {
      id: "dpd-vilnius-nordika",
      name: "DPD Pickup — Nordika",
      city: "Vilnius",
      address: "Ozo g. 18",
    },
    {
      id: "dpd-kaunas-centras",
      name: "DPD Pickup — Centras",
      city: "Kaunas",
      address: "Laisvės al. 99",
    },
  ],
};

export function lockersForProvider(providerId: ShippingProviderId): ParcelLocker[] {
  return PARCEL_LOCKERS[providerId] ?? PARCEL_LOCKERS.omniva;
}
