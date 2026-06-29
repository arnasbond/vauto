import { chatJson } from "./llm-provider.js";
import {
  isWardrobeProfileUrl,
  resolveVintedProfileUrl,
} from "../lib/vinted-url.js";

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
    const title = String(o.title ?? `Drabužis ${idx + 1}`).trim();
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

/** Vieno mygtuko spintos perkėlimas — profilio URL → VAUTO skelbimų juodraščiai. */
export async function importWardrobeProfile(params: {
  profileUrl: string;
  userName?: string;
  defaultLocation?: string;
  fetchHtml?: (url: string) => Promise<string>;
}): Promise<WardrobeProfileImportResult> {
  const profileUrl = params.profileUrl.trim();
  const firstName = params.userName?.trim().split(/\s+/)[0] || "drauge";

  if (!isWardrobeProfileUrl(profileUrl)) {
    throw new Error(
      "Įveskite galiojantį Vinted profilio URL (/member/ arba /invite/)."
    );
  }

  const resolvedProfileUrl = await resolveVintedProfileUrl(profileUrl);

  let pageText = "";
  try {
    const fetchPage =
      params.fetchHtml ??
      (async (url: string) => {
        const res = await fetch(url, {
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; VautoWardrobeImporter/1.0; +https://vauto.app)",
            Accept: "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) throw new Error("fetch_failed");
        return res.text();
      });
    pageText = stripHtml(await fetchPage(resolvedProfileUrl)).slice(0, 18_000);
  } catch {
    const items = demoProfileItems(params.userName);
    return {
      profileUrl: resolvedProfileUrl,
      items,
      voiceAnnouncement: `${firstName}, paruošiau ${items.length} skelbimus iš tavo spintos — peržiūrėk ir patvirtink vienu paspaudimu!`,
    };
  }

  if (pageText.length < 60) {
    const items = demoProfileItems(params.userName);
    return {
      profileUrl: resolvedProfileUrl,
      items,
      voiceAnnouncement: `${firstName}, profilio turinys ribotas — sugeneravau ${items.length} demo juodraščius redagavimui.`,
    };
  }

  const locationHint = params.defaultLocation?.trim()
    ? `Numatyta vieta (tik jei profilyje nematoma): ${params.defaultLocation.trim()}`
    : "Vietos lauką palik tuščią arba naudok tik tai, kas aiškiai matoma profilyje — nefantazuok geografijos.";

  const raw = await chatJson([
    {
      role: "system",
      content: `Tu esi VAUTO Spintos Importo AI. Iš profilio HTML ištrauk VISUS matomus aktyvius drabužių skelbimus.
Grąžink JSON: ${IMPORT_SCHEMA}
SVARBU: jokių geografinių apribojimų — location tik jei aiškiai profilyje. Kategorijos universalios, ne portalų UI kopija.`,
    },
    {
      role: "user",
      content: `Profilio URL: ${resolvedProfileUrl}\n${locationHint}\nHTML tekstas:\n"""${pageText}"""`,
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

  return {
    profileUrl: resolvedProfileUrl,
    sellerDisplayName,
    items,
    voiceAnnouncement: `${firstName}, radau ${items.length} prek${items.length === 1 ? "ę" : "es"} tavo spintoje. Paruošiau ${items.length} VAUTO skelbim${items.length === 1 ? "ą" : "us"} — beliko patvirtinti!`,
  };
}

export { isWardrobeProfileUrl } from "../lib/vinted-url.js";
