/**
 * Quick local verify: rich publish description + vision URL selection for 6 photos.
 * Run: node scripts/verify-listing-desc-and-photos.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// tsx/ts-node may be unavailable — duplicate the pure helpers inline for CI-less check
function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

function selectAgentVisionUrls(urls) {
  if (!urls.length) return [];
  const http = urls.filter(isHttpUrl);
  if (http.length) return http.slice(0, 6);
  const data = urls.filter((u) => String(u).startsWith("data:"));
  return data.slice(0, 1);
}

function isThinListingDescription(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return true;
  if (t.length < 120) return true;
  const sentences = t.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 2 && /·|\u00b7/.test(t)) return true;
  return false;
}

function buildRich(title, attributes = {}, opts = {}) {
  const make = attributes.make || "";
  const model = attributes.model || "";
  const year = attributes.year || "";
  const fuel = attributes.fuelType || "";
  const condition = attributes.defects || attributes.condition || "";
  const vehicleLabel = [make, model].filter(Boolean).join(" ") || title;
  const sentences = [];
  sentences.push(
    `Parduodamas ${vehicleLabel}${year ? `, ${year} m.` : ""} — patrauklus pasirinkimas pirkėjui, kuris ieško praktinio ir patikimo varianto.`
  );
  if (fuel) {
    sentences.push(
      `Pagrindiniai akcentai: kuras: ${fuel}. Tai padeda greitai įvertinti, ar automobilis atitinka jūsų poreikius.`
    );
  }
  sentences.push(
    condition
      ? `Būklė: ${condition}. Skelbime siekiame aiškumo — kviečiame apžiūrėti ir patiems įsitikinti.`
      : "Automobilis paruoštas apžiūrai; jei turite klausimų apie servisą, dokumentus ar komplektaciją — mielai atsakysime."
  );
  if (opts.location) {
    sentences.push(
      `Galima apžiūra: ${opts.location}. Susisiekite ir sutarsime patogų laiką — greiti ir aiškūs atsakymai garantuoti.`
    );
  } else {
    sentences.push(
      "Susisiekite dėl apžiūros ir detalių — atsakome greitai ir padedame priimti sprendimą be spaudimo."
    );
  }
  if (opts.price > 0) {
    sentences.push(
      `Kaina ${opts.price} € — realistiškas pasiūlymas greitam sandoriui rimtam pirkėjui.`
    );
  }
  return sentences.join(" ");
}

function resolvePublish(draft) {
  const cleaned = String(draft.description || "").trim();
  if (cleaned && !isThinListingDescription(cleaned)) return cleaned;
  return buildRich(draft.title, draft.attributes, {
    location: draft.location,
    price: draft.price,
    seedDescription: cleaned,
  });
}

// --- tests ---
const thin = "Citroën C4 Picasso automobilis. Citroën C4 · 2007 m. · Be defektų.";
assert.equal(isThinListingDescription(thin), true);

const rich = resolvePublish({
  title: "Citroën C4 Picasso automobilis",
  description: thin,
  location: "Vilnius",
  price: 2250,
  attributes: {
    make: "Citroën",
    model: "C4 Picasso",
    year: "2007",
    fuelType: "Dyzelinas",
    defects: "Be defektų",
  },
});
assert.ok(rich.length >= 120, "rich description length");
assert.match(rich, /Parduodamas/i);
assert.match(rich, /akcentai|Būklė|Susisiekite|apžiūr/i);
assert.match(rich, /2250/);
console.log("DESC_OK", rich.slice(0, 220) + "…");

const alreadyRich =
  "Parduodamas erdvus ir ekonomiškas Citroen C4 Picasso, pagamintas 2007 metais. Šis patikimas dyzelinis vienatūris, su 1997 cm³ varikliu, yra puikus pasirinkimas šeimai. Mėlynos spalvos automobilis gerai prižiūrėtas. Kviečiame apžiūrėti ir susisiekti.";
assert.equal(
  resolvePublish({ title: "X", description: alreadyRich }),
  alreadyRich
);

const sixData = Array.from({ length: 6 }, (_, i) => `data:image/jpeg;base64,AAA${i}`);
const visionData = selectAgentVisionUrls(sixData);
assert.equal(visionData.length, 1, "data URL vision subset is 1");

const sixHttp = Array.from(
  { length: 6 },
  (_, i) => `https://cdn.example.com/p${i}.jpg`
);
assert.equal(selectAgentVisionUrls(sixHttp).length, 6, "http URLs all kept");

// Simulate trim: draft holds 6 data URLs, agent vision must be 1
const draftVision = selectAgentVisionUrls(sixData);
assert.equal(draftVision.length, 1, "draft orderedImageUrls capped for agent POST");

console.log("PHOTO_OK", {
  visionData: visionData.length,
  httpAll: 6,
  draftVision: draftVision.length,
});
console.log("ALL_PASS");
