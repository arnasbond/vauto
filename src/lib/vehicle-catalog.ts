/** LT vehicle catalog for step-by-step listing wizard (autoplius-style). */

export interface VehicleModification {
  id: string;
  label: string;
  bodyType: string;
  fuelType: string;
  doors: string;
  engineCc?: string;
  powerKw?: string;
}

export const VEHICLE_MAKES = [
  "Audi",
  "BMW",
  "Citroën",
  "Dacia",
  "Fiat",
  "Ford",
  "Honda",
  "Hyundai",
  "Kia",
  "Mazda",
  "Mercedes-Benz",
  "Nissan",
  "Opel",
  "Peugeot",
  "Renault",
  "Seat",
  "Škoda",
  "Toyota",
  "Volkswagen",
  "Volvo",
  "Kita",
] as const;

export const MODELS_BY_MAKE: Record<string, string[]> = {
  Citroën: [
    "Kita",
    "C1",
    "C3",
    "C4",
    "C5",
    "Berlingo",
    "DS3",
    "DS4",
    "DS5",
    "DS7",
    "Xsara",
    "C-Elysée",
    "C4 Picasso",
    "C5 Aircross",
  ],
  Volkswagen: ["Kita", "Golf", "Passat", "Polo", "Tiguan", "Touran", "Transporter"],
  BMW: ["Kita", "320", "520", "X1", "X3", "X5", "118", "218"],
  Audi: ["Kita", "A3", "A4", "A6", "Q3", "Q5", "Q7"],
  Toyota: ["Kita", "Corolla", "Yaris", "RAV4", "Avensis", "C-HR"],
  Opel: ["Kita", "Astra", "Corsa", "Insignia", "Mokka", "Zafira"],
  Ford: ["Kita", "Focus", "Fiesta", "Mondeo", "Kuga", "Transit"],
  Peugeot: ["Kita", "208", "308", "3008", "508", "Partner"],
  Renault: ["Kita", "Clio", "Megane", "Captur", "Scenic", "Kangoo"],
};

export const MODIFICATIONS_BY_MODEL: Record<string, VehicleModification[]> = {
  "Citroën|DS5": [
    {
      id: "ds5-thp200",
      label: "1.6 THP (200 Hp)",
      bodyType: "Hečbekas",
      fuelType: "Benzinas",
      doors: "4/5",
      engineCc: "1598",
      powerKw: "147",
    },
    {
      id: "ds5-ehdi115",
      label: "1.6 e-HDi (115 Hp) Airdream EGS6",
      bodyType: "Hečbekas",
      fuelType: "Dyzelinas",
      doors: "4/5",
      engineCc: "1560",
      powerKw: "85",
    },
    {
      id: "ds5-hdi160",
      label: "2.0 HDi (160 Hp) Automatic",
      bodyType: "Hečbekas",
      fuelType: "Dyzelinas",
      doors: "4/5",
      engineCc: "1997",
      powerKw: "120",
    },
    {
      id: "ds5-thp155",
      label: "1.6 THP (155 Hp) Automatic",
      bodyType: "Hečbekas",
      fuelType: "Benzinas",
      doors: "4/5",
      engineCc: "1598",
      powerKw: "114",
    },
  ],
};

export const BODY_TYPES = [
  "Sedanas",
  "Hečbekas",
  "Universalas",
  "Vienatūris",
  "Visureigis / Krosoveris",
  "Kupė",
  "Kabrioletas",
  "Furgonas",
] as const;

export const FUEL_TYPES = [
  "Dyzelinas",
  "Benzinas",
  "Benzinas / dujos",
  "Benzinas / elektra",
  "Elektra",
  "Hibridas",
] as const;

export const GEARBOX_TYPES = ["Automatinė", "Mechaninė"] as const;

export const DRIVE_TYPES = ["Priekiniai", "Galiniai", "Visi varantieji"] as const;

export const DOOR_COUNTS = ["2/3", "4/5", "Kita"] as const;

export const DEFECT_OPTIONS = ["Be defektų", "Smulkūs įbrėžimai", "Yra defektų"] as const;

export const STEERING_OPTIONS = ["Kairėje", "Dešinėje (Anglija)"] as const;

export const COLOR_OPTIONS = [
  "Juoda",
  "Balta",
  "Sidabrinė",
  "Pilka",
  "Mėlyna",
  "Raudona",
  "Žalia",
  "Kita",
] as const;

export const REGISTRATION_YEARS = Array.from(
  { length: 2026 - 1985 + 1 },
  (_, i) => String(2026 - i)
);

export const REGISTRATION_MONTHS = [
  { value: "", label: "—" },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: String(i + 1).padStart(2, "0"),
  })),
];

export function modelsForMake(make: string): string[] {
  return MODELS_BY_MAKE[make] ?? ["Kita"];
}

export function modificationsFor(make: string, model: string): VehicleModification[] {
  return MODIFICATIONS_BY_MODEL[`${make}|${model}`] ?? [];
}

export function engineCcSuggestions(make: string, model: string): string[] {
  const mods = modificationsFor(make, model);
  const set = new Set(mods.map((m) => m.engineCc).filter(Boolean) as string[]);
  return [...set];
}

export function powerKwSuggestions(make: string, model: string): string[] {
  const mods = modificationsFor(make, model);
  const set = new Set(mods.map((m) => m.powerKw).filter(Boolean) as string[]);
  return [...set];
}

export function vehicleSummaryLabel(attrs: Record<string, string | string[] | undefined>): string {
  const make = String(attrs.make ?? "").trim();
  const model = String(attrs.model ?? "").trim();
  const year = String(attrs.year ?? "").trim();
  if (!make && !model) return "";
  const base = [make, model].filter(Boolean).join(" ");
  return year ? `${base} | ${year}` : base;
}
