export const DEAL_STATUS_ORDER = [
  "AGREED",
  "PAID",
  "SHIPPING_PENDING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
] as const;

export type DealStatusKey = (typeof DEAL_STATUS_ORDER)[number] | string;

export function dealStatusLabel(status: string): string {
  switch (status) {
    case "DISCUSSION":
      return "Pokalbis";
    case "OFFER_PENDING":
      return "Pasiūlymas pateiktas";
    case "NEGOTIATING":
      return "Derybos";
    case "AGREED":
      return "Pasiūlymas priimtas";
    case "PAYMENT_PENDING":
      return "Laukiama mokėjimo";
    case "PAID":
      return "Apmokėta";
    case "SHIPPING_PENDING":
      return "Siunta ruošiama";
    case "SHIPPED":
      return "Išsiųsta";
    case "DELIVERED":
      return "Pristatyta";
    case "COMPLETED":
      return "Užbaigta";
    case "DISPUTED":
      return "Ginčas";
    case "CANCELLED":
      return "Atšaukta";
    case "EXPIRED":
      return "Pasibaigė";
    case "OPEN":
      return "Laukiama pasiūlymo";
    case "OFFERED":
      return "Pasiūlymas pateiktas";
    case "COUNTERED":
      return "Priešpasiūlymas";
    case "ACCEPTED":
      return "Pasiūlymas priimtas";
    case "REJECTED":
      return "Pasiūlymas atmestas";
    default:
      return status;
  }
}

export function dealStatusHint(status: string, role: "BUYER" | "SELLER"): string {
  if (status === "AGREED" && role === "BUYER") {
    return "Pasiūlymas priimtas. Galite pradėti mokėjimą — sumą nustato serveris.";
  }
  if (status === "AGREED" && role === "SELLER") {
    return "Laukiama pirkėjo mokėjimo. Būseną patvirtina tik serveris.";
  }
  if (status === "PAID" && role === "SELLER") {
    return "Mokėjimas gautas. Sukurkite Omniva siuntos lipduką.";
  }
  if (status === "PAID" && role === "BUYER") {
    return "Mokėjimas patvirtintas. Pardavėjas ruošia siuntą.";
  }
  if (status === "SHIPPING_PENDING") {
    return "Lipdukas sukurtas. Laukama kurjerio priėmimo — tai patvirtina vežėjas, ne naršyklė.";
  }
  if (status === "SHIPPED" && role === "BUYER") {
    return "Siunta kelyje. Gavę prekę, patvirtinkite gavimą.";
  }
  if (status === "SHIPPED" && role === "SELLER") {
    return "Siunta pažymėta kaip išsiųsta pagal vežėjo duomenis.";
  }
  if (status === "DELIVERED") {
    return "Gavimas patvirtintas. Sandoris užbaigiamas, kai serveris patvirtina lėšų eigą.";
  }
  if (status === "COMPLETED") {
    return "Sandoris užbaigtas. Galite palikti patvirtintą atsiliepimą.";
  }
  if (status === "DISPUTED") {
    return "Atidarytas ginčas. Sprendimą priima VAUTO, ne šalys naršyklėje.";
  }
  return "Būseną visada nustato VAUTO serveris.";
}

export function formatCentsEur(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const euros = cents / 100;
  return `${new Intl.NumberFormat("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros)} €`;
}

export function formatRatingAverage(avg: number | null | undefined): string {
  if (avg == null || !Number.isFinite(avg)) return "";
  return avg.toFixed(2);
}

/** Vežėjo sekimo būsena — paaiškinimas pirkėjui / pardavėjui (ne žaliuzinis kodas). */
export function carrierStatusHint(status: string): string {
  const key = status.trim().toUpperCase();
  switch (key) {
    case "LABEL_CREATED":
    case "SHIPPING_PENDING":
      return "Lipdukas paruoštas. Siunta dar nepriimta kurjerio — „Išsiųsta“ atsiras po vežėjo skenavimo.";
    case "CARRIER_ACCEPTED":
    case "IN_TRANSIT":
      return "Siunta kelyje. Būseną atnaujina vežėjas. Gavimo patvirtinimas Deal Room lieka jūsų.";
    case "OUT_FOR_DELIVERY":
      return "Siunta išvežta pristatymui. Kai gausite, patvirtinkite gavimą sandorio kambaryje.";
    case "DELIVERED":
      return "Vežėjas žymi pristatymą. Lėšos paleidžiamos, kai patvirtinate gavimą arba baigiasi ginčas.";
    default:
      return "Sekimo būsena ateina iš Omniva. Sandorio „Išsiųsta“ atsiranda po fizinio skenavimo, ne iš naršyklės.";
  }
}
