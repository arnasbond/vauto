/** Demo listings mirrored from the frontend mock data (idempotent seed). */
export interface DemoListingRow {
  id: string;
  seller_id: string;
  title: string;
  price: number;
  price_label?: string;
  location: string;
  distance_km: number;
  image: string;
  category: string;
  tags: string[];
  has_video?: boolean;
  contact?: string;
  description?: string;
  attributes?: Record<string, string | string[]>;
  provider_verified?: boolean;
  vin_verified?: boolean;
}

export const DEMO_USER = {
  id: "user-1",
  name: "Jonas K.",
  phone: "+370 612 34567",
  city: "Panevėžys",
  avatar:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
};

export const DEMO_LISTINGS: DemoListingRow[] = [
  {
    id: "l-bike",
    seller_id: "seller-bike",
    title: "Dviratis 'Trek'",
    price: 150,
    location: "Panevėžys",
    distance_km: 0.8,
    image:
      "https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=400&h=300&fit=crop",
    category: "other",
    tags: ["dviratis", "trek", "sportas"],
    has_video: true,
  },
  {
    id: "l-phone",
    seller_id: "seller-phone",
    title: "Mobilus telefonas",
    price: 220,
    location: "Panevėžys",
    distance_km: 2,
    image:
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop",
    category: "electronics",
    tags: ["telefonas", "mobilus", "pigus", "paaugliui"],
    has_video: false,
  },
  {
    id: "l-handyman",
    seller_id: "seller-handyman",
    title: "Meistras — remonto paslaugos",
    price: 30,
    price_label: "30€/val",
    location: "Panevėžys",
    distance_km: 3,
    image:
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400&h=300&fit=crop",
    category: "services",
    tags: ["meistras", "remontas", "paslauga"],
    has_video: true,
    provider_verified: true,
  },
  {
    id: "l1",
    seller_id: "seller-1",
    title: "iPhone 13 — puiki būklė",
    price: 320,
    location: "Vilnius",
    distance_km: 2.1,
    image:
      "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&h=300&fit=crop",
    category: "electronics",
    tags: ["telefonas", "iphone", "pigus", "paaugliui"],
    has_video: false,
  },
  {
    id: "l3",
    seller_id: "seller-3",
    title: "Žolės pjovimas — greitai ir pigiai",
    price: 25,
    location: "Panevėžys",
    distance_km: 1.2,
    image:
      "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=400&h=300&fit=crop",
    category: "services",
    tags: ["žolė", "pjovimas", "sodas", "paslauga"],
    provider_verified: true,
  },
  {
    id: "l4",
    seller_id: "seller-4",
    title: "VW Golf 2015 — mechaninė",
    price: 4500,
    location: "Šiauliai",
    distance_km: 45,
    image:
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop",
    category: "vehicles",
    tags: ["automobilis", "golf", "mechaninė", "pigus"],
    attributes: {
      vin: "WVWZZZ1KZAW123456",
      mileage: "185 000 km",
      fuelType: "Dyzelinas",
    },
    vin_verified: true,
  },
  {
    id: "l-job-offer",
    seller_id: "seller-job-1",
    title: "Sandėlininkas — pilnas etatas",
    price: 1200,
    price_label: "1200€/mėn",
    location: "Panevėžys",
    distance_km: 1.5,
    contact: "Tel. +3706...",
    image:
      "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=400&h=300&fit=crop",
    category: "jobs",
    tags: ["darbas", "sandėlis", "pilnas etatas"],
    attributes: {
      jobType: "Siūlau darbą",
      employmentType: "Pilnas etatas",
      salaryType: "Mėnesinis",
      schedule: "Pn–Pt 8–17",
      requirements: "B kategorijos vairuotojo pažymėjimas",
    },
    description: "Ieškome atsakingo sandėlininko logistikos centre.",
  },
  {
    id: "l-job-seek",
    seller_id: "seller-job-2",
    title: "Ieškau darbo — vairuotojas / kurjeris",
    price: 900,
    price_label: "nuo 900€/mėn",
    location: "Vilnius",
    distance_km: 4.2,
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
  },
  {
    id: "demo-aruodas-flat-rent-vilnius",
    seller_id: "seller-estate-1",
    title: "Nuomojamas 2 kambarių butas Naujamiestyje",
    price: 620,
    price_label: "620€/mėn",
    location: "Vilnius",
    distance_km: 1.8,
    image:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=300&fit=crop",
    category: "real_estate",
    tags: ["butas", "nuoma", "vilnius", "naujamiestis"],
    attributes: { area: "48 kv.m.", rooms: "2", floor: "3 / 5", heating: "Centrinis" },
    description:
      "Šviesus 2 kambarių butas Naujamiestyje, su baldais, šalia viešasis transportas.",
  },
  {
    id: "demo-aruodas-house-kaunas",
    seller_id: "seller-estate-2",
    title: "Parduodamas namas Romainiuose",
    price: 189000,
    location: "Kaunas",
    distance_km: 6.8,
    image:
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop",
    category: "real_estate",
    tags: ["namas", "kaunas", "romainiai", "parduodamas"],
    attributes: { area: "126 kv.m.", rooms: "4", floor: "1", heating: "Dujinis" },
    description: "Naujos statybos namas su daline apdaila, 6 arų sklypas.",
  },
  {
    id: "demo-aruodas-plot-klaipeda",
    seller_id: "seller-estate-3",
    title: "Namų valdos sklypas prie Klaipėdos",
    price: 42000,
    location: "Klaipėda",
    distance_km: 9.3,
    image:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&h=300&fit=crop",
    category: "real_estate",
    tags: ["sklypas", "klaipėda", "namų valda"],
    attributes: { area: "12 a", rooms: "—", floor: "—", heating: "—" },
    description: "Namų valdos sklypas su privažiavimu, elektra šalia.",
  },
  {
    id: "demo-vinted-zara-coat",
    seller_id: "seller-cloth-1",
    title: "Zara vilnonis paltas M",
    price: 38,
    location: "Vilnius",
    distance_km: 0.8,
    image:
      "https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=400&h=300&fit=crop",
    category: "clothing",
    tags: ["zara", "paltas", "vilna", "m"],
    attributes: { size: "M", brand: "Zara", condition: "Labai gera" },
    description: "Vilnonis Zara paltas, dėvėtas kelis sezonus.",
  },
  {
    id: "demo-skelbiu-sofa",
    seller_id: "seller-home-1",
    title: "Pilka kampinė sofa-lova",
    price: 280,
    location: "Šiauliai",
    distance_km: 0,
    image:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=300&fit=crop",
    category: "home",
    tags: ["sofa", "baldai", "kampinė"],
    description: "Kampinė sofa-lova su patogiu miegojimo mechanizmu.",
  },
  {
    id: "demo-bmw-320d",
    seller_id: "seller-bmw",
    title: "BMW 320d Touring 2018",
    price: 13900,
    location: "Vilnius",
    distance_km: 2.9,
    image:
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400&h=300&fit=crop",
    category: "vehicles",
    tags: ["bmw", "320d", "touring", "dyzelinas"],
    attributes: {
      make: "BMW",
      model: "320d Touring",
      year: "2018",
      mileage: "162 000",
      fuelType: "Dyzelinas",
      gearbox: "Automatinė",
    },
    vin_verified: true,
    description: "Tvarkingas BMW 320d Touring, automatinė dėžė, serviso istorija.",
  },
];
