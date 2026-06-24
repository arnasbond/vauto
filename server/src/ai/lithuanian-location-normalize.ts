/** Lithuanian city/region names → nominative (vardininkas) for search filters. */
const LT_CITY_NOMINATIVE: Record<string, string> = {
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
  klaipedos: "Klaipėda",
  klaipėdos: "Klaipėda",
  siauliai: "Šiauliai",
  šiauliai: "Šiauliai",
  siauliuose: "Šiauliai",
  šiauliuose: "Šiauliai",
  siauliu: "Šiauliai",
  šiaulių: "Šiauliai",
  panevezys: "Panevėžys",
  panevėžys: "Panevėžys",
  panevezyje: "Panevėžys",
  panevėžyje: "Panevėžys",
  panevezio: "Panevėžys",
  panevėžio: "Panevėžys",
  alytus: "Alytus",
  alytuje: "Alytus",
  alytaus: "Alytus",
  marijampole: "Marijampolė",
  marijampolė: "Marijampolė",
  marijampoleje: "Marijampolė",
  marijampolėje: "Marijampolė",
  utena: "Utena",
  utenoje: "Utena",
  utenos: "Utena",
  birzai: "Biržai",
  biržai: "Biržai",
  birzuose: "Biržai",
  biržuose: "Biržai",
  birzu: "Biržai",
  biržų: "Biržai",
  pasvalys: "Pasvalys",
  pasvalyje: "Pasvalys",
  pasvalio: "Pasvalys",
  rokiskis: "Rokiškis",
  rokiškis: "Rokiškis",
  rokiskyje: "Rokiškis",
  rokiškyje: "Rokiškis",
  rokiskio: "Rokiškis",
  rokiškio: "Rokiškis",
  kupiskis: "Kupiškis",
  kupiškis: "Kupiškis",
  kupiskyje: "Kupiškis",
  kupiškyje: "Kupiškis",
  kupiskio: "Kupiškis",
  kupiškio: "Kupiškis",
  anyksciai: "Anykščiai",
  anykščiai: "Anykščiai",
  anyksciuose: "Anykščiai",
  anykščiuose: "Anykščiai",
  jonava: "Jonava",
  jonavoje: "Jonava",
  jonavos: "Jonava",
  kedainiai: "Kėdainiai",
  kėdainiai: "Kėdainiai",
  kedainiuose: "Kėdainiai",
  kėdainiuose: "Kėdainiai",
  telsiai: "Telšiai",
  telšiai: "Telšiai",
  telsiuose: "Telšiai",
  telšiuose: "Telšiai",
  taurage: "Tauragė",
  tauragė: "Tauragė",
  taurageje: "Tauragė",
  tauragėje: "Tauragė",
  ukmerge: "Ukmergė",
  ukmergė: "Ukmergė",
  ukmergeje: "Ukmergė",
  ukmergėje: "Ukmergė",
  visaginas: "Visaginas",
  visagino: "Visaginas",
  visagine: "Visaginas",
  plunge: "Plungė",
  plungė: "Plungė",
  plunges: "Plungė",
  plungės: "Plungė",
  plungėje: "Plungė",
  kretinga: "Kretinga",
  kretingoje: "Kretinga",
  kretingos: "Kretinga",
  druskininkai: "Druskininkai",
  druskininkuose: "Druskininkai",
  palanga: "Palanga",
  palangoje: "Palanga",
  palangos: "Palanga",
  silute: "Šilutė",
  šilutė: "Šilutė",
  siluteje: "Šilutė",
  šilutėje: "Šilutė",
  radviliskis: "Radviliškis",
  radviliškis: "Radviliškis",
  radviliskyje: "Radviliškis",
  radviliškyje: "Radviliškis",
  gargzdai: "Gargždai",
  gargzduose: "Gargždai",
  gargžduose: "Gargždai",
  moletai: "Molėtai",
  molėtai: "Molėtai",
  moletuose: "Molėtai",
  molėtuose: "Molėtai",
  zarasai: "Zarasai",
  zarasuose: "Zarasai",
  zarasų: "Zarasai",
  ignalina: "Ignalina",
  ignalinoje: "Ignalina",
  ignalinos: "Ignalina",
  svencionys: "Švenčionys",
  švenčionys: "Švenčionys",
  svencionyse: "Švenčionys",
  švenčionyse: "Švenčionys",
  lietuva: "Lietuva",
  lietuvoje: "Lietuva",
};

function normalizeLtLocationKey(input: string): string {
  return input
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

/** Resolve inflected Lithuanian place name to nominative form for filters. */
export function resolveLtCityNominative(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return raw;

  const firstToken = raw.split(/[,/\s]/)[0]?.trim() ?? raw;
  const key = normalizeLtLocationKey(firstToken);
  const hit = LT_CITY_NOMINATIVE[key];
  if (hit) return hit;

  const wholeKey = normalizeLtLocationKey(raw);
  const wholeHit = LT_CITY_NOMINATIVE[wholeKey];
  if (wholeHit) return wholeHit;

  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1);
}

/** Lowercase normalized key for listing location comparison. */
export function normCityForFilter(loc: string): string {
  const nominative = resolveLtCityNominative(loc);
  return normalizeLtLocationKey(nominative.split(/[,/\s]/)[0] ?? nominative);
}

export const LT_LOCATION_AGENT_HINT = `VIETOVĖS (PRIVALOMA): Atpažink lietuviškus vietovardžius bet kuriuo linksniu (Vilniuje, Kaune, Klaipėdoje, Šiauliuose, Panevėžyje, Pasvalyje ir t.t.) ir searchListings.city / postNewListing.city perduok TIK vardininku (Vilnius, Kaunas, Klaipėda, Šiauliai, Panevėžys, Pasvalys). Jei vartotojas neįvardina miesto — NEPERDUOK city parametro; paieška ir B2B analitika vyksta visoje Lietuvoje.`;
