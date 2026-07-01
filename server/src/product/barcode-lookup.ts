import {
  extractBarcodeFromQrPayload,
  isValidBarcode,
  normalizeBarcode,
} from "./barcode-utils.js";

export interface BarcodeLookupResult {
  source: "open-food-facts" | "upcitemdb" | "barcode-demo";
  verified: boolean;
  confidence: number;
  barcode: string;
  title: string;
  brand?: string;
  category?: string;
  quantity?: string;
  ingredients?: string;
  specs: string[];
  technicalDescription: string;
}

function buildTechnicalDescription(parts: {
  title: string;
  brand?: string;
  category?: string;
  quantity?: string;
  ingredients?: string;
  specs: string[];
  source: string;
}): string {
  const lines: string[] = [];
  if (parts.brand) lines.push(`Prekės ženklas: ${parts.brand}`);
  if (parts.title) lines.push(`Pavadinimas: ${parts.title}`);
  if (parts.category) lines.push(`Kategorija: ${parts.category}`);
  if (parts.quantity) lines.push(`Kiekis / talpa: ${parts.quantity}`);
  for (const spec of parts.specs) lines.push(spec);
  if (parts.ingredients) lines.push(`Sudėtis: ${parts.ingredients}`);
  lines.push(`Duomenų šaltinis: ${parts.source}.`);
  return lines.join("\n");
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
    const ingredients = String(p.ingredients_text_lt ?? p.ingredients_text ?? "").trim() || undefined;
    const specs: string[] = [];
    const nutriscore = String(p.nutriscore_grade ?? "").trim();
    if (nutriscore) specs.push(`Nutri-Score: ${nutriscore.toUpperCase()}`);
    const source = "open-food-facts" as const;
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

function lookupBarcodeDemo(barcode: string): BarcodeLookupResult {
  const source = "barcode-demo" as const;
  const title = "Universalus produktas (demo)";
  return {
    source,
    verified: false,
    confidence: 0.7,
    barcode,
    title,
    brand: "Demo",
    category: "Buitis",
    specs: ["Brūkšninis kodas atpažintas — demo režimas"],
    technicalDescription: buildTechnicalDescription({
      title,
      brand: "Demo",
      category: "Buitis",
      specs: [`EAN/UPC: ${barcode}`],
      source: "demo adapteris",
    }),
  };
}

export async function lookupBarcodeOnServer(
  identifier?: string
): Promise<BarcodeLookupResult | null> {
  const raw = identifier?.trim() ?? "";
  if (!raw) return null;

  let barcode = isValidBarcode(raw) ? normalizeBarcode(raw) : undefined;
  if (!barcode) {
    barcode = extractBarcodeFromQrPayload(raw);
  }
  if (!barcode || !isValidBarcode(barcode)) return null;

  const off = await lookupOpenFoodFacts(barcode);
  if (off) return off;

  const upc = await lookupUpcItemDb(barcode);
  if (upc) return upc;

  return lookupBarcodeDemo(barcode);
}
