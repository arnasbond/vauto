export type PastomatasFlowStep =
  | "idle"
  | "choose_locker"
  | "collect_recipient"
  | "label_ready";

export type ShippingMode = "simulated" | "live";

export interface PastomatasLockerOption {
  id: string;
  name: string;
  address: string;
  city: string;
}

export interface PastomatasFlowState {
  step: PastomatasFlowStep;
  city: string;
  lockerId?: string;
  lockerName?: string;
  recipientName?: string;
  recipientPhone?: string;
  parcelCode?: string;
  shippingMode: ShippingMode;
}

export function createPastomatasFlow(city: string, mode: ShippingMode = "simulated"): PastomatasFlowState {
  return {
    step: "choose_locker",
    city: city.trim() || "Vilnius",
    shippingMode: mode,
  };
}

export function buildLockerPrompt(city: string, lockers: PastomatasLockerOption[]): string {
  const list = lockers
    .slice(0, 5)
    .map((l, i) => `${i + 1}. ${l.name} — ${l.address}`)
    .join("\n");
  return `Pagal miestą „${city}" radau artimiausius paštomatus:\n${list}\n\nParašykite numerį (1–${Math.min(5, lockers.length)}) arba paštomato pavadinimą.`;
}

export function buildRecipientPrompt(lockerName: string): string {
  return `Pasirinkote: ${lockerName}.\nĮrašykite gavėjo vardą ir telefoną vienoje eilutėje, pvz.: „Jonas +37061234567“.`;
}

export function buildParcelLabelBubble(input: {
  lockerName: string;
  recipientName: string;
  recipientPhone: string;
  parcelCode: string;
  shippingMode: ShippingMode;
}): string {
  const modeNote =
    input.shippingMode === "live"
      ? "Lipdukas paruoštas vežėjui."
      : "Simuliacinis siuntos kodas (demo režimas) — gyvam Omniva reikia live kredencialų.";
  return [
    "📦 Siuntos duomenys paruošti:",
    `Paštomatas: ${input.lockerName}`,
    `Gavėjas: ${input.recipientName}`,
    `Tel.: ${input.recipientPhone}`,
    `Kodas / lipdukas: ${input.parcelCode}`,
    modeNote,
  ].join("\n");
}

export function generateSimulatedParcelCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `OMN-LT-${n}`;
}

const PHONE_RE = /(\+?370|8)\s*\d[\d\s-]{6,}/i;

export function parseRecipientLine(text: string): {
  name: string;
  phone: string;
} | null {
  const t = text.trim();
  if (!t) return null;
  const phoneMatch = t.match(PHONE_RE);
  if (!phoneMatch) return null;
  const phone = phoneMatch[0].replace(/\s+/g, " ").trim();
  const name = t.replace(phoneMatch[0], "").replace(/[,\-–]/g, " ").trim();
  if (name.length < 2) return null;
  return { name, phone };
}
