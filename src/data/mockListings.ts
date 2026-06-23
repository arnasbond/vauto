import type { Listing, UserProfile, ChatThread } from "@/lib/types";
import { enrichListingCoords } from "@/lib/geocoding";
import { generateListingSlug } from "@/lib/seo";
import { isVerifiedServiceSeller, verifyVin } from "@/lib/trust";

export const MOCK_USER: UserProfile = {
  id: "user-1",
  name: "Jonas K.",
  avatar:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
  phone: "+370 612 34567",
  city: "Panevėžys",
  role: "private",
  walletBalance: 0,
};

/** Unauthenticated session — never used as buyer/seller identity */
export const ANONYMOUS_USER: UserProfile = {
  id: "guest",
  name: "Svečias",
  avatar:
    "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop",
  phone: "",
  city: "",
  role: "private",
  walletBalance: 0,
};

/** Mock listings aligned with design mockup */
const RAW_INITIAL_LISTINGS: Listing[] = [
  {
    id: "l-bike",
    title: "Dviratis 'Trek'",
    price: 150,
    location: "Panevėžys",
    distanceKm: 0.8,
    contact: "Tel. +3706...",
    image:
      "https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=400&h=300&fit=crop",
    category: "other",
    tags: ["dviratis", "trek", "sportas"],
    sellerId: "seller-bike",
    createdAt: "2026-06-18T10:00:00Z",
    hasVideo: true,
  },
  {
    id: "l-phone",
    title: "Mobilus telefonas",
    price: 220,
    location: "Panevėžys",
    distanceKm: 2.0,
    image:
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop",
    category: "electronics",
    tags: ["telefonas", "mobilus", "pigus", "paaugliui"],
    sellerId: "seller-phone",
    createdAt: "2026-06-18T09:00:00Z",
    description: "Puikus ekranas, komplektas su įkrovikliu. Galima išbandyti vietoje.",
  },
  {
    id: "l-handyman",
    title: "Meistras — remonto paslaugos",
    price: 30,
    priceLabel: "30€/val",
    location: "Panevėžys",
    distanceKm: 3.0,
    image:
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400&h=300&fit=crop",
    category: "services",
    tags: ["meistras", "remontas", "paslauga"],
    sellerId: "seller-handyman",
    createdAt: "2026-06-18T08:00:00Z",
    hasVideo: true,
    providerVerified: true,
    description: "Remonto ir montavimo paslaugos Panevėžyje ir apylinkėse. Išrašome sąskaitas.",
  },
  {
    id: "l1",
    title: "iPhone 13 — puiki būklė",
    price: 320,
    location: "Vilnius",
    distanceKm: 2.1,
    image:
      "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&h=300&fit=crop",
    category: "electronics",
    tags: ["telefonas", "iphone", "pigus", "paaugliui"],
    sellerId: "seller-1",
    createdAt: "2026-06-17T10:00:00Z",
  },
  {
    id: "l3",
    title: "Žolės pjovimas — greitai ir pigiai",
    price: 25,
    location: "Panevėžys",
    distanceKm: 1.2,
    image:
      "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=400&h=300&fit=crop",
    category: "services",
    tags: ["žolė", "pjovimas", "sodas", "paslauga"],
    sellerId: "seller-3",
    createdAt: "2026-06-18T08:00:00Z",
    providerVerified: true,
  },
  {
    id: "l4",
    title: "VW Golf 2015 — mechaninė",
    price: 4500,
    location: "Šiauliai",
    distanceKm: 45,
    image:
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop",
    category: "vehicles",
    tags: ["automobilis", "golf", "mechaninė", "pigus"],
    attributes: { vin: "WVWZZZ1KZAW123456", mileage: "185 000 km", fuelType: "Dyzelinas" },
    vinVerified: true,
    sellerId: "seller-4",
    createdAt: "2026-06-15T09:00:00Z",
  },
  {
    id: "l-rims-panevezys",
    title: "Ratlankiai R16 — 4 vnt.",
    price: 50,
    location: "Panevėžys",
    distanceKm: 1.1,
    contact: "Tel. +3706...",
    image:
      "https://images.unsplash.com/photo-1600661653561-629509216228?w=400&h=300&fit=crop",
    category: "vehicles",
    tags: ["ratlankiai", "r16", "auto dalys", "garažas", "panevėžys"],
    attributes: {
      partType: "Ratlankiai",
      size: "R16",
      condition: "Naudoti",
      quantity: "4 vnt.",
    },
    description:
      "Naudoti R16 ratlankiai iš garažo. Tinka kasdieniam automobiliui, Panevėžyje.",
    sellerId: "seller-rims",
    createdAt: "2026-06-18T11:00:00Z",
  },
  {
    id: "l-job-offer",
    title: "Sandėlininkas — pilnas etatas",
    price: 1200,
    priceLabel: "1200€/mėn",
    location: "Panevėžys",
    distanceKm: 1.5,
    contact: "Tel. +3706...",
    image:
      "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=400&h=300&fit=crop",
    category: "jobs",
    tags: ["darbas", "sandėlis", "pilnas etatas"],
    attributes: {
      jobType: "Siūlau darbą",
      jobTitle: "Sandėlininkas",
      employerName: "UAB Logistika LT",
      experienceArea: "Logistika / sandėliavimas",
      jobGroup: "Darbininkai",
      employmentType: "Pilnas etatas",
      salaryType: "Mėnesinis",
      schedule: "Pn–Pt 8–17",
      requirements: "B kategorijos vairuotojo pažymėjimas",
    },
    description: "Ieškome atsakingo sandėlininko logistikos centre.",
    sellerId: "seller-job-1",
    createdAt: "2026-06-18T07:00:00Z",
  },
  {
    id: "l-job-seek",
    title: "Ieškau darbo — vairuotojas / kurjeris",
    price: 900,
    priceLabel: "nuo 900€/mėn",
    location: "Vilnius",
    distanceKm: 4.2,
    contact: "Tel. +3706...",
    image:
      "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400&h=300&fit=crop",
    category: "jobs",
    tags: ["ieškau darbo", "vairuotojas", "kurjeris"],
    attributes: {
      jobType: "Ieškau darbo",
      employmentType: "Pilnas etatas",
      salaryType: "Mėnesinis",
      requirements: "B kategorija, 3 m. patirtis",
    },
    description: "Patyręs vairuotojas, ieškau stabilaus darbo.",
    sellerId: "seller-job-2",
    createdAt: "2026-06-18T06:30:00Z",
  },
];

const PORTAL_DEMO_LISTINGS: Listing[] = [
  // Autoplius-style vehicles
  {
    id: "demo-auto-bmw-320d",
    title: "BMW 320d Touring 2018",
    price: 13900,
    location: "Vilnius",
    distanceKm: 4.1,
    contact: "Tel. +370 600 10001",
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400&h=300&fit=crop",
    category: "vehicles",
    tags: ["bmw", "320d", "dyzelinas", "automobilis", "autoplius"],
    attributes: {
      make: "BMW",
      model: "320d Touring",
      year: "2018",
      mileage: "162 000 km",
      engine: "2.0 d 140 kW",
      fuelType: "Dyzelinas",
      taExpiry: "2027-04",
      bodyType: "Universalas",
      plateNumber: "JAZ 321",
      vin: "WBA8E51020K123456",
      defects: "Nėra",
    },
    description:
      "Tvarkingas BMW 320d Touring, automatinė dėžė, serviso istorija, TA galioja. Demo skelbimas testavimui.",
    sellerId: "dealer-vilnius-auto",
    createdAt: "2026-06-19T09:00:00Z",
    vinVerified: true,
    providerVerified: true,
  },
  {
    id: "demo-auto-toyota-auris",
    title: "Toyota Auris Hybrid 2017",
    price: 10950,
    location: "Kaunas",
    distanceKm: 6.4,
    contact: "Tel. +370 600 10002",
    image:
      "https://images.unsplash.com/photo-1542362567-b07e54358753?w=400&h=300&fit=crop",
    category: "vehicles",
    tags: ["toyota", "auris", "hibridas", "automobilis"],
    attributes: {
      make: "Toyota",
      model: "Auris",
      year: "2017",
      mileage: "138 000 km",
      engine: "1.8 Hybrid",
      fuelType: "Hibridas",
      taExpiry: "2026-12",
      bodyType: "Hečbekas",
      vin: "SB1MS3JE60E123456",
      defects: "Smulkūs kėbulo pabraižymai",
    },
    description:
      "Ekonomiškas hibridas miestui, mažos sąnaudos, gera komplektacija, du rakteliai.",
    sellerId: "dealer-kaunas-auto",
    createdAt: "2026-06-19T08:30:00Z",
    vinVerified: true,
  },
  {
    id: "demo-auto-audi-a4",
    title: "Audi A4 Avant 2016",
    price: 11900,
    location: "Klaipėda",
    distanceKm: 3.8,
    contact: "Tel. +370 600 10003",
    image:
      "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=400&h=300&fit=crop",
    category: "vehicles",
    tags: ["audi", "a4", "avant", "dyzelinas"],
    attributes: {
      make: "Audi",
      model: "A4 Avant",
      year: "2016",
      mileage: "191 000 km",
      engine: "2.0 TDI 110 kW",
      fuelType: "Dyzelinas",
      taExpiry: "2027-01",
      bodyType: "Universalas",
      vin: "WAUZZZF4XGN123456",
    },
    description:
      "Patogus šeimos automobilis, ką tik pakeisti tepalai ir filtrai, žieminių padangų komplektas.",
    sellerId: "dealer-klaipeda-auto",
    createdAt: "2026-06-18T16:00:00Z",
    vinVerified: true,
  },
  {
    id: "demo-auto-honda-civic",
    title: "Honda Civic 2019 1.5 Turbo",
    price: 15400,
    location: "Šiauliai",
    distanceKm: 2.9,
    contact: "Tel. +370 600 10004",
    image:
      "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?w=400&h=300&fit=crop",
    category: "vehicles",
    tags: ["honda", "civic", "benzinas", "automobilis"],
    attributes: {
      make: "Honda",
      model: "Civic",
      year: "2019",
      mileage: "92 000 km",
      engine: "1.5 Turbo 134 kW",
      fuelType: "Benzinas",
      taExpiry: "2026-10",
      bodyType: "Hečbekas",
    },
    description:
      "Dinamiškas Civic, tvarkingas salonas, aktyvi saugumo įranga, galimas lizingas.",
    sellerId: "dealer-siauliai-auto",
    createdAt: "2026-06-17T13:00:00Z",
  },
  {
    id: "demo-auto-ratlankiai-r17",
    title: "Ratlankiai R17 5x112 — 4 vnt.",
    price: 120,
    location: "Kaunas",
    distanceKm: 5.2,
    contact: "Tel. +370 600 10005",
    image:
      "https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=400&h=300&fit=crop",
    category: "vehicles",
    tags: ["ratlankiai", "r17", "5x112", "auto dalys"],
    attributes: {
      partType: "Ratlankiai",
      size: "R17",
      condition: "Naudoti",
      quantity: "4 vnt.",
      defects: "Vienas ratlankis turi pabraižymų",
    },
    description:
      "Naudoti R17 ratlankiai, tinka VW/Audi grupės automobiliams, patikrinti balansavimo staklėmis.",
    sellerId: "seller-auto-parts",
    createdAt: "2026-06-19T07:30:00Z",
  },

  // Vinted-style clothing
  {
    id: "demo-vinted-zara-coat",
    title: "Zara vilnonis paltas M",
    price: 38,
    location: "Vilnius",
    distanceKm: 1.9,
    contact: "Tel. +370 600 11001",
    image:
      "https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=400&h=300&fit=crop",
    category: "clothing",
    tags: ["zara", "paltas", "m", "vinted"],
    attributes: { size: "M", brand: "Zara", condition: "Gera", color: "Smėlio" },
    description:
      "Šiltas vilnonis paltas, nešiotas vieną sezoną. Išvalytas, be dėmių.",
    sellerId: "seller-closet-1",
    createdAt: "2026-06-19T10:30:00Z",
  },
  {
    id: "demo-vinted-nike-air",
    title: "Nike Air Force 1, 39 dydis",
    price: 55,
    location: "Kaunas",
    distanceKm: 2.4,
    contact: "Tel. +370 600 11002",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop",
    category: "clothing",
    tags: ["nike", "air force", "batai", "39"],
    attributes: { size: "39", brand: "Nike", condition: "Gera", color: "Balta" },
    description:
      "Originalūs Nike Air Force 1, minimalūs dėvėjimo ženklai, dėžutės nėra.",
    sellerId: "seller-closet-2",
    createdAt: "2026-06-19T10:00:00Z",
  },
  {
    id: "demo-vinted-dress",
    title: "Proginė suknelė S",
    price: 45,
    location: "Klaipėda",
    distanceKm: 4.6,
    contact: "Tel. +370 600 11003",
    image:
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&h=300&fit=crop",
    category: "clothing",
    tags: ["suknelė", "proginė", "s", "raudona"],
    attributes: { size: "S", brand: "Reserved", condition: "Nauja", color: "Raudona" },
    description:
      "Nauja proginė suknelė su etikete, tinka šventei ar fotosesijai.",
    sellerId: "seller-closet-3",
    createdAt: "2026-06-18T15:20:00Z",
  },
  {
    id: "demo-vinted-kids-jacket",
    title: "Vaikiška žieminė striukė 128 cm",
    price: 24,
    location: "Panevėžys",
    distanceKm: 1.6,
    contact: "Tel. +370 600 11004",
    image:
      "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=400&h=300&fit=crop",
    category: "clothing",
    tags: ["vaikiška", "striukė", "žieminė", "128"],
    attributes: { size: "128", brand: "H&M", condition: "Gera", color: "Mėlyna" },
    description:
      "Šilta striukė vaikui, kapišonas nusegamas, užtrauktukai veikia.",
    sellerId: "seller-closet-4",
    createdAt: "2026-06-18T14:20:00Z",
  },
  {
    id: "demo-vinted-handbag",
    title: "Odinė rankinė",
    price: 32,
    location: "Alytus",
    distanceKm: 3.1,
    contact: "Tel. +370 600 11005",
    image:
      "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400&h=300&fit=crop",
    category: "clothing",
    tags: ["rankinė", "oda", "aksesuarai"],
    attributes: { size: "Vidutinė", brand: "Mango", condition: "Gera", color: "Juoda" },
    description:
      "Talpi odinė rankinė su ilga rankena, viduje keli skyriai.",
    sellerId: "seller-closet-5",
    createdAt: "2026-06-17T12:45:00Z",
  },

  // Skelbiu-style universal goods
  {
    id: "demo-skelbiu-iphone-13-128",
    title: "iPhone 13 128GB Midnight",
    price: 315,
    location: "Vilnius",
    distanceKm: 3.2,
    contact: "Tel. +370 600 12001",
    image:
      "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?w=400&h=300&fit=crop",
    category: "electronics",
    tags: ["iphone", "iphone 13", "128gb", "telefonas", "skelbiu"],
    attributes: { brand: "Apple", storage: "128GB", condition: "Gera", color: "Midnight" },
    description:
      "Telefonas veikia be priekaištų, Face ID veikia, baterija 86%, komplekte laidas.",
    sellerId: "seller-tech-1",
    createdAt: "2026-06-19T11:00:00Z",
  },
  {
    id: "demo-skelbiu-macbook-air",
    title: "MacBook Air M1 2020",
    price: 620,
    location: "Kaunas",
    distanceKm: 5.7,
    contact: "Tel. +370 600 12002",
    image:
      "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=300&fit=crop",
    category: "electronics",
    tags: ["macbook", "air", "m1", "kompiuteris"],
    attributes: { brand: "Apple", ram: "8GB", storage: "256GB", condition: "Gera" },
    description:
      "MacBook Air M1, 8GB RAM, 256GB SSD, mažai naudotas, pakrovėjas komplekte.",
    sellerId: "seller-tech-2",
    createdAt: "2026-06-18T12:00:00Z",
  },
  {
    id: "demo-skelbiu-sofa",
    title: "Pilka kampinė sofa-lova",
    price: 280,
    location: "Šiauliai",
    distanceKm: 2.8,
    contact: "Tel. +370 600 12003",
    image:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=300&fit=crop",
    category: "home",
    tags: ["sofa", "kampas", "baldai", "lova"],
    attributes: { condition: "Gera", color: "Pilka", dimensions: "250x160 cm" },
    description:
      "Patogi kampinė sofa su miegama dalimi ir patalynės dėže. Reikia išsivežti.",
    sellerId: "seller-home-1",
    createdAt: "2026-06-18T11:00:00Z",
  },
  {
    id: "demo-skelbiu-coffee-machine",
    title: "DeLonghi kavos aparatas",
    price: 180,
    location: "Klaipėda",
    distanceKm: 3.4,
    contact: "Tel. +370 600 12004",
    image:
      "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=400&h=300&fit=crop",
    category: "home",
    tags: ["kavos aparatas", "delonghi", "buitis"],
    attributes: { brand: "DeLonghi", condition: "Gera", defects: "Reikia nukalkinti" },
    description:
      "Automatinis kavos aparatas, gamina espresso ir cappuccino, pieno sistema veikia.",
    sellerId: "seller-home-2",
    createdAt: "2026-06-18T10:10:00Z",
  },
  {
    id: "demo-skelbiu-stroller",
    title: "Vaikiškas vežimėlis 3in1",
    price: 145,
    location: "Marijampolė",
    distanceKm: 2.0,
    contact: "Tel. +370 600 12005",
    image:
      "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=400&h=300&fit=crop",
    category: "home",
    tags: ["vežimėlis", "vaikams", "3in1"],
    attributes: { condition: "Gera", brand: "Kinderkraft", color: "Juoda" },
    description:
      "Vežimėlis 3in1: lopšys, sportinė dalis, automobilinė kėdutė. Yra lietaus apsauga.",
    sellerId: "seller-home-3",
    createdAt: "2026-06-17T16:20:00Z",
  },

  // Aruodas-style real estate
  {
    id: "demo-aruodas-flat-rent-vilnius",
    title: "Nuomojamas 2 kambarių butas Naujamiestyje",
    price: 620,
    priceLabel: "620€/mėn",
    location: "Vilnius",
    distanceKm: 1.8,
    contact: "Tel. +370 600 13001",
    image:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=300&fit=crop",
    category: "real_estate",
    tags: ["butas", "nuoma", "vilnius", "naujamiestis"],
    attributes: { area: "48 kv.m.", rooms: "2", floor: "3 / 5", heating: "Centrinis" },
    description:
      "Šviesus 2 kambarių butas Naujamiestyje, su baldais, šalia viešasis transportas.",
    sellerId: "seller-estate-1",
    createdAt: "2026-06-19T09:40:00Z",
  },
  {
    id: "demo-aruodas-house-kaunas",
    title: "Parduodamas namas Romainiuose",
    price: 189000,
    location: "Kaunas",
    distanceKm: 6.8,
    contact: "Tel. +370 600 13002",
    image:
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop",
    category: "real_estate",
    tags: ["namas", "kaunas", "romainiai", "parduodamas"],
    attributes: { area: "126 kv.m.", rooms: "4", floor: "1", heating: "Dujinis" },
    description:
      "Naujos statybos namas su daline apdaila, 6 arų sklypas, rami vieta.",
    sellerId: "seller-estate-2",
    createdAt: "2026-06-18T17:00:00Z",
  },
  {
    id: "demo-aruodas-plot-klaipeda",
    title: "Namų valdos sklypas prie Klaipėdos",
    price: 42000,
    location: "Klaipėda",
    distanceKm: 9.3,
    contact: "Tel. +370 600 13003",
    image:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&h=300&fit=crop",
    category: "real_estate",
    tags: ["sklypas", "klaipėda", "namų valda"],
    attributes: { area: "12 a", rooms: "—", floor: "—", heating: "—" },
    description:
      "Namų valdos sklypas su privažiavimu, elektra šalia, tinkamas individualiam namui.",
    sellerId: "seller-estate-3",
    createdAt: "2026-06-18T13:40:00Z",
  },
  {
    id: "demo-aruodas-loft-siauliai",
    title: "Loftas Šiaulių centre",
    price: 76000,
    location: "Šiauliai",
    distanceKm: 1.1,
    contact: "Tel. +370 600 13004",
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=400&h=300&fit=crop",
    category: "real_estate",
    tags: ["loftas", "šiauliai", "centras"],
    attributes: { area: "42 kv.m.", rooms: "1", floor: "4 / 4", heating: "Elektra" },
    description:
      "Modernus loftas centre, aukštos lubos, parkavimo vieta kieme.",
    sellerId: "seller-estate-4",
    createdAt: "2026-06-17T15:10:00Z",
  },
  {
    id: "demo-aruodas-commercial-panevezys",
    title: "Komercinės patalpos prekybai",
    price: 980,
    priceLabel: "980€/mėn",
    location: "Panevėžys",
    distanceKm: 0.9,
    contact: "Tel. +370 600 13005",
    image:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=400&h=300&fit=crop",
    category: "real_estate",
    tags: ["komercinės patalpos", "nuoma", "panevėžys"],
    attributes: { area: "110 kv.m.", rooms: "3", floor: "1 / 2", heating: "Centrinis" },
    description:
      "Patalpos matomoje vietoje, vitriniai langai, atskiras įėjimas, tinka salonui ar biurui.",
    sellerId: "seller-estate-5",
    createdAt: "2026-06-17T09:30:00Z",
  },

  // Paslaugos.lt-style services
  {
    id: "demo-service-electrician-vilnius",
    title: "Elektrikas Vilniuje — rozetės, skydeliai, diagnostika",
    price: 35,
    priceLabel: "35€/val",
    location: "Vilnius",
    distanceKm: 2.5,
    contact: "Tel. +370 600 14001",
    image:
      "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400&h=300&fit=crop",
    category: "services",
    tags: ["elektrikas", "rozetės", "diagnostika", "paslaugos"],
    attributes: {
      experience: "10 m. patirtis",
      serviceList: ["Diagnostika", "Remontas", "Montavimas"],
      invoicing: "Taip, su PVM",
      workingRadius: "Vilnius + 30 km",
    },
    description:
      "Atvykstu tą pačią dieną, tvarkau rozetes, automatinius jungiklius, apšvietimą ir smulkius elektros gedimus.",
    sellerId: "pro-electric-vilnius",
    createdAt: "2026-06-19T08:15:00Z",
    providerVerified: true,
  },
  {
    id: "demo-service-plumber-kaunas",
    title: "Santechnikas Kaune — avariniai darbai",
    price: 32,
    priceLabel: "nuo 32€/val",
    location: "Kaunas",
    distanceKm: 4.0,
    contact: "Tel. +370 600 14002",
    image:
      "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=400&h=300&fit=crop",
    category: "services",
    tags: ["santechnikas", "čiaupas", "vamzdžiai", "avarinis"],
    attributes: {
      experience: "7 m. patirtis",
      serviceList: ["Diagnostika", "Remontas", "Montavimas"],
      invoicing: "Taip, be PVM",
      workingRadius: "Kaunas + 25 km",
    },
    description:
      "Taisau pratekėjimus, keičiu čiaupus, montuoju santechniką. Galimas skubus iškvietimas.",
    sellerId: "pro-plumber-kaunas",
    createdAt: "2026-06-19T07:50:00Z",
    providerVerified: true,
  },
  {
    id: "demo-service-cleaning-klaipeda",
    title: "Buto ir biuro valymas Klaipėdoje",
    price: 45,
    priceLabel: "nuo 45€",
    location: "Klaipėda",
    distanceKm: 3.7,
    contact: "Tel. +370 600 14003",
    image:
      "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=300&fit=crop",
    category: "services",
    tags: ["valymas", "biuras", "butas", "klaipėda"],
    attributes: {
      experience: "5 m. patirtis",
      serviceList: ["Valymas", "Konsultacija"],
      invoicing: "Taip, su PVM",
      workingRadius: "Klaipėda + 40 km",
    },
    description:
      "Generalinis valymas po nuomos, po remonto ir periodinis biurų valymas.",
    sellerId: "pro-cleaning-klaipeda",
    createdAt: "2026-06-18T15:10:00Z",
    providerVerified: true,
  },
  {
    id: "demo-service-tiler-vilnius",
    title: "Plytelių klijavimas ir vonios remontas",
    price: 28,
    priceLabel: "28€/kv.m.",
    location: "Vilnius",
    distanceKm: 6.1,
    contact: "Tel. +370 600 14004",
    image:
      "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&h=300&fit=crop",
    category: "services",
    tags: ["plytelės", "vonia", "remontas", "meistras"],
    attributes: {
      experience: "12 m. patirtis",
      serviceList: ["Remontas", "Montavimas"],
      invoicing: "Taip, be PVM",
      workingRadius: "Vilnius + 50 km",
    },
    description:
      "Klijuoju plyteles, ruošiu pagrindus, tvarkau vonios kambarius nuo A iki Z.",
    sellerId: "pro-tiler-vilnius",
    createdAt: "2026-06-18T14:00:00Z",
    providerVerified: true,
  },
  {
    id: "demo-service-lawn-alytus",
    title: "Žolės pjovimas Alytuje ir rajone",
    price: 22,
    priceLabel: "nuo 22€",
    location: "Alytus",
    distanceKm: 2.3,
    contact: "Tel. +370 600 14005",
    image:
      "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=400&h=300&fit=crop",
    category: "services",
    tags: ["žolės pjovimas", "sodas", "aplinka", "alytus"],
    attributes: {
      experience: "4 m. patirtis",
      serviceList: ["Valymas", "Transportas"],
      invoicing: "Ne",
      workingRadius: "Alytus + 20 km",
    },
    description:
      "Pjaunu žolę, tvarkau aplinką, galiu išvežti žaliąsias atliekas.",
    sellerId: "pro-lawn-alytus",
    createdAt: "2026-06-18T09:20:00Z",
    providerVerified: true,
  },

  // CVbankas-style jobs
  {
    id: "demo-cvbankas-warehouse-vilnius",
    title: "Sandėlininkas Vilniuje",
    price: 1350,
    priceLabel: "1350€/mėn",
    location: "Vilnius",
    distanceKm: 5.0,
    contact: "Tel. +370 600 15001",
    image:
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400&h=300&fit=crop",
    category: "jobs",
    tags: ["darbas", "sandėlininkas", "vilnius", "cvbankas"],
    attributes: {
      jobType: "Siūlau darbą",
      jobTitle: "Sandėlininkas",
      employerName: "UAB Sandėlio centras",
      experienceArea: "Logistika / sandėliavimas",
      jobGroup: "Darbininkai",
      employmentType: "Pilnas etatas",
      salaryType: "Mėnesinis",
      schedule: "Pamaininis grafikas",
      requirements: "Krautuvo pažymėjimas būtų privalumas",
    },
    description:
      "Logistikos įmonė ieško sandėlininko. Darbas su skeneriu, prekių priėmimas ir išdavimas.",
    sellerId: "company-logistics-1",
    createdAt: "2026-06-19T08:00:00Z",
  },
  {
    id: "demo-cvbankas-driver-kaunas",
    title: "Vairuotojas-kurjeris B kategorija",
    price: 1200,
    priceLabel: "1200–1500€/mėn",
    location: "Kaunas",
    distanceKm: 3.5,
    contact: "Tel. +370 600 15002",
    image:
      "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400&h=300&fit=crop",
    category: "jobs",
    tags: ["darbas", "vairuotojas", "kurjeris", "kaunas"],
    attributes: {
      jobType: "Siūlau darbą",
      jobTitle: "Vairuotojas-kurjeris B kat.",
      employerName: "UAB Transaibė",
      experienceArea: "Transportas",
      jobGroup: "Darbininkai",
      employmentType: "Pilnas etatas",
      salaryType: "Mėnesinis",
      schedule: "Pn–Pt, savaitgaliai pagal susitarimą",
      requirements: "B kategorija, atsakingumas, punktualumas",
    },
    description:
      "Ieškome kurjerio Kauno regione. Suteikiamas automobilis ir kuro kortelė.",
    sellerId: "company-delivery-1",
    createdAt: "2026-06-19T07:30:00Z",
  },
  {
    id: "demo-cvbankas-barista-klaipeda",
    title: "Barista kavinėje Klaipėdoje",
    price: 950,
    priceLabel: "nuo 950€/mėn",
    location: "Klaipėda",
    distanceKm: 1.6,
    contact: "Tel. +370 600 15003",
    image:
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=300&fit=crop",
    category: "jobs",
    tags: ["darbas", "barista", "kavinė", "klaipėda"],
    attributes: {
      jobType: "Siūlau darbą",
      jobTitle: "Barista",
      employerName: "UAB Jūros kava",
      experienceArea: "Maisto gamyba / restoranai",
      jobGroup: "Darbininkai",
      employmentType: "Puse etato",
      salaryType: "Mėnesinis",
      schedule: "Slenkantis grafikas",
      requirements: "Patirtis nebūtina, apmokome",
    },
    description:
      "Jauki kavinė ieško baristos. Draugiška komanda, lankstus grafikas.",
    sellerId: "company-cafe-1",
    createdAt: "2026-06-18T18:00:00Z",
  },
  {
    id: "demo-cvbankas-accountant-remote",
    title: "Buhalterė (-is) nuotoliniu būdu",
    price: 1600,
    priceLabel: "1600€/mėn",
    location: "Lietuva",
    distanceKm: 0,
    contact: "Tel. +370 600 15004",
    image:
      "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&h=300&fit=crop",
    category: "jobs",
    tags: ["darbas", "buhalteris", "nuotolinis", "apskaita"],
    attributes: {
      jobType: "Siūlau darbą",
      jobTitle: "Buhalterė (-is)",
      employerName: "UAB Apskaitos sprendimai",
      experienceArea: "Administravimas / apskaita",
      jobGroup: "Specialistai",
      locationType: "Darbas namuose",
      employmentType: "Nuotolinis",
      salaryType: "Mėnesinis",
      schedule: "Lankstus",
      requirements: "Rivilė / B1 patirtis, atidumas",
    },
    description:
      "Apskaitos įmonė ieško buhalterio darbui nuotoliniu būdu su smulkiu verslu.",
    sellerId: "company-accounting-1",
    createdAt: "2026-06-18T12:30:00Z",
  },
  {
    id: "demo-cvbankas-frontend",
    title: "Frontend programuotojas React",
    price: 2800,
    priceLabel: "2800–3500€/mėn",
    location: "Vilnius",
    distanceKm: 2.2,
    contact: "Tel. +370 600 15005",
    image:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&h=300&fit=crop",
    category: "jobs",
    tags: ["darbas", "react", "frontend", "programuotojas"],
    attributes: {
      jobType: "Siūlau darbą",
      jobTitle: "Frontend programuotojas React",
      employerName: "UAB Tech Marketplace",
      experienceArea: "IT / inžinerija",
      jobGroup: "Specialistai",
      employmentType: "Pilnas etatas",
      salaryType: "Mėnesinis",
      schedule: "Hibridinis",
      requirements: "React, TypeScript, UI komponentų patirtis",
    },
    description:
      "Produkto komanda ieško React programuotojo kurti marketplace UI.",
    sellerId: "company-tech-1",
    createdAt: "2026-06-18T11:15:00Z",
  },
];

function prepareListing(listing: Listing): Listing {
  const withCoords = enrichListingCoords(listing);
  const slug = generateListingSlug(listing.title, listing.location);
  const vin =
    typeof listing.attributes?.vin === "string" ? listing.attributes.vin : undefined;
  let h = 0;
  for (let i = 0; i < listing.id.length; i++) h += listing.id.charCodeAt(i);
  const seedViews = 15 + (h % 120);
  return {
    ...withCoords,
    slug,
    contact: listing.contact ?? "+370 612 34567",
    description:
      listing.description ??
      `${listing.title} — ${listing.location}. Susisiekite dėl detalių.`,
    views: listing.views ?? seedViews,
    callClicks: listing.callClicks ?? Math.max(1, Math.floor(seedViews * 0.08)),
    chatStarts: listing.chatStarts ?? Math.max(0, Math.floor(seedViews * 0.04)),
    saveCount: listing.saveCount ?? Math.max(0, Math.floor(seedViews * 0.03)),
    vinVerified: listing.vinVerified ?? (vin ? verifyVin(vin) : false),
    providerVerified:
      listing.providerVerified ?? isVerifiedServiceSeller(listing.sellerId),
  };
}

export const INITIAL_LISTINGS: Listing[] = [
  ...RAW_INITIAL_LISTINGS,
  ...PORTAL_DEMO_LISTINGS,
].map(prepareListing);

export const INITIAL_CHATS: ChatThread[] = [
  {
    id: "chat-1",
    listingId: "l-phone",
    listingTitle: "Mobilus telefonas",
    buyerId: "user-1",
    sellerId: "seller-phone",
    escrowOffered: false,
    messages: [
      {
        id: "m1",
        senderId: "user-1",
        text: "Labas! Ar telefonas dar prieinamas?",
        timestamp: "2026-06-18T09:00:00Z",
      },
      {
        id: "m2",
        senderId: "seller-phone",
        text: "Taip, vis dar parduodu. Būklė puiki.",
        timestamp: "2026-06-18T09:02:00Z",
      },
      {
        id: "m3",
        senderId: "user-1",
        text: "Puiku, man tinka. Ar galėčiau paimti rytoj?",
        timestamp: "2026-06-18T09:05:00Z",
      },
    ],
  },
];

export function formatPrice(price: number, label?: string): string {
  if (label) return label;
  return (
    new Intl.NumberFormat("lt-LT", {
      maximumFractionDigits: 0,
    }).format(price) + "€"
  );
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function formatDistanceBadge(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
