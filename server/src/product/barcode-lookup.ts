import {
  classifyBarcode,
  extractBarcodeFromQrPayload,
  isIsbnBarcode,
  isValidBarcode,
  normalizeBarcode,
} from "./barcode-utils.js";
import type { BarcodeLookupResult } from "./product-lookup-types.js";

export type { BarcodeLookupResult } from "./product-lookup-types.js";

const UNREGISTERED_MSG =
  "Kodas atpažintas, bet nerastas viešame registre. Parašykite daikto pavadinimą patys, o aš sugeneruosiu aprašymą.";

function buildTechnicalDescription(parts: {
  title: string;
  brand?: string;
  author?: string;
  category?: string;
  quantity?: string;
  ingredients?: string;
  publishYear?: string;
  specs: string[];
  source: string;
}): string {
  const lines: string[] = [];
  if (parts.brand) lines.push(`Prekės ženklas: ${parts.brand}`);
  if (parts.author) lines.push(`Autorius: ${parts.author}`);
  if (parts.title) lines.push(`Pavadinimas: ${parts.title}`);
  if (parts.publishYear) lines.push(`Leidimo metai: ${parts.publishYear}`);
  if (parts.category) lines.push(`Kategorija: ${parts.category}`);
  if (parts.quantity) lines.push(`Kiekis / talpa / dydis: ${parts.quantity}`);
  for (const spec of parts.specs) lines.push(spec);
  if (parts.ingredients) lines.push(`Sudėtis: ${parts.ingredients}`);
  lines.push(`Duomenų šaltinis: ${parts.source}.`);
  return lines.join("\n");
}

async function lookupOpenLibrary(barcode: string): Promise<BarcodeLookupResult | null> {
  try {
    const isbn = normalizeBarcode(barcode);
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`,
      { signal: AbortSignal.timeout(12_000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Record<
      string,
      {
        title?: string;
        authors?: Array<{ name?: string }>;
        publishers?: Array<{ name?: string }>;
        publish_date?: string;
        number_of_pages?: number;
        subjects?: Array<{ name?: string }>;
      }
    >;
    const key = `ISBN:${isbn}`;
    const book = json[key];
    if (!book?.title) return null;

    const authors = book.authors?.map((a) => a.name).filter(Boolean).join(", ");
    const year = book.publish_date?.match(/\d{4}/)?.[0];
    const specs: string[] = [];
    if (book.number_of_pages) specs.push(`Puslapių: ${book.number_of_pages}`);
    const subject = book.subjects?.[0]?.name;
    const source = "open-library" as const;
    const title = book.title.trim();

    return {
      source,
      verified: true,
      confidence: 0.92,
      barcode: isbn,
      title,
      author: authors || undefined,
      brand: book.publishers?.[0]?.name,
      category: subject ? `Knygos — ${subject}` : "Knygos",
      publishYear: year,
      specs,
      technicalDescription: buildTechnicalDescription({
        title,
        author: authors,
        brand: book.publishers?.[0]?.name,
        category: subject,
        publishYear: year,
        specs,
        source: "Open Library",
      }),
    };
  } catch {
    return null;
  }
}

async function lookupOpenBeautyFacts(barcode: string): Promise<BarcodeLookupResult | null> {
  try {
    const res = await fetch(
      `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { signal: AbortSignal.timeout(12_000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: number;
      product?: Record<string, unknown>;
    };
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const title =
      String(p.product_name_lt ?? p.product_name ?? p.generic_name ?? "").trim() ||
      "Kosmetika / mados prekė";
    const brand = String(p.brands ?? "").trim() || undefined;
    const quantity = String(p.quantity ?? "").trim() || undefined;
    const catTags = p.categories_tags;
    const category =
      (Array.isArray(catTags) && catTags.length > 0
        ? String(catTags[0])
        : String(p.categories ?? "")
      )
        .replace(/^en:/, "")
        .replace(/-/g, " ")
        .trim() || "Kosmetika / mada";
    const ingredients =
      String(p.ingredients_text_lt ?? p.ingredients_text ?? "").trim() || undefined;
    const specs: string[] = [];
    const source = "open-beauty-facts" as const;

    return {
      source,
      verified: true,
      confidence: 0.9,
      barcode,
      title,
      brand,
      category,
      quantity,
      ingredients,
      specs,
      technicalDescription: buildTechnicalDescription({
        title,
        brand,
        category,
        quantity,
        ingredients,
        specs,
        source: "Open Beauty Facts",
      }),
    };
  } catch {
    return null;
  }
}

async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeLookupResult | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { signal: AbortSignal.timeout(12_000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: number;
      product?: Record<string, unknown>;
    };
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const title =
      String(p.product_name_lt ?? p.product_name ?? p.generic_name ?? "").trim() ||
      "Produktas";
    const brand = String(p.brands ?? "").trim() || undefined;
    const catTags = p.categories_tags;
    const category =
      (Array.isArray(catTags) && catTags.length > 0
        ? String(catTags[0])
        : String(p.categories ?? "")
      )
        .replace(/^en:/, "")
        .replace(/-/g, " ")
        .trim() || undefined;
    const quantity = String(p.quantity ?? "").trim() || undefined;
    const ingredients =
      String(p.ingredients_text_lt ?? p.ingredients_text ?? "").trim() || undefined;
    const specs: string[] = [];
    const nutriscore = String(p.nutriscore_grade ?? "").trim();
    if (nutriscore) specs.push(`Nutri-Score: ${nutriscore.toUpperCase()}`);
    const source = "open-food-facts" as const;

    return {
      source,
      verified: true,
      confidence: 0.88,
      barcode,
      title,
      brand,
      category,
      quantity,
      ingredients,
      specs,
      technicalDescription: buildTechnicalDescription({
        title,
        brand,
        category,
        quantity,
        ingredients,
        specs,
        source: "Open Food Facts",
      }),
    };
  } catch {
    return null;
  }
}

async function lookupUpcItemDb(barcode: string): Promise<BarcodeLookupResult | null> {
  try {
    const res = await fetch("https://api.upcitemdb.com/prod/trial/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ upc: barcode }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: Array<Record<string, unknown>>;
    };
    const item = json.items?.[0];
    if (!item) return null;
    const title = String(item.title ?? item.description ?? "").trim() || "Produktas";
    const brand = String(item.brand ?? "").trim() || undefined;
    const category = String(item.category ?? "").trim() || undefined;
    const specs: string[] = [];
    const model = String(item.model ?? "").trim();
    if (model) specs.push(`Modelis: ${model}`);
    const color = String(item.color ?? "").trim();
    if (color) specs.push(`Spalva: ${color}`);
    const size = String(item.size ?? "").trim();
    if (size) specs.push(`Dydis: ${size}`);
    const source = "upcitemdb" as const;

    return {
      source,
      verified: true,
      confidence: 0.86,
      barcode,
      title,
      brand,
      category,
      specs,
      technicalDescription: buildTechnicalDescription({
        title,
        brand,
        category,
        specs,
        source: "UPCitemdb",
      }),
    };
  } catch {
    return null;
  }
}

function buildUnregistered(barcode: string): BarcodeLookupResult {
  const source = "barcode-unregistered" as const;
  return {
    source,
    verified: false,
    confidence: 0.35,
    barcode,
    title: "",
    specs: [`EAN/UPC/ISBN: ${barcode}`],
    notFoundInRegistry: true,
    userMessage: UNREGISTERED_MSG,
    technicalDescription: `${UNREGISTERED_MSG}\n\nKodas: ${barcode}`,
  };
}

export async function lookupBarcodeLive(barcode: string): Promise<BarcodeLookupResult> {
  const kind = classifyBarcode(barcode);

  if (kind === "isbn" || isIsbnBarcode(barcode)) {
    const book = await lookupOpenLibrary(barcode);
    if (book) return book;
  }

  const beauty = await lookupOpenBeautyFacts(barcode);
  if (beauty) return beauty;

  const food = await lookupOpenFoodFacts(barcode);
  if (food) return food;

  const upc = await lookupUpcItemDb(barcode);
  if (upc) return upc;

  return buildUnregistered(barcode);
}

export function productLookupFeatures(): {
  openLibrary: boolean;
  openBeautyFacts: boolean;
  openFoodFacts: boolean;
  upcItemDb: boolean;
  liveOnly: boolean;
} {
  return {
    openLibrary: true,
    openBeautyFacts: true,
    openFoodFacts: true,
    upcItemDb: true,
    liveOnly: true,
  };
}

export async function lookupBarcodeOnServer(
  identifier?: string
): Promise<BarcodeLookupResult | null> {
  const raw = identifier?.trim() ?? "";
  if (!raw) return null;

  let barcode = isValidBarcode(raw) ? normalizeBarcode(raw) : undefined;
  if (!barcode) barcode = extractBarcodeFromQrPayload(raw);
  if (!barcode || !isValidBarcode(barcode)) return null;

  return lookupBarcodeLive(barcode);
}
