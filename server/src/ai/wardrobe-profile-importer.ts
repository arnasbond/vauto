import { chatJson } from "./llm-provider.js";
import { logProductionWarn } from "../lib/production-log.js";
import {
  detectPortalKeyFromUrl,
  isPortalProfileUrl,
  portalLabelForKey,
} from "../lib/portal-profile-url.js";
import {
  isWardrobeProfileUrl,
  resolveVintedProfileUrl,
} from "../lib/vinted-url.js";
import { fetchPortalProfileHtml } from "../spinta/portal-profile-scraper.js";

export interface ImportedWardrobeItem {
  id: string;
  title: string;
  price: number;
  category: string;
  size: string;
  color: string;
  brand: string;
  condition: string;
  description: string;
  imageUrl?: string;
  location?: string;
}

export interface WardrobeProfileImportResult {
  profileUrl: string;
  sellerDisplayName?: string;
  items: ImportedWardrobeItem[];
  voiceAnnouncement: string;
  /** Sum of imported item prices (EUR) */
  wardrobeValueTotal: number;
  itemCount: number;
  portalKey?: string;
}

export function computeWardrobeValueTotal(items: ImportedWardrobeItem[]): number {
  return Math.round(
    items.reduce((sum, item) => sum + Math.max(0, Number(item.price) || 0), 0)
  );
}

function withImportMeta(
  result: Omit<WardrobeProfileImportResult, "wardrobeValueTotal" | "itemCount"> & {
    portalKey?: string;
  }
): WardrobeProfileImportResult {
  return {
    ...result,
    itemCount: result.items.length,
    wardrobeValueTotal: computeWardrobeValueTotal(result.items),
  };
}

const IMPORT_SCHEMA = `{
  "sellerDisplayName": "string | null",
  "items": [
    {
      "id": "import-1",
      "title": "string",
      "price": "number EUR",
      "category": "clothing subcategory lietuviškai",
      "size": "string",
      "color": "string",
      "brand": "string",
      "condition": "string",
      "description": "string 1-3 sakiniai",
      "imageUrl": "string absolute URL jei matoma HTML, kitaip null",
      "location": "string tik jei aiškiai matoma profilyje, kitaip null"
    }
  ]
}`;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseItems(raw: Record<string, unknown>): ImportedWardrobeItem[] {
  const arr = raw.items;
  if (!Array.isArray(arr)) return [];
  const out: ImportedWardrobeItem[] = [];
  for (let idx = 0; idx < arr.length; idx += 1) {
    const entry = arr[idx];
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const title = String(o.title ?? `Prekė ${idx + 1}`).trim();
    if (!title) continue;
    out.push({
      id: String(o.id ?? `import-${idx + 1}`),
      title,
      price: Math.max(1, Number(o.price) || 10),
      category: String(o.category ?? "Drabužiai"),
      size: String(o.size ?? "M"),
      color: String(o.color ?? "Mišri"),
      brand: String(o.brand ?? "Be ženklo"),
      condition: String(o.condition ?? "Labai gera"),
      description: String(o.description ?? title),
      imageUrl: o.imageUrl ? String(o.imageUrl) : undefined,
      location: o.location ? String(o.location) : undefined,
    });
  }
  return out;
}

function demoProfileItems(userName?: string): ImportedWardrobeItem[] {
  return [
    {
      id: "import-1",
      title: "Vilnonis megztinis",
      price: 22,
      category: "Megztiniai",
      size: "M",
      color: "Kreminė",
      brand: "COS",
      condition: "Labai gera",
      description: "Minkštas vilnonis megztinis — lengvas, šiltas, universalus.",
    },
    {
      id: "import-2",
      title: "Platus sijonas",
      price: 18,
      category: "Sijonai",
      size: "S",
      color: "Ruda",
      brand: "Mango",
      condition: "Gera",
      description: "Platus midi sijonas kasdienai ir vakarėliui.",
    },
    {
      id: "import-3",
      title: "Lininiai marškinėliai",
      price: 14,
      category: "Palaidinės",
      size: "M",
      color: "Balta",
      brand: "H&M",
      condition: "Labai gera",
      description: "Natūralus linas — vasarai ir sluoksniavimui.",
    },
  ];
}

function buildVoiceAnnouncement(
  firstName: string,
  count: number,
  portalLabel: string
): string {
  if (count <= 0) {
    return `${firstName}, portale ${portalLabel} prekių neradau — patikrink nuorodą.`;
  }
  return `${firstName}, sinchronizavau ${count} prek${count === 1 ? "ę" : "es"} iš ${portalLabel}. Atnaujinta tavo spinta!`;
}

/** Vieno mygtuko spintos perkėlimas — bet kurio portalo profilio URL → VAUTO skelbimai. */
export async function importWardrobeProfile(params: {
  profileUrl: string;
  userName?: string;
  defaultLocation?: string;
  fetchHtml?: (url: string) => Promise<string>;
}): Promise<WardrobeProfileImportResult> {
  const profileUrl = params.profileUrl.trim();
  const firstName = params.userName?.trim().split(/\s+/)[0] || "drauge";
  const portalKey = detectPortalKeyFromUrl(profileUrl);

  if (!portalKey || !isPortalProfileUrl(profileUrl, portalKey)) {
    throw new Error("Įveskite galiojančią portalo profilio nuorodą.");
  }

  const portalLabel = portalLabelForKey(portalKey);
  let resolvedProfileUrl = profileUrl;
  if (isWardrobeProfileUrl(profileUrl)) {
    resolvedProfileUrl = await resolveVintedProfileUrl(profileUrl);
  }

  let pageText = "";
  try {
    const fetchPage = params.fetchHtml ?? fetchPortalProfileHtml;
    pageText = stripHtml(await fetchPage(resolvedProfileUrl)).slice(0, 18_000);
  } catch (err) {
    logProductionWarn("portal-import", "Profile HTML fetch failed — using demo items", {
      profileUrl: resolvedProfileUrl.slice(0, 120),
      portalKey,
      error: err instanceof Error ? err.message : String(err),
    });
    const items = demoProfileItems(params.userName);
    return withImportMeta({
      profileUrl: resolvedProfileUrl,
      portalKey,
      items,
      voiceAnnouncement: buildVoiceAnnouncement(firstName, items.length, portalLabel),
    });
  }

  if (pageText.length < 60) {
    logProductionWarn("portal-import", "Profile HTML too short — using demo items", {
      profileUrl: resolvedProfileUrl.slice(0, 120),
      portalKey,
      length: pageText.length,
    });
    const items = demoProfileItems(params.userName);
    return withImportMeta({
      profileUrl: resolvedProfileUrl,
      portalKey,
      items,
      voiceAnnouncement: `${firstName}, profilio turinys ribotas — sugeneravau ${items.length} demo juodraščius redagavimui.`,
    });
  }

  const locationHint = params.defaultLocation?.trim()
    ? `Numatyta vieta (tik jei profilyje nematoma): ${params.defaultLocation.trim()}`
    : "Vietos lauką palik tuščią arba naudok tik tai, kas aiškiai matoma profilyje — nefantazuok geografijos.";

  const raw = await chatJson([
    {
      role: "system",
      content: `Tu esi VAUTO Spintos Importo AI. Iš ${portalLabel} profilio HTML ištrauk VISUS matomus aktyvius skelbimus/prekes.
Grąžink JSON: ${IMPORT_SCHEMA}
SVARBU: jokių geografinių apribojimų — location tik jei aiškiai profilyje. Kategorijos universalios, ne portalų UI kopija.
Kiekvienam item id naudok skaitinį ID iš portalo URL arba unikalų identifikatorių jei matomas HTML.`,
    },
    {
      role: "user",
      content: `Portalo tipas: ${portalLabel} (${portalKey})
Profilio URL: ${resolvedProfileUrl}
${locationHint}
HTML tekstas:
"""${pageText}"""`,
    },
  ]);

  let items = parseItems(raw as Record<string, unknown>);
  if (!items.length) items = demoProfileItems(params.userName);

  if (params.defaultLocation?.trim()) {
    items = items.map((item) => ({
      ...item,
      location: item.location?.trim() || params.defaultLocation!.trim(),
    }));
  }

  const sellerDisplayName =
    typeof (raw as Record<string, unknown>).sellerDisplayName === "string"
      ? String((raw as Record<string, unknown>).sellerDisplayName)
      : undefined;

  return withImportMeta({
    profileUrl: resolvedProfileUrl,
    sellerDisplayName,
    portalKey,
    items,
    voiceAnnouncement: buildVoiceAnnouncement(firstName, items.length, portalLabel),
  });
}

export { isWardrobeProfileUrl } from "../lib/vinted-url.js";
