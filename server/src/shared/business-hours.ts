export type WeekdayKey =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export interface DayHours {
  open: string; // "09:00"
  close: string; // "18:00"
  closed?: boolean;
}

export type BusinessHours = Partial<Record<WeekdayKey, DayHours>>;

const WEEKDAY_BY_UTC_DAY: WeekdayKey[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

/** Default Mon–Fri 09:00–18:00 Europe/Vilnius business hours. */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "10:00", close: "14:00", closed: true },
  sun: { open: "00:00", close: "00:00", closed: true },
};

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

/** True when "now" is inside configured open window (Europe/Vilnius wall clock). */
export function isWithinBusinessHours(
  hours: BusinessHours | null | undefined,
  now: Date = new Date()
): boolean {
  const map = hours && Object.keys(hours).length ? hours : DEFAULT_BUSINESS_HOURS;
  const vilnius = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Vilnius" })
  );
  const key = WEEKDAY_BY_UTC_DAY[vilnius.getDay()]!;
  const day = map[key];
  if (!day || day.closed) return false;
  const mins = vilnius.getHours() * 60 + vilnius.getMinutes();
  const open = parseHm(day.open);
  const close = parseHm(day.close);
  if (open < 0 || close < 0 || close <= open) return false;
  return mins >= open && mins < close;
}

export function formatBusinessHoursSummary(hours?: BusinessHours | null): string {
  const map = hours && Object.keys(hours).length ? hours : DEFAULT_BUSINESS_HOURS;
  const fri = map.fri;
  if (fri && !fri.closed) {
    return `Darbo laikas: I–V ${fri.open}–${fri.close} (Europe/Vilnius)`;
  }
  return "Darbo laikas nurodytas įmonės profilyje.";
}
