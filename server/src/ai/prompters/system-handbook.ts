/**
 * VAUTO AI Employee Handbook — gold-standard few-shot benchmark examples.
 * Injected into Pass 1 (extraction) and Pass 2 (creative write) pipelines.
 */

export type HandbookCategoryId =
  | "electronics"
  | "auto"
  | "music"
  | "art"
  | "realestate"
  | "services"
  | "jobs"
  | "publish";

export interface HandbookBenchmark {
  id: string;
  categoryId: HandbookCategoryId;
  title: string;
  inputContext: string;
  expectedAction: string;
  /** Pass 1 cold-facts pattern (JSON-shaped guidance). */
  extractionPattern: string;
  /** Pass 2 Lithuanian sales-copy structure (gold output). */
  generationPattern: string;
}

/** EXAMPLE A — Electronics packaging (PEIKO X9 Translator) */
export const BENCHMARK_ELECTRONICS_PEIKO: HandbookBenchmark = {
  id: "A",
  categoryId: "electronics",
  title: "Electronics Packaging — PEIKO X9 Translator",
  inputContext:
    "Product packaging back/side photos containing technical text (PEIKO translator box).",
  expectedAction:
    "Vision AI extracts ALL visible text specs from packaging into technicalFields + factNotes/ocrText. Auto-fill PrePublish. No follow-up questions for data already on the box.",
  extractionPattern: `{
  "intent": "sell",
  "category": "ELEKTRONIKA",
  "technicalFields": {
    "brand": "PEIKO",
    "model": "X9",
    "productType": "išmanusis kalbos vertėjas",
    "languages": "daugiau nei 40 kalbų",
    "features": "2 krypčių tiesioginis balso vertimas realiu laiku; Noise Reduction microphone; Type-C įkrovimas",
    "battery": "ilga baterijos veikimo trukmė",
    "condition": "Naujas, originalioje pakuotėje",
    "contents": "instrukcija, įkrovimo kabelis"
  },
  "factNotes": "PEIKO X9 — 2-way realtime voice translation, 40+ languages, noise reduction mic, Type-C",
  "city": "Vilnius"
}`,
  generationPattern: `**Antraštė:** Naujas išmanusis kalbos vertėjas PEIKO X9

**Specifikacijos ir ypatybės:**
• 2 krypčių tiesioginis balso vertimas realiu laiku
• Palaiko daugiau nei 40 kalbų
• Aktyvus triukšmo slopinimas (Noise Reduction microphone)
• Type-C įkrovimo jungtis, ilga baterijos veikimo trukmė

**Būklė:** Naujas, originalioje pakuotėje su instrukcija bei įkrovimo kabeliu.

**Pristatymas / Apžiūra:** Vilnius / pristatymas paštomatu.`,
};

/**
 * EXAMPLE B — Automotive Regitra passport.
 * GENERIC placeholders only (no hardcoded Citroën / Picasso / leather).
 * Injected ONLY when Pass-2 prompterId === "auto" (full vehicle), never for parts/wheels.
 */
export const BENCHMARK_AUTO_REGITRA: HandbookBenchmark = {
  id: "B",
  categoryId: "auto",
  title: "Automotive Registration Certificate — Regitra Passport",
  inputContext:
    "Green Regitra registration certificate image + car photos of a FULL vehicle (not wheels/parts alone).",
  expectedAction:
    "Extract D.1/D.3/E/P.1/P.2/P.3/B from THIS certificate only. NEVER invent salon/TA/mileage. NEVER use this template for ratlankiai/padangos/dalys.",
  extractionPattern: `{
  "intent": "sell",
  "category": "AUTOMOBILIAI",
  "technicalFields": {
    "make": "<D.1 iš OCR — NEkopijuok pavyzdžio markės>",
    "model": "<D.3 VERBATIM iš OCR>",
    "year": "<iš B datos>",
    "firstRegistration": "<YYYY-MM-DD iš B>",
    "fuelType": "<P.3>",
    "powerKw": "<P.2>",
    "seats": "<S.1>",
    "bodyType": "<tik jei matoma>"
  },
  "factNotes": "Regitra OCR: tik perskaityti laukai — be išgalvotų salono/TA/ridos faktų"
}`,
  generationPattern: `**Antraštė:** <make> <model VERBATIM> <metai — TIK iš OCR>

**Specifikacijos ir Savybės:**
• Markė / Modelis (D.1 / D.3): <tik iš OCR>
• Pirmos registracijos metai (B): <tik iš OCR>
• Kuro tipas / galia / sėdynės — TIK jei OCR matoma

**Būklė:** Aprašyk TIK matomas / vartotojo nurodytas ypatybes. DRAUDŽIAMA „odinis salonas", jei nematyti.

**Pristatymas / Apžiūra:** Galima apžiūrėti vietoje.

HARD: jei prekė = ratlankiai / padangos / dalys — NENAUDOK šio auto šablono; rašyk apie ratus/dalį, be salono/variklio/pavarų.`,
};

/** EXAMPLE C — Musical instrument */
export const BENCHMARK_MUSIC_HOHNER: HandbookBenchmark = {
  id: "C",
  categoryId: "music",
  title: "Musical Instrument — HOHNER HW220 T Acoustic Guitar",
  inputContext: "Acoustic guitar photo on stand.",
  expectedAction:
    "Category MUZIKA. Zero automotive concepts. Write about sound, wood, frets, condition, suitability.",
  extractionPattern: `{
  "intent": "sell",
  "category": "MUZIKA",
  "technicalFields": {
    "brand": "HOHNER",
    "model": "HW220 T",
    "instrumentType": "akustinė gitara",
    "condition": "Naudota, labai geros būklės, prižiūrėta"
  },
  "factNotes": "HOHNER HW220 T acoustic guitar on stand"
}`,
  generationPattern: `**Antraštė:** HOHNER HW220 T Akustinė Gitara

**Savybės ir Skambesys:** Šiltas ir gilus akustinis skambesys, patogus grifas, kokybiškas medžio korpusas. Puikiai tinka tiek pradedantiesiems, tiek jau grojantiems.

**Būklė:** Naudota, labai geros būklės, prižiūrėta.

**Pristatymas / Apžiūra:** Galima apžiūrėti ir išbandyti vietoje.`,
};

/** EXAMPLE D — Art & Decor */
export const BENCHMARK_ART_PAINTING: HandbookBenchmark = {
  id: "D",
  categoryId: "art",
  title: "Art & Decor — Handmade Painting / Artwork",
  inputContext: "Photo of a framed painting or wall art piece.",
  expectedAction:
    "Category MENAS. Engaging art copy grounded in visual technique, condition, and room fit. No auto templates.",
  extractionPattern: `{
  "intent": "sell",
  "category": "MENAS",
  "technicalFields": {
    "Atlikimas": "Rankų darbas, tapyba ant drobės",
    "Paskirtis": "Interjerui / sienos dekorui",
    "Būklė": "Puikios būklės, paruoštas kabinimui",
    "Spalvos": "išraiškingos"
  },
  "factNotes": "Framed handmade painting on canvas"
}`,
  generationPattern: `**Antraštė:** Rankų darbo tapytas paveikslas / Meno kūrinys

**Aprašymas ir Technika:** Originalus autoriaus darbas, išraiškingos spalvos bei potėpių tekstūra. Tapyba ant drobės / įrėmintas. Puikiai tinka svetainės, miegamojo ar biuro interjerui pagyvinti ir papuošti.

**Išmatavimai ir Būklė:** Puikios būklės, paruoštas kabinimui ant sienos.

**Pristatymas / Apžiūra:** Saugus pakavimas siunčiant arba atsiėmimas vietoje.`,
};

/** EXAMPLE E — Real estate / NT */
export const BENCHMARK_REALESTATE_NT: HandbookBenchmark = {
  id: "E",
  categoryId: "realestate",
  title: "Real Estate / NT — Apartment for sale or rent",
  inputContext: "Apartment or house photos / description for sale or rent.",
  expectedAction:
    "Category NT. Focus on location, m², rooms, heating, amenities. Structure: info + benefits + location + terms.",
  extractionPattern: `{
  "intent": "sell",
  "category": "NT",
  "city": "Vilnius",
  "technicalFields": {
    "propertyType": "butas",
    "area": "52",
    "rooms": "2",
    "floor": "3/5",
    "yearBuilt": "2018",
    "heating": "autonominis",
    "amenities": "balkonas, privati parkavimo vieta, liftas",
    "furnishing": "su visais baldais ir buitine technika",
    "district": "Naujamiestis"
  }
}`,
  generationPattern: `**Antraštė:** Erdvus ir šviesus 2 kambarių butas Naujamiestyje

**Pagrindinė informacija ir Privalumai:**
• Plotas: 52 m², aukštas: 3/5, statybos metai: 2018 m.
• Šildymas: autonominis (maži komunaliniai mokesčiai)
• Įrengimas: parduodamas / nuomojamas su visais baldais ir kokybiška buitine technika.
• Ypatybės: balkonas, privati parkavimo vieta uždarame kieme, lifto buvimas.

**Vieta ir Infrastruktūra:** Puikus susisiekimas su centru, šalia viešojo transporto stotelės, prekybos centrai ir parkas.

**Sąlygos / Kaina:** Paruoštas įsikėlimui iš karto.`,
};

/** EXAMPLE F — Services */
export const BENCHMARK_SERVICES: HandbookBenchmark = {
  id: "F",
  categoryId: "services",
  title: "Services — Interior finishing / repair",
  inputContext:
    "Commercial services (construction, tool rental, solar installation).",
  expectedAction:
    "Category PASLAUGOS. List performed works, guarantees, contact/estimate CTA. No product-auto templates.",
  extractionPattern: `{
  "intent": "sell",
  "category": "PASLAUGOS",
  "technicalFields": {
    "serviceType": "vidaus apdailos ir remonto paslaugos",
    "works": "Glaistymas, dažymas, tapetavimas; GKP montavimas; plytelės ir grindų danga",
    "guarantee": "Darbams suteikiama garantija, SF"
  }
}`,
  generationPattern: `**Antraštė:** Profesionalių vidaus apdailos ir remonto paslaugų teikimas

**Atliekami darbai:**
• Glaistymas, dažymas, tapetavimas
• Gipso kartono konstrukcijų montavimas
• Plytelių klojimas ir grindų danga

**Privalumai ir Garantijos:** Metų patirtis sektoriuje, naudojamos aukščiausios kokybės medžiagos ir profesionalūs įrankiai. Darbams suteikiama garantija, išrašomos sąskaitos-faktūros.

**Atsiskaitymas / Kontaktai:** Nemokamas atvykimas ir sąmatos įvertinimas vietoje.`,
};

/** EXAMPLE G — Jobs */
export const BENCHMARK_JOBS: HandbookBenchmark = {
  id: "G",
  categoryId: "jobs",
  title: "Job Offers — B-category driver-courier",
  inputContext: "Job vacancy details or work experience overview.",
  expectedAction:
    "Category DARBAS. Structure: role, responsibilities, requirements, compensation. Clear LT job-ad tone.",
  extractionPattern: `{
  "intent": "sell",
  "category": "DARBAS",
  "technicalFields": {
    "role": "B kategorijos vairuotojas-kurjeris",
    "responsibilities": "Siuntų pristatymas; dokumentų pildymas; bendravimas su klientais",
    "requirements": "B kategorija (≥2 m. patirtis), atsakingumas, punktualumas",
    "salary": "nuo 1200 € / mėn. į rankas",
    "schedule": "lankstus grafikas"
  }
}`,
  generationPattern: `**Antraštė:** Ieškomas patyręs B kategorijos vairuotojas-kurjeris

**Darbo pobūdis ir Atsakomybės:**
• Siuntų pristatymas klientams numatytu maršrutu
• Tvarkingas siuntų ir lydinčių dokumentų pildymas
• Reprezentatyvus bendravimas su klientais

**Reikalavimai kandidatui:** B kategorijos vairuotojo pažymėjimas (bent 2 m. patirtis), atsakingumas, punktualumas.

**Siūlome / Atlyginimas:** Konkurencingas atlyginimas nuo 1200 € / mėn. (į rankas), lankstus grafikas ir visos darbui reikalingos priemonės.`,
};

/** EXAMPLE H — Direct publish execution (behavioral, not copy) */
export const BENCHMARK_DIRECT_PUBLISH: HandbookBenchmark = {
  id: "H",
  categoryId: "publish",
  title: "Direct Publish Execution",
  inputContext:
    'User clicks „Publikuoti" or types „Publikuok" / „Ne nereikia, publikuok" when price is already present.',
  expectedAction:
    "Instantly finalize publication / open PrePublish publish path. NEVER re-ask for price or additional photos when price and (if required) photos are already present.",
  extractionPattern: `(behavioral — no JSON extraction)
- If price already in draft / PrePublish form / session lock → proceed.
- If user says Publikuok / Ne nereikia, publikuok → publish immediately when readiness ok.
- Do NOT nudge for more photos when publish intent is explicit and gallery already has images (or text-first with price).`,
  generationPattern: `(behavioral — no creative copy)
- Success UX: Lottie celebration; no secondary green toast.
- Clean slate after publish for next listing session.`,
};

/** Full ordered handbook suite A–H. */
export const VAUTO_SYSTEM_HANDBOOK: HandbookBenchmark[] = [
  BENCHMARK_ELECTRONICS_PEIKO,
  BENCHMARK_AUTO_REGITRA,
  BENCHMARK_MUSIC_HOHNER,
  BENCHMARK_ART_PAINTING,
  BENCHMARK_REALESTATE_NT,
  BENCHMARK_SERVICES,
  BENCHMARK_JOBS,
  BENCHMARK_DIRECT_PUBLISH,
];

function formatBenchmarkBlock(b: HandbookBenchmark, mode: "extraction" | "generation"): string {
  const body =
    mode === "extraction" ? b.extractionPattern : b.generationPattern;
  return `### EXAMPLE ${b.id}: ${b.title}
Input: ${b.inputContext}
Expected: ${b.expectedAction}
${mode === "extraction" ? "Pass-1 extraction pattern" : "Pass-2 gold output structure"}:
${body}`;
}

export type HandbookPrompterId =
  | "auto"
  | "music"
  | "realestate"
  | "general"
  | "jobs"
  | "services";

/**
 * Categories allowed in Pass-1 "general" few-shots.
 * HARD: never inject AUTO Regitra / Citroën benchmarks into general extraction —
 * that leaks full-car templates into wheels/parts/electronics.
 */
const PACKAGING_HANDBOOK_CATEGORIES = new Set<HandbookCategoryId>([
  "electronics",
  "music",
  "art",
]);

/**
 * Compact Pass-1 few-shot block.
 * Packaging/PEIKO examples are omitted for jobs / services / realestate.
 */
export function buildHandbookExtractionFewShots(
  prompterId?: HandbookPrompterId
): string {
  let selected = VAUTO_SYSTEM_HANDBOOK;
  if (prompterId === "jobs") {
    selected = VAUTO_SYSTEM_HANDBOOK.filter(
      (b) => b.categoryId === "jobs" || b.categoryId === "publish"
    );
  } else if (prompterId === "services") {
    selected = VAUTO_SYSTEM_HANDBOOK.filter(
      (b) => b.categoryId === "services" || b.categoryId === "publish"
    );
  } else if (prompterId === "realestate") {
    selected = VAUTO_SYSTEM_HANDBOOK.filter(
      (b) => b.categoryId === "realestate" || b.categoryId === "publish"
    );
  } else if (prompterId === "auto" || prompterId === "music") {
    const allow = new Set(
      prompterId === "auto"
        ? (["auto", "publish"] as HandbookCategoryId[])
        : (["music", "publish"] as HandbookCategoryId[])
    );
    selected = VAUTO_SYSTEM_HANDBOOK.filter((b) => allow.has(b.categoryId));
  } else if (prompterId === "general") {
    selected = VAUTO_SYSTEM_HANDBOOK.filter(
      (b) =>
        PACKAGING_HANDBOOK_CATEGORIES.has(b.categoryId) ||
        b.categoryId === "publish"
    );
  }

  const blocks = selected
    .map((b) => formatBenchmarkBlock(b, "extraction"))
    .join("\n\n");
  return `
═══════════════════════════════════════════════════════════════
VAUTO AI EMPLOYEE HANDBOOK — PASS 1 FEW-SHOT BENCHMARKS (GOLD)
Naudok kaip etaloną: ekstrahuok faktus TOKIU pat tikslumu ir struktūra.
PASTABA: pakuotės / PEIKO / etiketės pavyzdžiai taikomi TIK fizinių prekių kontekstui.
═══════════════════════════════════════════════════════════════
${blocks}
`;
}

/** Compact Pass-2 few-shot block; optionally filter by category prompter id. */
export function buildHandbookGenerationFewShots(
  prompterId?: HandbookPrompterId
): string {
  const byPrompter: Record<HandbookPrompterId, HandbookCategoryId[]> = {
    auto: ["auto"],
    music: ["music"],
    realestate: ["realestate"],
    // Physical goods only — never inject PEIKO into jobs/services via general.
    general: ["electronics", "art"],
    jobs: ["jobs"],
    services: ["services"],
  };
  const allowed = prompterId ? byPrompter[prompterId] : undefined;
  const selected = allowed
    ? VAUTO_SYSTEM_HANDBOOK.filter((b) => allowed.includes(b.categoryId))
    : VAUTO_SYSTEM_HANDBOOK.filter((b) => b.categoryId !== "publish");

  const blocks = selected.map((b) => formatBenchmarkBlock(b, "generation")).join("\n\n");
  const structureNote =
    prompterId === "jobs" || prompterId === "services" || prompterId === "realestate"
      ? "Struktūra: Hook → Pareigos/Paslauga/Objektas → Sąlygos → CTA. Be pakuotės/etiketės."
      : "Struktūra: Antraštė → Specifikacijos ir Savybės / Privalumai → Būklė → Pristatymas / Apžiūra.";
  return `
═══════════════════════════════════════════════════════════════
VAUTO AI EMPLOYEE HANDBOOK — PASS 2 FEW-SHOT BENCHMARKS (GOLD)
Naudok kaip etaloną: rašyk FACT-GROUNDED LT copy TOKIU pat stiliumi ir sekcijomis.
${structureNote}
═══════════════════════════════════════════════════════════════
${blocks}
`;
}

/** Category-scoped handbook slice for a prompter (generation-focused + matching extraction). */
export function getHandbookSliceForPrompter(
  prompterId: HandbookPrompterId
): string {
  return buildHandbookGenerationFewShots(prompterId);
}

/** Full handbook text (debug / admin). */
export function buildFullSystemHandbook(): string {
  return `${buildHandbookExtractionFewShots()}\n${buildHandbookGenerationFewShots()}`;
}
