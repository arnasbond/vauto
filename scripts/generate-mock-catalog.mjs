/**
 * Generates 100 realistic Lithuanian marketplace listings for VAUTO demo/seed.
 * Run: node scripts/generate-mock-catalog.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const CITIES = [
  "Vilnius", "Kaunas", "Klaipėda", "Šiauliai", "Panevėžys", "Alytus",
  "Marijampolė", "Mažeikiai", "Biržai", "Utena", "Kupiškis", "Telšiai",
  "Tauragė", "Ukmergė", "Palanga", "Jonava", "Kėdainiai", "Druskininkai",
  "Rokiškis", "Pasvalys",
];

const CAR_IMAGES = {
  sedan: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop",
  wagon: "https://images.unsplash.com/photo-1609521263040-82f9f49b7c65?w=800&h=600&fit=crop",
  suv: "https://images.unsplash.com/photo-1519641471654-76cead78234a?w=800&h=600&fit=crop",
  luxury: "https://images.unsplash.com/photo-1618843479311-63f341a8f327?w=800&h=600&fit=crop",
  compact: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&h=600&fit=crop",
  hybrid: "https://images.unsplash.com/photo-1542362567-b07e54358753?w=800&h=600&fit=crop",
  audi: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&h=600&fit=crop",
  mercedes: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&h=600&fit=crop",
};

const ELECTRONICS_IMAGES = [
  "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1606144042614-b2417e99c4ee?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=800&h=600&fit=crop",
];

const SERVICE_IMAGES = [
  "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1625047509248-ec889cbff097?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1619642751034-765df69d01c9?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1621939514649-280e2ee02577?w=800&h=600&fit=crop",
];

const BODY_TYPES = ["Sedanas", "Universalas", "Visureigis", "Hečbekas", "Kupė"];
const FUEL_TYPES = ["Dyzelinas", "Benzinas", "Hibridas", "Plug-in hibridas"];
const TRANSMISSIONS = ["Mechaninė", "Automatinė", "Automatinė su padėtimis"];

const DESC_FEATURES = [
  "Techninė apžiūra galioja iki {ta}.",
  "Serviso knygelė su visais įrašais.",
  "Du raktelių komplektas.",
  "Naujos vasarinės padangos.",
  "Klimato kontrolė, šildomos sėdynės.",
  "Navigacija, atbulinės kameros.",
  "LED žibintai, lietaus jutiklis.",
  "Be dūmų, be rūdžių.",
  "Vienas savininkas Lietuvoje.",
  "Importuota iš Vokietijos, tvarkinga istorija.",
  "Neseniai atlikta didžioji TO.",
  "Nauja vairo traukė, stabdžių diskai.",
  "Odinis salonas, panoraminis stogas.",
  "Apple CarPlay / Android Auto.",
  "Parkavimo jutikliai priekyje ir gale.",
  "Automatinis parkavimas.",
  "Xenon/LED priekiniai žibintai.",
  "Start-stop sistema, mažos sąnaudos.",
  "4×4 visų ratų pavara.",
  "Automatinė bagažinės dangtis.",
];

const VEHICLE_SPECS = [
  { make: "BMW", model: "320d", body: "Sedanas", img: "sedan", fuel: "Dyzelinas" },
  { make: "BMW", model: "320d Touring", body: "Universalas", img: "wagon", fuel: "Dyzelinas" },
  { make: "BMW", model: "520d", body: "Sedanas", img: "sedan", fuel: "Dyzelinas" },
  { make: "BMW", model: "530e", body: "Sedanas", img: "hybrid", fuel: "Plug-in hibridas" },
  { make: "BMW", model: "X5 xDrive30d", body: "Visureigis", img: "suv", fuel: "Dyzelinas" },
  { make: "BMW", model: "318i", body: "Sedanas", img: "sedan", fuel: "Benzinas" },
  { make: "Audi", model: "A4 Avant", body: "Universalas", img: "audi", fuel: "Dyzelinas" },
  { make: "Audi", model: "A4", body: "Sedanas", img: "audi", fuel: "Dyzelinas" },
  { make: "Audi", model: "A6", body: "Sedanas", img: "audi", fuel: "Dyzelinas" },
  { make: "Audi", model: "Q5", body: "Visureigis", img: "suv", fuel: "Dyzelinas" },
  { make: "Audi", model: "A3 Sportback", body: "Hečbekas", img: "compact", fuel: "Benzinas" },
  { make: "Volkswagen", model: "Golf", body: "Hečbekas", img: "compact", fuel: "Dyzelinas" },
  { make: "Volkswagen", model: "Passat", body: "Universalas", img: "wagon", fuel: "Dyzelinas" },
  { make: "Volkswagen", model: "Tiguan", body: "Visureigis", img: "suv", fuel: "Dyzelinas" },
  { make: "Volkswagen", model: "Touran", body: "Universalas", img: "wagon", fuel: "Dyzelinas" },
  { make: "Volvo", model: "V70", body: "Universalas", img: "wagon", fuel: "Dyzelinas" },
  { make: "Volvo", model: "XC60", body: "Visureigis", img: "suv", fuel: "Dyzelinas" },
  { make: "Volvo", model: "XC90", body: "Visureigis", img: "suv", fuel: "Dyzelinas" },
  { make: "Volvo", model: "S60", body: "Sedanas", img: "sedan", fuel: "Benzinas" },
  { make: "Toyota", model: "Corolla", body: "Hečbekas", img: "hybrid", fuel: "Hibridas" },
  { make: "Toyota", model: "Avensis", body: "Universalas", img: "wagon", fuel: "Dyzelinas" },
  { make: "Toyota", model: "RAV4", body: "Visureigis", img: "suv", fuel: "Hibridas" },
  { make: "Toyota", model: "Yaris", body: "Hečbekas", img: "compact", fuel: "Benzinas" },
  { make: "Mercedes-Benz", model: "C220 d", body: "Sedanas", img: "mercedes", fuel: "Dyzelinas" },
  { make: "Mercedes-Benz", model: "E220 d", body: "Sedanas", img: "mercedes", fuel: "Dyzelinas" },
  { make: "Mercedes-Benz", model: "GLC 220 d", body: "Visureigis", img: "suv", fuel: "Dyzelinas" },
  { make: "Mercedes-Benz", model: "A180", body: "Hečbekas", img: "compact", fuel: "Benzinas" },
  { make: "Skoda", model: "Octavia", body: "Universalas", img: "wagon", fuel: "Dyzelinas" },
  { make: "Ford", model: "Focus", body: "Hečbekas", img: "compact", fuel: "Dyzelinas" },
  { make: "Opel", model: "Insignia", body: "Universalas", img: "wagon", fuel: "Dyzelinas" },
];

const ELECTRONICS_SPECS = [
  { title: "iPhone 15 Pro 256 GB", price: 980, tags: ["iphone", "telefonas", "apple"] },
  { title: "iPhone 14 128 GB", price: 620, tags: ["iphone", "telefonas"] },
  { title: "Samsung Galaxy S24 Ultra", price: 890, tags: ["samsung", "telefonas", "android"] },
  { title: "MacBook Air M2 13\"", price: 1050, tags: ["macbook", "apple", "kompiuteris"] },
  { title: "iPad Pro 11\" M2", price: 780, tags: ["ipad", "planšetė"] },
  { title: "PlayStation 5 + 2 pultai", price: 420, tags: ["ps5", "žaidimai", "konsolė"] },
  { title: "Dyson V15 Detect", price: 480, tags: ["dyson", "siurblys", "namams"] },
  { title: "Sony WH-1000XM5 ausinės", price: 260, tags: ["sony", "ausinės", "bluetooth"] },
];

const SERVICE_SPECS = [
  { title: "Automobilio detailing — pilnas paketas", price: 120, priceLabel: "nuo 120€", tags: ["detailing", "plovimas", "automobilis"] },
  { title: "Padangų montavimas ir balansavimas", price: 35, priceLabel: "nuo 35€", tags: ["padangos", "montavimas", "autoservisas"] },
  { title: "Paruošimas techninei apžiūrai", price: 45, priceLabel: "nuo 45€", tags: ["ta", "techninė", "autoservisas"] },
  { title: "Variklio diagnostika OBD", price: 25, priceLabel: "25€", tags: ["diagnostika", "obd", "autoservisas"] },
  { title: "Automobilio supirkimas — greitas atsiskaitymas", price: 0, priceLabel: "Kaina pagal auto", tags: ["supirkimas", "automobilis"] },
  { title: "Kėbulų dažymas — profesionaliai", price: 350, priceLabel: "nuo 350€", tags: ["dažymas", "kėbulas", "autoservisas"] },
  { title: "Evacuatorius 24/7 visoje Lietuvoje", price: 40, priceLabel: "nuo 40€", tags: ["evakuatorius", "pagalba", "kelyje"] },
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function mileageForYear(year) {
  const age = 2024 - year;
  const base = 8000 + (iHash(year) % 5000);
  return Math.min(320000, age * base + (iHash(year * 7) % 40000));
}

function iHash(n) {
  return Math.abs(((n * 9301 + 49297) % 233280));
}

function priceForVehicle(year, spec, index) {
  const age = 2024 - year;
  let base = 26500 - age * 1050;
  if (spec.make === "Mercedes-Benz" || spec.make === "BMW") base += 2200;
  if (spec.body === "Visureigis") base += 1600;
  if (year >= 2020) base += 1400;
  if (age >= 18) base = Math.min(base, 5200);
  if (age >= 20) base = Math.min(base, 3800);
  const jitter = (iHash(index * 13) % 3500) - 1200;
  let price = Math.max(1500, base + jitter);
  if (index % 11 === 0) price = Math.round(price * 1.18);
  if (index % 17 === 0) price = Math.round(price * 1.25);
  return Math.round(price / 50) * 50;
}

function buildVehicleDescription(spec, year, city, index) {
  const ta = `${2025 + (index % 3)}-${String((index % 12) + 1).padStart(2, "0")}`;
  const feats = [];
  for (let f = 0; f < 4; f++) {
    const tpl = DESC_FEATURES[(index + f * 7) % DESC_FEATURES.length];
    feats.push(tpl.replace("{ta}", ta));
  }
  const km = mileageForYear(year);
  const trans = pick(TRANSMISSIONS, index);
  const cond = index % 5 === 0 ? "Kėbulo būklė puiki, keli kosmetiniai pabraižymai." :
    index % 5 === 1 ? "Be eismo įvykių, originali dažų spalva." :
    index % 5 === 2 ? "Priekinis buferis dažytas, techniškai tvarkinga." :
    index % 5 === 3 ? "Salonas labai tvarkingas, nerūkytas." :
    "Visi saugumo elementai veikia, paruošta registracijai.";
  return `${spec.make} ${spec.model} ${year} m. iš ${city}. Rida ${km.toLocaleString("lt-LT")} km, ${spec.fuel.toLowerCase()}, ${trans.toLowerCase()}. ${cond} ${feats.join(" ")}`;
}

function buildElectronicsDescription(title, city, index) {
  const variants = [
    `Parduodu ${title} — naudotas, bet be defektų. Ekranas be įbrėžimų, baterija laiko puikiai. Komplektas su dėklu ir įkrovikliu. Galima apžiūrėti ${city}.`,
    `${title} — pirktas oficialioje parduotuvėje, liko garantija. Visi priedai, dėžutė ir kvitas. Perduodu ${city} centre.`,
    `Tvarkingas ${title}, naudotas namuose. Be vandens pažeidimų, visos funkcijos veikia. Greitas susitikimas ${city}.`,
    `${title} — atnaujintas programinė įranga, Face ID/Touch ID veikia. Idealus kasdieniam naudojimui. ${city}, galiu atvežti.`,
  ];
  return variants[index % variants.length];
}

function buildServiceDescription(title, city, index) {
  const variants = [
    `${title} — dirbame ${city} ir apylinkėse. Profesionali įranga, sąskaitos faktūros. Skambinkite dėl laiko.`,
    `Siūlome ${title.toLowerCase()} ${city} regione. Greitas aptarnavimas, patyrę meistrai, garantija darbams.`,
    `${title}. Atvykstame į vietą ${city} mieste. Skaidri kainodara, be paslėptų mokesčių.`,
    `${title} — ilgametė patirtis, rekomendacijos klientų. ${city} ir visa Lietuva.`,
  ];
  return variants[index % variants.length];
}

function vinFor(index) {
  const chars = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ";
  let v = "WBA";
  for (let i = 0; i < 14; i++) v += chars[(index * 17 + i * 31) % chars.length];
  return v;
}

const listings = [];
let idx = 0;

for (let v = 0; v < 85; v++) {
  const spec = pick(VEHICLE_SPECS, v);
  const year = 2000 + (v * 7 + 3) % 25;
  const city = pick(CITIES, v * 3 + 1);
  const price = priceForVehicle(year, spec, v);
  const km = mileageForYear(year);
  const id = `lt-auto-${String(v + 1).padStart(3, "0")}`;
  const ta = `${2025 + (v % 2)}-${String((v % 12) + 1).padStart(2, "0")}`;

  listings.push({
    id,
    title: `${spec.make} ${spec.model} ${year}`,
    price,
    location: city,
    distanceKm: Math.round((1 + (v % 40) + (v % 10) * 0.3) * 10) / 10,
    contact: `Tel. +370 6${String(1000000 + v * 7919).slice(0, 7)}`,
    image: CAR_IMAGES[spec.img] ?? CAR_IMAGES.sedan,
    category: "vehicles",
    tags: [spec.make.toLowerCase(), spec.model.split(" ")[0].toLowerCase(), "automobilis", spec.fuel.toLowerCase(), city.toLowerCase()],
    attributes: {
      make: spec.make,
      model: spec.model,
      year: String(year),
      mileage: `${km.toLocaleString("lt-LT")} km`,
      fuelType: spec.fuel,
      bodyType: spec.body,
      transmission: pick(TRANSMISSIONS, v),
      taExpiry: ta,
      vin: vinFor(v),
      defects: v % 8 === 0 ? "Smulkūs kosmetiniai defektai" : "Nėra",
    },
    description: buildVehicleDescription(spec, year, city, v),
    sellerId: `seller-auto-${(v % 20) + 1}`,
    createdAt: new Date(Date.UTC(2026, 5, 1 + (v % 28), 8 + (v % 10), (v * 13) % 60)).toISOString(),
    vinVerified: v % 3 !== 0,
    providerVerified: v % 7 === 0,
  });
  idx++;
}

for (let e = 0; e < 8; e++) {
  const spec = ELECTRONICS_SPECS[e];
  const city = pick(CITIES, e * 5 + 2);
  const id = `lt-el-${String(e + 1).padStart(3, "0")}`;
  listings.push({
    id,
    title: spec.title,
    price: spec.price + (e % 3) * 30,
    location: city,
    distanceKm: Math.round((2 + e * 1.7) * 10) / 10,
    contact: `Tel. +370 6${String(2000000 + e * 12345).slice(0, 7)}`,
    image: ELECTRONICS_IMAGES[e % ELECTRONICS_IMAGES.length],
    category: "electronics",
    tags: [...spec.tags, city.toLowerCase()],
    description: buildElectronicsDescription(spec.title, city, e),
    sellerId: `seller-el-${(e % 5) + 1}`,
    createdAt: new Date(Date.UTC(2026, 5, 10 + e, 10, e * 7)).toISOString(),
  });
  idx++;
}

for (let s = 0; s < 7; s++) {
  const spec = SERVICE_SPECS[s];
  const city = pick(CITIES, s * 4 + 3);
  const id = `lt-svc-${String(s + 1).padStart(3, "0")}`;
  listings.push({
    id,
    title: spec.title,
    price: spec.price,
    priceLabel: spec.priceLabel,
    location: city,
    distanceKm: Math.round((1.5 + s * 2.1) * 10) / 10,
    contact: `Tel. +370 6${String(3000000 + s * 9876).slice(0, 7)}`,
    image: SERVICE_IMAGES[s % SERVICE_IMAGES.length],
    category: "services",
    tags: [...spec.tags, city.toLowerCase(), "paslauga"],
    description: buildServiceDescription(spec.title, city, s),
    sellerId: `seller-svc-${(s % 4) + 1}`,
    createdAt: new Date(Date.UTC(2026, 5, 15 + s, 9, s * 11)).toISOString(),
    providerVerified: true,
  });
  idx++;
}

if (listings.length !== 100) {
  throw new Error(`Expected 100 listings, got ${listings.length}`);
}

const tsContent = `/** Auto-generated by scripts/generate-mock-catalog.mjs — do not edit manually */
import type { Listing } from "@/lib/types";

/** 100 realistic listings spread across Lithuania for demo, search and monetization QA. */
export const LITHUANIA_MOCK_CATALOG: Listing[] = ${JSON.stringify(listings, null, 2)} as Listing[];
`;

const serverRows = listings.map((l) => ({
  id: l.id,
  seller_id: l.sellerId,
  title: l.title,
  price: l.price,
  ...(l.priceLabel ? { price_label: l.priceLabel } : {}),
  location: l.location,
  distance_km: l.distanceKm,
  image: l.image,
  category: l.category,
  tags: l.tags,
  has_video: Boolean(l.hasVideo),
  contact: l.contact,
  description: l.description,
  attributes: l.attributes,
  provider_verified: l.providerVerified,
  vin_verified: l.vinVerified,
}));

const serverContent = `/** Auto-generated by scripts/generate-mock-catalog.mjs — do not edit manually */
import type { DemoListingRow } from "./demo-listings.js";

export const GENERATED_DEMO_LISTINGS: DemoListingRow[] = ${JSON.stringify(serverRows, null, 2)};
`;

const agentSnapshot = listings.map((l) => ({
  id: l.id,
  title: l.title,
  price: l.price,
  category: l.category,
  location: l.location,
  description: (l.description ?? "").slice(0, 160),
}));

const apiAgentContent = `/** Auto-generated by scripts/generate-mock-catalog.mjs — do not edit manually */
module.exports.DEMO_LISTINGS_SNAPSHOT = ${JSON.stringify(agentSnapshot, null, 2)};
`;

writeFileSync(join(root, "src/data/lithuania-mock-catalog.ts"), tsContent, "utf8");
writeFileSync(join(root, "server/src/generated-demo-listings.ts"), serverContent, "utf8");
writeFileSync(join(root, "api/lib/demo-listings-snapshot.js"), apiAgentContent, "utf8");

console.log(`Generated ${listings.length} listings:`);
console.log(`  vehicles: ${listings.filter((l) => l.category === "vehicles").length}`);
console.log(`  electronics: ${listings.filter((l) => l.category === "electronics").length}`);
console.log(`  services: ${listings.filter((l) => l.category === "services").length}`);
console.log(`  cities: ${new Set(listings.map((l) => l.location)).size} unique`);
