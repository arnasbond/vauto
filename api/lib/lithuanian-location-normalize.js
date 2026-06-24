const LT_CITY_NOMINATIVE = {
  vilnius: "Vilnius",
  vilniuje: "Vilnius",
  vilniaus: "Vilnius",
  kaunas: "Kaunas",
  kaune: "Kaunas",
  kauno: "Kaunas",
  klaipeda: "Klaipėda",
  klaipėda: "Klaipėda",
  klaipedoje: "Klaipėda",
  klaipėdoje: "Klaipėda",
  siauliai: "Šiauliai",
  šiauliai: "Šiauliai",
  siauliuose: "Šiauliai",
  šiauliuose: "Šiauliai",
  panevezys: "Panevėžys",
  panevėžys: "Panevėžys",
  panevezyje: "Panevėžys",
  panevėžyje: "Panevėžys",
  panevezio: "Panevėžys",
  panevėžio: "Panevėžys",
  alytus: "Alytus",
  alytuje: "Alytus",
  marijampole: "Marijampolė",
  marijampolė: "Marijampolė",
  marijampoleje: "Marijampolė",
  utena: "Utena",
  utenoje: "Utena",
  birzai: "Biržai",
  biržai: "Biržai",
  birzuose: "Biržai",
  biržuose: "Biržai",
  birzu: "Biržai",
  pasvalys: "Pasvalys",
  pasvalyje: "Pasvalys",
  pasvalio: "Pasvalys",
  rokiskis: "Rokiškis",
  rokiškis: "Rokiškis",
  rokiskyje: "Rokiškis",
  rokiškyje: "Rokiškis",
  rokiskio: "Rokiškis",
  kupiskis: "Kupiškis",
  kupiškis: "Kupiškis",
  kupiskyje: "Kupiškis",
  kupiškio: "Kupiškis",
  anyksciai: "Anykščiai",
  anykščiai: "Anykščiai",
  anyksciuose: "Anykščiai",
  jonava: "Jonava",
  jonavoje: "Jonava",
  kedainiai: "Kėdainiai",
  kėdainiai: "Kėdainiai",
  palanga: "Palanga",
  palangoje: "Palanga",
  lietuva: "Lietuva",
  lietuvoje: "Lietuva",
};

function normalizeLtLocationKey(input) {
  return String(input ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ė/g, "e")
    .replace(/š/g, "s")
    .replace(/ų|ū/g, "u")
    .replace(/ž/g, "z")
    .replace(/ą/g, "a")
    .replace(/č/g, "c")
    .replace(/į/g, "i")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveLtCityNominative(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return raw;
  const firstToken = raw.split(/[,/\s]/)[0]?.trim() ?? raw;
  const key = normalizeLtLocationKey(firstToken);
  if (LT_CITY_NOMINATIVE[key]) return LT_CITY_NOMINATIVE[key];
  const wholeHit = LT_CITY_NOMINATIVE[normalizeLtLocationKey(raw)];
  if (wholeHit) return wholeHit;
  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1);
}

function normCityForFilter(loc) {
  const nominative = resolveLtCityNominative(loc);
  return normalizeLtLocationKey(nominative.split(/[,/\s]/)[0] ?? nominative);
}

const LT_LOCATION_AGENT_HINT = `VIETOVĖS (PRIVALOMA): Atpažink lietuviškus vietovardžius bet kuriuo linksniu (Vilniuje, Kaune, Klaipėdoje, Šiauliuose, Panevėžyje, Pasvalyje ir t.t.) ir searchListings.city / postNewListing.city perduok TIK vardininku. Jei vartotojas neįvardina miesto — NEPERDUOK city parametro; paieška vyksta visoje Lietuvoje.`;

module.exports = {
  resolveLtCityNominative,
  normCityForFilter,
  LT_LOCATION_AGENT_HINT,
};
