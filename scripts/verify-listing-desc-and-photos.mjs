#!/usr/bin/env node
/**
 * Offline guard: rich vehicle descriptions stay automotive;
 * general/instrument listings must NEVER get car boilerplate.
 */
import assert from "node:assert/strict";

function isThinListingDescription(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (t.length < 120) return true;
  const sentences = t.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 2 && /·|\u00b7/.test(t)) return true;
  return false;
}

function shouldUseAutomotiveListingCopy(category, attributes = {}, title = "") {
  const cat = String(category || "").toLowerCase();
  if (/\b(gitar|guitar|hohner|muzik|pianin)/i.test(`${title} ${JSON.stringify(attributes)}`)) {
    return false;
  }
  if (cat === "vehicles" || cat === "transport") return true;
  if (cat && cat !== "other") return false;
  return Boolean(
    attributes.mileage ||
      attributes.vin ||
      attributes.fuelType ||
      attributes.bodyType ||
      attributes.licensePlate
  );
}

function buildRich(title, attributes = {}, opts = {}) {
  const useAuto = shouldUseAutomotiveListingCopy(
    opts.category,
    attributes,
    title
  );
  if (!useAuto) {
    const label = title || "prekė";
    const instrument = /\b(gitar|guitar|hohner|muzik)/i.test(label);
    return [
      `Parduodamas ${label} — ${
        instrument
          ? "muzikos instrumentas su maloniu skambesiu ir paruoštas groti"
          : "kokybiškas ir praktiškas pasirinkimas pirkėjui"
      }.`,
      "**Pagrindiniai privalumai / savybės:**\n• **Savybės:** tvarkinga prekė kasdieniam naudojimui",
      instrument
        ? "**Būklė ir komplektacija:**\nInstrumentas paruoštas perdavimui; klausimai apie stygas/grifą — mielai atsakysime."
        : "**Būklė ir komplektacija:**\nPrekė paruošta perdavimui.",
      instrument
        ? "**Paskirtis pirkėjui:**\nTinka pradedantiesiems ir mėgėjams."
        : "**Paskirtis pirkėjui:**\nPuikiai tiks kasdieniam naudojimui ar dovanai.",
      opts.location
        ? `Galima apžiūra / atsiėmimas: ${opts.location}. Susisiekite ir sutarsime patogų laiką.`
        : "Susisiekite dėl prekės detalių — atsakome greitai.",
      opts.price > 0
        ? `Kaina ${opts.price} € — realistiškas pasiūlymas greitam sandoriui rimtam pirkėjui.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

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

function stripAutoBoilerplate(text) {
  return String(text || "")
    .replace(/automobilis\s+paruoštas\s+apžiūrai[^.!?\n]*/gi, " ")
    .replace(/servisą,?\s*dokumentus[^.!?\n]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolvePublish(draft) {
  let cleaned = String(draft.description || "").trim();
  const useAuto = shouldUseAutomotiveListingCopy(
    draft.category,
    draft.attributes,
    draft.title
  );
  if (!useAuto && /automobilis\s+paruoštas\s+apžiūrai|servisą,?\s*dokumentus/i.test(cleaned)) {
    cleaned = stripAutoBoilerplate(cleaned);
  }
  if (cleaned && !isThinListingDescription(cleaned)) {
    return cleaned;
  }
  return buildRich(draft.title, draft.attributes, {
    location: draft.location,
    price: draft.price,
    category: draft.category,
    seedDescription: cleaned,
  });
}

function selectAgentVisionUrls(urls) {
  return urls.slice(0, 6);
}

// --- tests ---
const thin = "Citroën C4 Picasso automobilis. Citroën C4 · 2007 m. · Be defektų.";
assert.equal(isThinListingDescription(thin), true);

const rich = resolvePublish({
  title: "Citroën C4 Picasso automobilis",
  description: thin,
  location: "Vilnius",
  price: 2250,
  category: "vehicles",
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
  resolvePublish({
    title: "X",
    description: alreadyRich,
    category: "vehicles",
  }),
  alreadyRich
);

const guitar = resolvePublish({
  title: "Akustinė gitara Hohner",
  description: "Gitara · gera būklė",
  location: "Kaunas",
  price: 120,
  category: "other",
  attributes: { brand: "Hohner", condition: "Gera" },
});
assert.doesNotMatch(guitar, /Automobilis paruoštas apžiūrai/i);
assert.doesNotMatch(guitar, /servisą,\s*dokumentus/i);
assert.doesNotMatch(guitar, /\brida\b/i);
assert.match(guitar, /instrument|prekė|gitara|skambes/i);
assert.match(guitar, /Pagrindiniai privalumai|Būklė ir komplektacija|Paskirtis pirkėjui/i);
assert.ok(guitar.length >= 120, "guitar description must stay rich");
assert.ok(guitar.includes("\n"), "guitar description must be multi-section");
console.log("GUITAR_OK", guitar.slice(0, 180) + "…");

const sixData = Array.from({ length: 6 }, (_, i) => `data:image/jpeg;base64,AAA${i}`);
const visionData = selectAgentVisionUrls(sixData);
assert.equal(visionData.length, 6, "data URL vision subset is all 6");

const sixHttp = Array.from(
  { length: 6 },
  (_, i) => `https://cdn.example.com/p${i}.jpg`
);
assert.equal(selectAgentVisionUrls(sixHttp).length, 6, "http URLs all kept");

const draftVision = selectAgentVisionUrls(sixData);
assert.equal(draftVision.length, 6, "all 6 vision URLs kept for agent POST");

console.log("PHOTO_OK", {
  visionData: visionData.length,
  httpAll: 6,
  draftVision: draftVision.length,
});
console.log("ALL_PASS");
