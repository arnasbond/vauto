/**
 * Generates 108 realistic Lithuanian marketplace listings for VAUTO demo/seed.
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
  "Rokiškis", "Pasvalys", "Plungė", "Kretinga", "Visaginas", "Šilutė",
  "Gargždai", "Radviliškis", "Šakiai",
];

/** Balanced 108-listing mix across all VAUTO categories (incl. AI atranda showcase) */
const CATEGORY_PLAN = {
  vehicles: 24,
  real_estate: 14,
  jobs: 12,
  clothing: 12,
  electronics: 12,
  home: 11,
  services: 10,
  other: 5,
  ai_discover: 8,
};

/** ~10% listings get explicit top/plus visibility for monetization grid QA */
const VISIBILITY_SLOTS = [
  { id: "lt-auto-001", tier: "top", promoted: true },
  { id: "lt-el-001", tier: "top", promoted: true },
  { id: "lt-nt-001", tier: "top" },
  { id: "lt-svc-001", tier: "top" },
  { id: "lt-auto-008", tier: "plus" },
  { id: "lt-el-004", tier: "plus" },
  { id: "lt-nt-005", tier: "plus" },
  { id: "lt-job-003", tier: "plus" },
  { id: "lt-clo-004", tier: "plus" },
  { id: "lt-home-005", tier: "plus" },
  { id: "lt-ai-002", tier: "plus" },
];

const unsplash = (id) =>
  `https://images.unsplash.com/${id}?w=800&h=600&fit=crop&auto=format`;

const CAR_IMAGES = {
  sedan: unsplash("photo-1555215695-3004980ad54e"),
  wagon: unsplash("photo-1617531653332-bd46c24f2068"),
  suv: unsplash("photo-1606664515524-ed2f786a0bd6"),
  luxury: unsplash("photo-1617531653332-bd46c24f2068"),
  compact: unsplash("photo-1552519507-da3b142c6e3d"),
  hybrid: unsplash("photo-1542362567-b07e54358753"),
  audi: unsplash("photo-1606664515524-ed2f786a0bd6"),
  mercedes: unsplash("photo-1617531653332-bd46c24f2068"),
  bmw: unsplash("photo-1555215695-3004980ad54e"),
  volvo: unsplash("photo-1617531653332-bd46c24f2068"),
  toyota: unsplash("photo-1542362567-b07e54358753"),
  volkswagen: unsplash("photo-1542362567-b07e54358753"),
};

const MAKE_IMAGES = {
  BMW: CAR_IMAGES.bmw,
  Audi: CAR_IMAGES.audi,
  "Mercedes-Benz": CAR_IMAGES.mercedes,
  Volvo: CAR_IMAGES.volvo,
  Toyota: CAR_IMAGES.toyota,
  Volkswagen: CAR_IMAGES.volkswagen,
  Skoda: CAR_IMAGES.audi,
  Ford: CAR_IMAGES.compact,
  Opel: CAR_IMAGES.wagon,
};

const ELECTRONICS_IMAGES = {
  iphone: unsplash("photo-1592899677977-9c10ca588bbd"),
  samsung: unsplash("photo-1511707171634-5f897ff02aa9"),
  macbook: unsplash("photo-1496181133206-80ce9b88a853"),
  ipad: unsplash("photo-1544244015-0df4b3ffc6b0"),
  playstation: unsplash("photo-1585060544812-6b45742d762f"),
  dyson: unsplash("photo-1558618666-fcd25c85cd64"),
  sony: unsplash("photo-1585060544812-6b45742d762f"),
};

const SERVICE_IMAGES = {
  detailing: unsplash("photo-1486262715619-67b85e0b08d3"),
  tires: unsplash("photo-1504148455328-c376907d081c"),
  diagnostic: unsplash("photo-1486262715619-67b85e0b08d3"),
  buyout: unsplash("photo-1487754180451-c456f719a1fc"),
  paint: unsplash("photo-1492144534655-ae79c964c9d7"),
  tow: unsplash("photo-1487754180451-c456f719a1fc"),
  ta: unsplash("photo-1486262715619-67b85e0b08d3"),
  plumber: unsplash("photo-1621905251189-08b45d6a269e"),
  electrician: unsplash("photo-1621905251189-08b45d6a269e"),
  cleaning: unsplash("photo-1486262715619-67b85e0b08d3"),
};

const REAL_ESTATE_IMAGES = {
  apartment: unsplash("photo-1502672260266-1c1ef2d93688"),
  house: unsplash("photo-1560518883-ce09059eeffa"),
  room: unsplash("photo-1522708323590-d24dbb6b0267"),
  land: unsplash("photo-1560518883-ce09059eeffa"),
  commercial: unsplash("photo-1497366216548-37526070297c"),
};

const JOB_IMAGES = {
  driver: unsplash("photo-1449965408869-eaa3f722e40d"),
  warehouse: unsplash("photo-1586528116311-ad8dd3c8310d"),
  office: unsplash("photo-1497366811353-6870744d04b2"),
  chef: unsplash("photo-1556910103-1c02745aae4d"),
  nurse: unsplash("photo-1576091160399-112ba8d25d1d"),
  builder: unsplash("photo-1504307651254-35680f356dfd"),
};

const CLOTHING_IMAGES = {
  jacket: unsplash("photo-1551028719-00167b16eac5"),
  shoes: unsplash("photo-1542291026-7eec264c27ff"),
  dress: unsplash("photo-1542272604-787c3835535d"),
  jeans: unsplash("photo-1542272604-787c3835535d"),
  bag: unsplash("photo-1551028719-00167b16eac5"),
  kids: unsplash("photo-1551028719-00167b16eac5"),
};

const HOME_IMAGES = {
  sofa: unsplash("photo-1617806118233-18e1de247200"),
  table: unsplash("photo-1617806118233-18e1de247200"),
  kitchen: unsplash("photo-1617806118233-18e1de247200"),
  bed: unsplash("photo-1505693416388-ac5ce068fe85"),
  wardrobe: unsplash("photo-1615529328331-f8917597711f"),
};

const OTHER_IMAGES = {
  bike: unsplash("photo-1571068316344-75bc76f77890"),
  stroller: unsplash("photo-1586281380349-632531db7ed4"),
  tools: unsplash("photo-1621905251189-08b45d6a269e"),
  books: unsplash("photo-1495446815901-a7297e633e8d"),
  garden: unsplash("photo-1469474968028-56623f02e42e"),
};

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
  { title: "Automobilio detailing — pilnas paketas", price: 120, priceLabel: "nuo 120€", tags: ["detailing", "plovimas", "automobilis"], imageKey: "detailing" },
  { title: "Padangų montavimas ir balansavimas", price: 35, priceLabel: "nuo 35€", tags: ["padangos", "montavimas", "autoservisas"], imageKey: "tires" },
  { title: "Paruošimas techninei apžiūrai", price: 45, priceLabel: "nuo 45€", tags: ["ta", "techninė", "autoservisas"], imageKey: "ta" },
  { title: "Santechnikas — avarinis iškvietimas", price: 50, priceLabel: "nuo 50€", tags: ["santechnikas", "remontas", "paslauga"], imageKey: "plumber" },
  { title: "Elektrikas — rozetės, apšvietimas", price: 40, priceLabel: "nuo 40€", tags: ["elektrikas", "montavimas"], imageKey: "electrician" },
  { title: "Buto valymas po remonto", price: 80, priceLabel: "nuo 80€", tags: ["valymas", "butas", "paslauga"], imageKey: "cleaning" },
  { title: "Evacuatorius 24/7 visoje Lietuvoje", price: 40, priceLabel: "nuo 40€", tags: ["evakuatorius", "pagalba", "kelyje"], imageKey: "tow" },
  { title: "Kėbulų dažymas — profesionaliai", price: 350, priceLabel: "nuo 350€", tags: ["dažymas", "kėbulas", "autoservisas"], imageKey: "paint" },
  { title: "Variklio diagnostika OBD", price: 25, priceLabel: "25€", tags: ["diagnostika", "obd", "autoservisas"], imageKey: "diagnostic" },
  { title: "Vėdinimo ir kondicionavimo aptarnavimas", price: 60, priceLabel: "nuo 60€", tags: ["kondicionierius", "klimate", "paslauga"], imageKey: "cleaning" },
];

const REAL_ESTATE_SPECS = [
  { title: "2 kambarių butas su balkonu", price: 145000, priceLabel: undefined, type: "Butas", rooms: "2", area: "54 m²", imageKey: "apartment", tags: ["butas", "nt", "nuomai"] },
  { title: "3 kambarių butas naujame name", price: 198000, type: "Butas", rooms: "3", area: "72 m²", imageKey: "apartment", tags: ["butas", "nt", "naujas"] },
  { title: "Šiuolaikiškas loftas centre", price: 235000, type: "Butas", rooms: "2", area: "68 m²", imageKey: "room", tags: ["loftas", "nt", "centras"] },
  { title: "1 kambario butas studentams", price: 89000, type: "Butas", rooms: "1", area: "32 m²", imageKey: "room", tags: ["butas", "nt", "nuomai"] },
  { title: "Individualus namas su garažu", price: 285000, type: "Namas", rooms: "4", area: "145 m²", imageKey: "house", tags: ["namas", "nt", "sklypas"] },
  { title: "Namas Priemiestyje su terasa", price: 320000, type: "Namas", rooms: "5", area: "168 m²", imageKey: "house", tags: ["namas", "nt", "terasa"] },
  { title: "Kotedžas dviems šeimoms", price: 265000, type: "Namas", rooms: "6", area: "190 m²", imageKey: "house", tags: ["kotedžas", "nt"] },
  { title: "Sklypas statybai 12 a", price: 42000, type: "Sklypas", rooms: "—", area: "12 a", imageKey: "land", tags: ["sklypas", "nt", "statyba"] },
  { title: "Komercinės patalpos centre", price: 175000, type: "Komercinis", rooms: "—", area: "110 m²", imageKey: "commercial", tags: ["komercinis", "nt", "biuras"] },
  { title: "Butas nuomai — įrengtas", price: 650, priceLabel: "650€/mėn.", type: "Nuoma", rooms: "2", area: "48 m²", imageKey: "apartment", tags: ["nuoma", "nt", "butas"] },
  { title: "Kambarys bendrame bute", price: 220, priceLabel: "220€/mėn.", type: "Nuoma", rooms: "1", area: "14 m²", imageKey: "room", tags: ["nuoma", "kambarys", "nt"] },
  { title: "Sodyba su pirtimi ir sodu", price: 155000, type: "Namas", rooms: "3", area: "95 m²", imageKey: "house", tags: ["sodyba", "nt", "pirtis"] },
  { title: "4 kambarių butas su parkingu", price: 215000, type: "Butas", rooms: "4", area: "88 m²", imageKey: "apartment", tags: ["butas", "nt", "parkingas"] },
  { title: "Žemės sklypas ūkio paskirčiai", price: 28000, type: "Sklypas", rooms: "—", area: "30 a", imageKey: "land", tags: ["žemė", "nt", "sklypas"] },
];

const JOB_SPECS = [
  { title: "Vairuotojas CE — tarptautiniai reisai", price: 0, priceLabel: "nuo 1800€/mėn.", tags: ["vairuotojas", "darbas", "ce"], imageKey: "driver", attrs: { position: "Vairuotojas", schedule: "Pamainos", experience: "2+ m." } },
  { title: "Sandėlininkas — naktinės pamainos", price: 0, priceLabel: "nuo 1200€/mėn.", tags: ["sandėlis", "darbas", "logistika"], imageKey: "warehouse", attrs: { position: "Sandėlininkas", schedule: "Naktinis", experience: "Be patirties" } },
  { title: "PHP programuotojas (Symfony)", price: 0, priceLabel: "2500–4000€/mėn.", tags: ["programuotojas", "it", "darbas"], imageKey: "office", attrs: { position: "Programuotojas", schedule: "Hibridas", experience: "3+ m." } },
  { title: "Virėjas — restoranas centre", price: 0, priceLabel: "nuo 1400€/mėn.", tags: ["virėjas", "maistas", "darbas"], imageKey: "chef", attrs: { position: "Virėjas", schedule: "Pilnas etatas", experience: "1+ m." } },
  { title: "Medicinos seselė — slaugos skyrius", price: 0, priceLabel: "nuo 1600€/mėn.", tags: ["slauga", "medicina", "darbas"], imageKey: "nurse", attrs: { position: "Seselė", schedule: "Pamainos", experience: "2+ m." } },
  { title: "Statybų darbų vadovas", price: 0, priceLabel: "nuo 2200€/mėn.", tags: ["statyba", "vadovas", "darbas"], imageKey: "builder", attrs: { position: "Vadovas", schedule: "Pilnas etatas", experience: "5+ m." } },
  { title: "Pardavėjas-consultant elektronikos salėje", price: 0, priceLabel: "nuo 1100€/mėn.", tags: ["pardavimas", "darbas", "retail"], imageKey: "office", attrs: { position: "Pardavėjas", schedule: "Pamainos", experience: "Be patirties" } },
  { title: "Buhalterė — maža įmonė", price: 0, priceLabel: "nuo 1500€/mėn.", tags: ["buhalterija", "darbas", "finansai"], imageKey: "office", attrs: { position: "Buhalterė", schedule: "Pilnas etatas", experience: "3+ m." } },
  { title: "Kurjeris — nuosavas automobilis", price: 0, priceLabel: "nuo 1000€/mėn.", tags: ["kurjeris", "logistika", "darbas"], imageKey: "driver", attrs: { position: "Kurjeris", schedule: "Lankstus", experience: "Be patirties" } },
  { title: "Suvirintojas TIG/MIG", price: 0, priceLabel: "nuo 1700€/mėn.", tags: ["suvirintojas", "gamykla", "darbas"], imageKey: "builder", attrs: { position: "Suvirintojas", schedule: "Pamainos", experience: "2+ m." } },
  { title: "Klientų aptarnavimo specialistas", price: 0, priceLabel: "nuo 1150€/mėn.", tags: ["support", "darbas", "biuras"], imageKey: "office", attrs: { position: "Specialistas", schedule: "Pamainos", experience: "1+ m." } },
  { title: "Auklė / babysitter — nuolatinė", price: 0, priceLabel: "nuo 900€/mėn.", tags: ["auklė", "darbas", "vaikai"], imageKey: "office", attrs: { position: "Auklė", schedule: "Pilnas etatas", experience: "2+ m." } },
];

const CLOTHING_SPECS = [
  { title: "Nike Air Max 270 batai 43 d.", price: 85, tags: ["nike", "batai", "sportas"], imageKey: "shoes", attrs: { brand: "Nike", size: "43", condition: "Gera" } },
  { title: "Zara vilnonė striukė M", price: 45, tags: ["zara", "striukė", "drabužiai"], imageKey: "jacket", attrs: { brand: "Zara", size: "M", condition: "Kaip nauja" } },
  { title: "Mango suknelė vakariniam renginiui", price: 38, tags: ["mango", "suknelė", "drabužiai"], imageKey: "dress", attrs: { brand: "Mango", size: "S", condition: "Nauja" } },
  { title: "Levi's 501 džinsai W32 L32", price: 42, tags: ["levis", "džinsai", "drabužiai"], imageKey: "jeans", attrs: { brand: "Levi's", size: "W32 L32", condition: "Gera" } },
  { title: "North Face žieminė striukė L", price: 120, tags: ["north face", "striukė", "žiemą"], imageKey: "jacket", attrs: { brand: "The North Face", size: "L", condition: "Labai gera" } },
  { title: "Adidas Ultraboost batai 42 d.", price: 95, tags: ["adidas", "batai", "bėgimas"], imageKey: "shoes", attrs: { brand: "Adidas", size: "42", condition: "Gera" } },
  { title: "Michael Kors rankinė", price: 75, tags: ["rankinė", "moteriška", "aksesuaras"], imageKey: "bag", attrs: { brand: "Michael Kors", size: "—", condition: "Kaip nauja" } },
  { title: "H&M vaikiška striukė 128 cm", price: 18, tags: ["vaikai", "striukė", "drabužiai"], imageKey: "kids", attrs: { brand: "H&M", size: "128", condition: "Gera" } },
  { title: "Tommy Hilfiger polo marškinėliai", price: 28, tags: ["tommy", "marškinėliai", "drabužiai"], imageKey: "jacket", attrs: { brand: "Tommy Hilfiger", size: "L", condition: "Nauja" } },
  { title: "Puma sportiniai kostiumai", price: 55, tags: ["puma", "sportas", "drabužiai"], imageKey: "jacket", attrs: { brand: "Puma", size: "M", condition: "Gera" } },
  { title: "Timberland aulinukai 44 d.", price: 110, tags: ["timberland", "batai", "žiemą"], imageKey: "shoes", attrs: { brand: "Timberland", size: "44", condition: "Labai gera" } },
  { title: "Reserved palto modelis moterims", price: 68, tags: ["reserved", "paltas", "drabužiai"], imageKey: "jacket", attrs: { brand: "Reserved", size: "M", condition: "Gera" } },
];

const HOME_SPECS = [
  { title: "Sofa-lova su daiktų saugykla", price: 420, tags: ["sofa", "baldai", "svetainė"], imageKey: "sofa" },
  { title: "Stiklo valgomojo stalas su 6 kėdėmis", price: 380, tags: ["stalas", "baldai", "virtuvė"], imageKey: "table" },
  { title: "Virtuvės komplektas — matinė balta", price: 1850, tags: ["virtuvė", "baldai", "komplektas"], imageKey: "kitchen" },
  { title: "King size lova su čiužiniu", price: 650, tags: ["lova", "miegamasis", "baldai"], imageKey: "bed" },
  { title: "Spinta-sliding 3 durų", price: 520, tags: ["spinta", "baldai", "miegamasis"], imageKey: "wardrobe" },
  { title: "Ergonominė darbo kėdė", price: 145, tags: ["kėdė", "biuras", "baldai"], imageKey: "table" },
  { title: "TV komoda su LED apšvietimu", price: 210, tags: ["komoda", "baldai", "svetainė"], imageKey: "sofa" },
  { title: "Knygų lentyna 5 skyrių", price: 95, tags: ["lentyna", "baldai", "namai"], imageKey: "wardrobe" },
  { title: "Baro kėdės 2 vnt. metalinės", price: 120, tags: ["kėdės", "baldai", "virtuvė"], imageKey: "table" },
  { title: "Vaiko kambario komplektas", price: 480, tags: ["vaikams", "baldai", "kambarys"], imageKey: "bed" },
  { title: "Šviestuvas + staliukas komplektas", price: 165, tags: ["šviestuvas", "baldai", "svetainė"], imageKey: "sofa" },
];

const OTHER_SPECS = [
  { title: "Kalnų dviratis 29\" ratais", price: 380, tags: ["dviratis", "sportas", "laukas"], imageKey: "bike" },
  { title: "Vaikiškas vežimėlis 3in1", price: 220, tags: ["vežimėlis", "vaikai", "kūdikis"], imageKey: "stroller" },
  { title: "Bosch elektrinių įrankių komplektas", price: 195, tags: ["įrankiai", "bosch", "remontas"], imageKey: "tools" },
  { title: "Universitetų vadovėlių rinkinys", price: 45, tags: ["knygos", "studijos", "vadovėliai"], imageKey: "books" },
  { title: "Sodo žoliapjovė + trimeris", price: 160, tags: ["sodas", "technika", "žolė"], imageKey: "garden" },
];

/** AI atranda — populiarūs pasiūlymai visoje Lietuvoje (rodomi kaip atskira kategorija tinklelyje) */
const AI_DISCOVER_SPECS = [
  {
    title: "AI atranda: BMW 320d — karšta prekė Kaune",
    category: "vehicles",
    price: 8900,
    city: "Kaunas",
    image: CAR_IMAGES.bmw,
    tags: ["ai-atranda", "automobilis", "bmw", "kaunas"],
    description:
      "VAUTO AI atrado populiariausią automobilio pasiūlymą Kauno regione. BMW 320d, tvarkinga serviso istorija, didelis peržiūrų skaičius per 24 val.",
  },
  {
    title: "AI atranda: 2 k. butas Naujamiestyje",
    category: "real_estate",
    price: 178000,
    city: "Vilnius",
    image: REAL_ESTATE_IMAGES.apartment,
    tags: ["ai-atranda", "butas", "vilnius", "nekilnojamasis"],
    description:
      "AI atrinko geriausią kainos ir vietos santykį Vilniuje: 2 kambarių butas Naujamiestyje, renovuotas, arti viešojo transporto.",
  },
  {
    title: "AI atranda: iPhone 15 Pro 256 GB",
    category: "electronics",
    price: 920,
    city: "Klaipėda",
    image: ELECTRONICS_IMAGES.iphone,
    tags: ["ai-atranda", "iphone", "telefonas", "klaipėda"],
    description:
      "Populiariausias elektronikos skelbimas Klaipėdoje — iPhone 15 Pro, pilna komplektacija, baterijos sveikata 94%.",
  },
  {
    title: "AI atranda: auto detailing premium",
    category: "services",
    price: 120,
    priceLabel: "Nuo 120€",
    city: "Šiauliai",
    image: SERVICE_IMAGES.detailing,
    tags: ["ai-atranda", "detailing", "automobilis", "šiauliai"],
    description:
      "AI rekomenduoja geriausiai vertinamą auto detailing paslaugą Šiauliuose — keraminių dangų aplikavimas, poliravimas, salono valymas.",
  },
  {
    title: "AI atranda: North Face striukė vyrams",
    category: "clothing",
    price: 145,
    city: "Panevėžys",
    image: CLOTHING_IMAGES.jacket,
    tags: ["ai-atranda", "striukė", "drabužiai", "panevėžys"],
    description:
      "Dažniausiai saugomas drabužių skelbimas Panevėžio regione — The North Face striukė, dydis L, be defektų.",
  },
  {
    title: "AI atranda: skandinaviška sofa-lova",
    category: "home",
    price: 420,
    city: "Marijampolė",
    image: HOME_IMAGES.sofa,
    tags: ["ai-atranda", "baldai", "sofa", "marijampolė"],
    description:
      "AI atrado geriausią baldų pasiūlymą Marijampolėje — skandinaviško stiliaus sofa-lova, be dėmių, pristatymas galimas.",
  },
  {
    title: "AI atranda: sandėlio darbuotojas",
    category: "jobs",
    price: 1450,
    priceLabel: "Nuo 1450€/mėn.",
    city: "Alytus",
    image: JOB_IMAGES.warehouse,
    tags: ["ai-atranda", "darbas", "sandėlis", "alytus"],
    description:
      "Populiariausias darbo skelbimas Alytaus regione — sandėlio darbuotojas, pilnas etatas, oficialus darbo santykis, apmokamas mokymas.",
  },
  {
    title: "AI atranda: kalnų dviratis 29\"",
    category: "other",
    price: 520,
    city: "Mažeikiai",
    image: OTHER_IMAGES.bike,
    tags: ["ai-atranda", "dviratis", "sportas", "mažeikiai"],
    description:
      "AI atrinko geriausią laisvalaikio prekę Mažeikiuose — kalnų dviratis 29\" ratais, hidrauliniai stabdžiai, nedaug naudotas.",
  },
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

function vehicleImage(spec) {
  if (MAKE_IMAGES[spec.make]) return MAKE_IMAGES[spec.make];
  if (spec.body === "Visureigis") return CAR_IMAGES.suv;
  if (spec.body === "Universalas") return CAR_IMAGES.wagon;
  if (spec.body === "Hečbekas" || spec.body === "Kupė") return CAR_IMAGES.compact;
  if (spec.fuel === "Plug-in hibridas" || spec.fuel === "Hibridas") return CAR_IMAGES.hybrid;
  return CAR_IMAGES[spec.img] ?? CAR_IMAGES.sedan;
}

function electronicsImage(title) {
  const lower = title.toLowerCase();
  if (lower.includes("iphone")) return ELECTRONICS_IMAGES.iphone;
  if (lower.includes("samsung") || lower.includes("galaxy")) return ELECTRONICS_IMAGES.samsung;
  if (lower.includes("macbook")) return ELECTRONICS_IMAGES.macbook;
  if (lower.includes("ipad")) return ELECTRONICS_IMAGES.ipad;
  if (lower.includes("playstation") || lower.includes("ps5")) return ELECTRONICS_IMAGES.playstation;
  if (lower.includes("dyson")) return ELECTRONICS_IMAGES.dyson;
  if (lower.includes("sony")) return ELECTRONICS_IMAGES.sony;
  return ELECTRONICS_IMAGES.iphone;
}

function serviceImage(title, imageKey) {
  if (imageKey && SERVICE_IMAGES[imageKey]) return SERVICE_IMAGES[imageKey];
  const lower = title.toLowerCase();
  if (lower.includes("detailing") || lower.includes("plovimas")) return SERVICE_IMAGES.detailing;
  if (lower.includes("padang")) return SERVICE_IMAGES.tires;
  if (lower.includes("diagnost")) return SERVICE_IMAGES.diagnostic;
  if (lower.includes("dažym") || lower.includes("kėbul")) return SERVICE_IMAGES.paint;
  if (lower.includes("evakuator")) return SERVICE_IMAGES.tow;
  if (lower.includes("technin")) return SERVICE_IMAGES.ta;
  if (lower.includes("santechn")) return SERVICE_IMAGES.plumber;
  if (lower.includes("elektrik")) return SERVICE_IMAGES.electrician;
  return SERVICE_IMAGES.cleaning;
}

function categoryImage(map, imageKey, fallback) {
  return (imageKey && map[imageKey]) || map[fallback] || Object.values(map)[0];
}

function buildRealEstateDescription(spec, city, index) {
  const variants = [
    `${spec.title} — ${city}. Plotas ${spec.area}, ${spec.rooms} kamb. ${spec.type}. Puiki vieta, šalia infrastruktūra, transportas.`,
    `Parduodamas ${spec.type.toLowerCase()} ${city} mieste. ${spec.rooms} kamb., ${spec.area}. Tvarkinga būklė, galima apžiūrėti sutartu laiku.`,
    `${spec.title} ${city} rajone. ${spec.area}, ${spec.type}. Skaidri dokumentacija, padėsime su paskola.`,
    `NT pasiūlymas ${city}: ${spec.title}. ${spec.rooms} kamb., ${spec.area}. Tinka gyvenimui ar investicijai.`,
  ];
  return variants[index % variants.length];
}

function buildJobDescription(spec, city, index) {
  const a = spec.attrs ?? {};
  return [
    `${spec.title} — ${city} ir apylinkės. Etatas: ${a.schedule ?? "Pilnas etatas"}. Patirtis: ${a.experience ?? "Nebūtina"}.`,
    `Ieškome ${a.position ?? "specialisto"} ${city}. ${spec.priceLabel ?? "Konkurencingas atlyginimas"}. Suteikiame apmokymą.`,
    `Darbo pasiūlymas: ${spec.title}. Vieta: ${city}. Grafikas: ${a.schedule ?? "Lankstus"}. Kreipkitės su CV.`,
    `${a.position ?? "Darbuotojas"} pozicija ${city}. ${spec.title}. Oficialus įdarbinimas, socialinės garantijos.`,
  ][index % 4];
}

function buildClothingDescription(spec, city, index) {
  const a = spec.attrs ?? {};
  return [
    `Parduodu ${spec.title}. Dydis ${a.size ?? "—"}, būklė: ${a.condition ?? "Gera"}. ${city}, galiu siųsti LP Express.`,
    `${spec.title} — ${a.brand ?? "Prekės ženklas"} prekė. Dydis ${a.size ?? "—"}. Naudota kelis kartus, be defektų. ${city}.`,
    `Tvarkingas ${spec.title.toLowerCase()}, dydis ${a.size ?? "—"}. Originalus, ne fake. Perduodu ${city} centre.`,
    `${spec.title}. Būklė: ${a.condition ?? "Gera"}. Dydis ${a.size ?? "—"}. ${city}, galimas siuntimas.`,
  ][index % 4];
}

function buildHomeDescription(spec, city, index) {
  return [
    `Parduodu ${spec.title.toLowerCase()} — ${city}. Tvarkinga būklė, be įbrėžimų. Galimas pristatymas mieste.`,
    `${spec.title} iš ${city}. Naudotas namuose, rūpestingai prižiūrėtas. Galite apžiūrėti gyvai.`,
    `${spec.title} — kokybiškas, funkcionalus. ${city}. Greitas atsiėmimas arba pristatymas.`,
    `Baldų pasiūlymas: ${spec.title}. Vieta: ${city}. Be rūdžių, defektų ar stipresnio nusidėvėjimo.`,
  ][index % 4];
}

function buildOtherDescription(spec, city, index) {
  return [
    `Parduodu ${spec.title.toLowerCase()} — ${city}. Tvarkinga, veikianti, paruošta naudojimui.`,
    `${spec.title} iš ${city}. Gera būklė, sąžiningas pardavėjas. Galima apžiūrėti.`,
    `${spec.title} — ${city}. Visi komplektai vietoje, be paslėptų defektų.`,
    `Pasiūlymas ${city}: ${spec.title}. Skambinkite dėl detalių ir apžiūros laiko.`,
  ][index % 4];
}

function baseListing({ id, title, price, priceLabel, location, distanceKm, contact, image, category, tags, description, sellerId, createdAt, attributes, extra = {} }) {
  return {
    id,
    title,
    price,
    ...(priceLabel ? { priceLabel } : {}),
    location,
    distanceKm,
    contact,
    image,
    category,
    tags,
    description,
    sellerId,
    createdAt,
    ...(attributes ? { attributes } : {}),
    ...extra,
  };
}

function assignVisibilityTiers(listings) {
  const byId = new Map(listings.map((l) => [l.id, l]));
  for (const slot of VISIBILITY_SLOTS) {
    const listing = byId.get(slot.id);
    if (!listing) continue;
    listing.visibilityTier = slot.tier;
    if (slot.promoted) listing.promoted = true;
  }
}

function contactFor(prefix, n) {
  return `Tel. +370 6${String(prefix + n * 7919).slice(0, 7)}`;
}

function distanceFor(i) {
  return Math.round((1 + (i % 40) + (i % 10) * 0.3) * 10) / 10;
}

function createdAtFor(dayOffset, hour = 8, minute = 0) {
  return new Date(Date.UTC(2026, 5, 1 + (dayOffset % 28), hour, minute)).toISOString();
}

function vinFor(index) {
  const chars = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ";
  let v = "WBA";
  for (let i = 0; i < 14; i++) v += chars[(index * 17 + i * 31) % chars.length];
  return v;
}

const listings = [];
let globalIdx = 0;

// —— Automobiliai (24) ——
for (let v = 0; v < CATEGORY_PLAN.vehicles; v++) {
  const spec = pick(VEHICLE_SPECS, v);
  const year = v === 0 ? 2003 : 2000 + (v * 7 + 3) % 25;
  const city = v === 0 ? "Kaunas" : pick(CITIES, v * 3 + 1);
  const price = priceForVehicle(year, spec, v);
  const km = mileageForYear(year);
  const ta = `${2025 + (v % 2)}-${String((v % 12) + 1).padStart(2, "0")}`;

  listings.push(baseListing({
    id: `lt-auto-${String(v + 1).padStart(3, "0")}`,
    title: `${spec.make} ${spec.model} ${year}`,
    price,
    location: city,
    distanceKm: distanceFor(v),
    contact: contactFor(1000000, v),
    image: vehicleImage(spec),
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
    sellerId: `seller-auto-${(v % 12) + 1}`,
    createdAt: createdAtFor(v, 8 + (v % 10), (v * 13) % 60),
    extra: { vinVerified: v % 3 !== 0, providerVerified: v % 7 === 0 },
  }));
  globalIdx++;
}

// —— NT (14) ——
for (let n = 0; n < CATEGORY_PLAN.real_estate; n++) {
  const spec = REAL_ESTATE_SPECS[n];
  const city = pick(CITIES, n * 2 + 5);
  listings.push(baseListing({
    id: `lt-nt-${String(n + 1).padStart(3, "0")}`,
    title: spec.title,
    price: spec.price,
    priceLabel: spec.priceLabel,
    location: city,
    distanceKm: distanceFor(n + 10),
    contact: contactFor(4000000, n),
    image: categoryImage(REAL_ESTATE_IMAGES, spec.imageKey, "apartment"),
    category: "real_estate",
    tags: [...spec.tags, city.toLowerCase(), "nekilnojamasis"],
    attributes: { propertyType: spec.type, rooms: spec.rooms, area: spec.area },
    description: buildRealEstateDescription(spec, city, n),
    sellerId: `seller-nt-${(n % 6) + 1}`,
    createdAt: createdAtFor(n + 3, 11, n * 5),
  }));
  globalIdx++;
}

// —— Darbas (12) ——
for (let j = 0; j < CATEGORY_PLAN.jobs; j++) {
  const spec = JOB_SPECS[j];
  const city = pick(CITIES, j * 3 + 7);
  listings.push(baseListing({
    id: `lt-job-${String(j + 1).padStart(3, "0")}`,
    title: spec.title,
    price: spec.price,
    priceLabel: spec.priceLabel,
    location: city,
    distanceKm: distanceFor(j + 20),
    contact: contactFor(5000000, j),
    image: categoryImage(JOB_IMAGES, spec.imageKey, "office"),
    category: "jobs",
    tags: [...spec.tags, city.toLowerCase(), "karjera"],
    attributes: spec.attrs,
    description: buildJobDescription(spec, city, j),
    sellerId: `seller-job-${(j % 5) + 1}`,
    createdAt: createdAtFor(j + 5, 9, j * 9),
  }));
  globalIdx++;
}

// —— Drabužiai (12) ——
for (let c = 0; c < CATEGORY_PLAN.clothing; c++) {
  const spec = CLOTHING_SPECS[c];
  const city = pick(CITIES, c * 4 + 1);
  listings.push(baseListing({
    id: `lt-clo-${String(c + 1).padStart(3, "0")}`,
    title: spec.title,
    price: spec.price,
    location: city,
    distanceKm: distanceFor(c + 30),
    contact: contactFor(6000000, c),
    image: categoryImage(CLOTHING_IMAGES, spec.imageKey, "jacket"),
    category: "clothing",
    tags: [...spec.tags, city.toLowerCase(), "drabužiai"],
    attributes: spec.attrs,
    description: buildClothingDescription(spec, city, c),
    sellerId: `seller-clo-${(c % 5) + 1}`,
    createdAt: createdAtFor(c + 8, 14, c * 6),
  }));
  globalIdx++;
}

// —— Elektronika (12) ——
for (let e = 0; e < CATEGORY_PLAN.electronics; e++) {
  const spec = ELECTRONICS_SPECS[e % ELECTRONICS_SPECS.length];
  const city = pick(CITIES, e * 5 + 2);
  listings.push(baseListing({
    id: `lt-el-${String(e + 1).padStart(3, "0")}`,
    title: spec.title,
    price: spec.price + (e % 3) * 30,
    location: city,
    distanceKm: distanceFor(e + 40),
    contact: contactFor(2000000, e),
    image: electronicsImage(spec.title),
    category: "electronics",
    tags: [...spec.tags, city.toLowerCase(), "elektronika"],
    description: buildElectronicsDescription(spec.title, city, e),
    sellerId: `seller-el-${(e % 5) + 1}`,
    createdAt: createdAtFor(e + 10, 10, e * 7),
  }));
  globalIdx++;
}

// —— Namai / baldai (11) ——
for (let h = 0; h < CATEGORY_PLAN.home; h++) {
  const spec = HOME_SPECS[h];
  const city = pick(CITIES, h * 3 + 9);
  listings.push(baseListing({
    id: `lt-home-${String(h + 1).padStart(3, "0")}`,
    title: spec.title,
    price: spec.price,
    location: city,
    distanceKm: distanceFor(h + 50),
    contact: contactFor(7000000, h),
    image: categoryImage(HOME_IMAGES, spec.imageKey, "sofa"),
    category: "home",
    tags: [...spec.tags, city.toLowerCase(), "baldai"],
    description: buildHomeDescription(spec, city, h),
    sellerId: `seller-home-${(h % 4) + 1}`,
    createdAt: createdAtFor(h + 12, 13, h * 8),
  }));
  globalIdx++;
}

// —— Paslaugos (10) ——
for (let s = 0; s < CATEGORY_PLAN.services; s++) {
  const spec = SERVICE_SPECS[s];
  const city = pick(CITIES, s * 4 + 3);
  listings.push(baseListing({
    id: `lt-svc-${String(s + 1).padStart(3, "0")}`,
    title: spec.title,
    price: spec.price,
    priceLabel: spec.priceLabel,
    location: city,
    distanceKm: distanceFor(s + 60),
    contact: contactFor(3000000, s),
    image: serviceImage(spec.title, spec.imageKey),
    category: "services",
    tags: [...spec.tags, city.toLowerCase(), "paslauga"],
    description: buildServiceDescription(spec.title, city, s),
    sellerId: `seller-svc-${(s % 4) + 1}`,
    createdAt: createdAtFor(s + 15, 9, s * 11),
    extra: { providerVerified: true },
  }));
  globalIdx++;
}

// —— Kita (5) ——
for (let o = 0; o < CATEGORY_PLAN.other; o++) {
  const spec = OTHER_SPECS[o];
  const city = pick(CITIES, o * 6 + 11);
  listings.push(baseListing({
    id: `lt-oth-${String(o + 1).padStart(3, "0")}`,
    title: spec.title,
    price: spec.price,
    location: city,
    distanceKm: distanceFor(o + 70),
    contact: contactFor(8000000, o),
    image: categoryImage(OTHER_IMAGES, spec.imageKey, "bike"),
    category: "other",
    tags: [...spec.tags, city.toLowerCase(), "kita"],
    description: buildOtherDescription(spec, city, o),
    sellerId: `seller-oth-${(o % 3) + 1}`,
    createdAt: createdAtFor(o + 18, 16, o * 12),
  }));
  globalIdx++;
}

// —— AI atranda (8) — populiarūs pasiūlymai visoje Lietuvoje ——
for (let a = 0; a < CATEGORY_PLAN.ai_discover; a++) {
  const spec = AI_DISCOVER_SPECS[a];
  listings.push(baseListing({
    id: `lt-ai-${String(a + 1).padStart(3, "0")}`,
    title: spec.title,
    price: spec.price,
    ...(spec.priceLabel ? { priceLabel: spec.priceLabel } : {}),
    location: spec.city,
    distanceKm: distanceFor(a + 80),
    contact: contactFor(9000000, a),
    image: spec.image,
    category: spec.category,
    tags: spec.tags,
    description: spec.description,
    sellerId: `seller-ai-${(a % 4) + 1}`,
    createdAt: createdAtFor(a + 20, 12, a * 9),
  }));
  globalIdx++;
}

assignVisibilityTiers(listings);

const EXPECTED_COUNT = Object.values(CATEGORY_PLAN).reduce((sum, n) => sum + n, 0);
if (listings.length !== EXPECTED_COUNT) {
  throw new Error(`Expected ${EXPECTED_COUNT} listings, got ${listings.length}`);
}

const tsContent = `/** Auto-generated by scripts/generate-mock-catalog.mjs — do not edit manually */
import type { LegacyListingInput } from "@/lib/types";

/** ${EXPECTED_COUNT} realistic listings spread across Lithuania for demo, search and monetization QA. */
export const LITHUANIA_MOCK_CATALOG: LegacyListingInput[] = ${JSON.stringify(listings, null, 2)} as LegacyListingInput[];
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

writeFileSync(join(root, "src/data/lithuania-mock-catalog.ts"), tsContent, "utf8");
writeFileSync(join(root, "server/src/generated-demo-listings.ts"), serverContent, "utf8");

console.log(`Generated ${listings.length} listings:`);
for (const [cat, count] of Object.entries(CATEGORY_PLAN)) {
  const actual = listings.filter((l) => l.category === cat).length;
  console.log(`  ${cat}: ${actual}`);
}
console.log(`  cities: ${new Set(listings.map((l) => l.location)).size} unique`);
