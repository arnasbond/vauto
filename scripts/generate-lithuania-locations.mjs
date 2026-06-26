/** Generates src/data/lithuania-locations.ts — all 60 LT municipalities (Aruodas-style). */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "../src/data/lithuania-locations.ts");

/** Official 60 savivaldybės + representative gyvenvietės (admin centrai + didesni miesteliai). */
const SETTLEMENTS_BY_MUNICIPALITY = {
  "Vilniaus miesto": ["Vilnius"],
  "Vilniaus rajono": [
    "Nemenčinė", "Trakai", "Rudamina", "Mickūnai", "Beizionys", "Medininkai", "Naujoji Vilnia",
    "Pagiriai", "Pabradė", "Saulėtekis", "Valakininkai", "Valkininkai", "Vievis", "Zujūnai",
  ],
  "Kauno miesto": ["Kaunas"],
  "Kauno rajono": [
    "Garliava", "Kulautuva", "Birštonas", "Babtai", "Eiguliai", "Giraitė", "Jieznas", "Karmėlava",
    "Kulautuva", "Lapės", "Raudondvaris", "Ringaudai", "Rumšiškės", "Vilkija", "Zapyškis",
  ],
  "Klaipėdos miesto": ["Klaipėda"],
  "Klaipėdos rajono": [
    "Gargždai", "Priekulė", "Dovilai", "Aguila", "Dreverna", "Giruliai", "Judrėnai", "Kretinga",
    "Priekulė", "Sendvaris", "Vėžaičiai",
  ],
  "Šiaulių miesto": ["Šiauliai"],
  "Šiaulių rajono": [
    "Ginkūnai", "Kuršėnai", "Linkaičiai", "Meškuičiai", "Raudėnai", "Šiaulėnai", "Gruzdžiai",
    "Kairiai", "Kurtuvėnai", "Luokė", "Meškuičiai", "Pašvitinys", "Raudėnai",
  ],
  "Panevėžio miesto": ["Panevėžys"],
  "Panevėžio rajono": [
    "Krekenava", "Ramygala", "Smilgiai", "Upytė", "Vadokliai", "Velžys", "Krinčinas", "Miežiškiai",
    "Naujamiestis", "Paobeliai", "Raguvėlė", "Subačius", "Vabalninkas",
  ],
  "Alytaus miesto": ["Alytus"],
  "Alytaus rajono": [
    "Daugai", "Druskininkai", "Krokialaukis", "Simnas", "Butrimonys", "Krokialaukis", "Punia",
    "Raitininkai", "Valkininkai", "Vievis",
  ],
  "Marijampolės": [
    "Marijampolė", "Kalvarija", "Kazlų Rūda", "Liudvinavas", "Sasnava", "Gelgaudiškis", "Kudirkos Naumiestis",
    "Pilvaišiai", "Šeštokai", "Virbalis",
  ],
  "Mažeikių rajono": ["Mažeikiai", "Seda", "Viekšniai", "Laižuva", "Pikeliai", "Tirkšliai"],
  "Jonavos rajono": ["Jonava", "Rukla", "Žeimiai", "Bukonys", "Daugailiai", "Kulva", "Rumšiškės", "Upninkai"],
  "Utenos rajono": ["Utena", "Daugailiai", "Leliūnai", "Moletai", "Sudeikiai", "Užpaliai", "Vyzuonos"],
  "Kėdainių rajono": ["Kėdainiai", "Dotnuva", "Gudžiūnai", "Josvainiai", "Krakės", "Pernarava", "Surviliškis"],
  "Telšių rajono": ["Telšiai", "Varniai", "Luokė", "Nevarėnai", "Užventis", "Viešvėnai", "Žarėnai"],
  "Tauragės rajono": ["Tauragė", "Bataki", "Gaurė", "Pajūris", "Skaudvilė", "Šilalė", "Žygaičiai"],
  "Ukmergės rajono": ["Ukmergė", "Deltuva", "Lyduokiai", "Pabaiskas", "Siesikai", "Vidiškiai", "Žemaitkiemis"],
  "Kretingos rajono": ["Kretinga", "Darbėnai", "Kartena", "Salantai", "Vydmantai", "Žibininkai"],
  "Plungės rajono": ["Plungė", "Gintališkės", "Kuliai", "Plateliai", "Rietavas", "Stalgėnai", "Žemaičių Kalvarija"],
  "Šilutės rajono": ["Šilutė", "Juknaičiai", "Katyčiai", "Rusnė", "Silutė", "Usėnai", "Vainutas", "Vilkyčiai"],
  "Radviliškio rajono": ["Radviliškis", "Baisogala", "Grinkiškis", "Pociūnai", "Šeduva", "Tadaušiai", "Tyzenhauzai"],
  "Rokiškio rajono": ["Rokiškis", "Juodupė", "Kamajai", "Obeliai", "Pandėlys", "Panemunėlis", "Suvainiškis"],
  "Biržų rajono": ["Biržai", "Pabiržė", "Parovėja", "Pandėlys", "Vabalninkas", "Viešintos"],
  "Anykščių rajono": ["Anykščiai", "Debeikiai", "Kavarskas", "Kurkliai", "Rubikiai", "Svėdasai", "Troškūnai"],
  "Raseinių rajono": ["Raseiniai", "Ariogala", "Betygala", "Girkalnis", "Nemakščiai", "Paliūniškis", "Viduklė"],
  "Akmenės rajono": ["Naujoji Akmenė", "Akmenė", "Papilė", "Venta", "Kruopiai", "Alkiškiai"],
  "Jurbarko rajono": ["Jurbarkas", "Girdžiai", "Raudonė", "Seredžius", "Smalininkai", "Veliuona", "Vilkyškiai"],
  "Vilkaviškio rajono": ["Vilkaviškis", "Keturvalakiai", "Kybartai", "Klausučiai", "Pilviškiai", "Virbalis"],
  "Prienų rajono": ["Prienai", "Ašminta", "Balbieriškis", "Išlaužas", "Jieznas", "Stakliškės", "Veiveriai"],
  "Trakų rajono": ["Trakai", "Lentvaris", "Onuškis", "Rūdiškės", "Semeliškės", "Vievis", "Aukštadvaris"],
  "Kaišiadorių rajono": ["Kaišiadorys", "Kruonis", "Paparčiai", "Pravieniškės", "Rumšiškės", "Strošiūnai", "Žasliai"],
  "Varėnos rajono": ["Varėna", "Daugai", "Marcinkonys", "Merkinė", "Senoji Varėna", "Valkininkai", "Vydeniai"],
  "Lazdijų rajono": ["Lazdijai", "Daugai", "Kapčiamiestis", "Meteliai", "Norviliškės", "Veisiejai", "Vilkiautinis"],
  "Šalčininkų rajono": ["Šalčininkai", "Dieveniškės", "Eišiškės", "Jašiūnai", "Pabarė", "Rudamina", "Turgeliai"],
  "Ignalinos rajono": ["Ignalina", "Daugailiai", "Dūkštas", "Kazitiškis", "Linkmenys", "Naujasis Daugėliškis", "Rimšė"],
  "Zarasų rajono": ["Zarasai", "Antalieptė", "Dusetos", "Salakas", "Suvieja", "Tilžė", "Turmantas"],
  "Švenčionių rajono": ["Švenčionys", "Adutiškis", "Kaltanėnai", "Pabradė", "Strachoviškis", "Svirkos", "Tverečius"],
  "Molėtų rajono": ["Molėtai", "Alanta", "Balninkai", "Dubingiai", "Giedraičiai", "Inturkė", "Luokesa", "Suginčiai"],
  "Elektrėnų": ["Elektrėnai", "Vievydas", "Semeliškės", "Kietaviškės"],
  "Širvintų rajono": ["Širvintos", "Alanta", "Cirkliškis", "Gelvonai", "Musninkai", "Zibalai"],
  "Pakruojo rajono": ["Pakruojis", "Linkuva", "Lyguočiai", "Pašvitinys", "Rozalimas", "Subačius", "Žeimelis"],
  "Kelmės rajono": ["Kelmė", "Kražiai", "Pašiaušė", "Tytuvėnai", "Užventis", "Vainutas", "Viduklė"],
  "Šakių rajono": ["Šakiai", "Gelgaudiškis", "Kudirkos Naumiestis", "Lekė", "Plokščiai", "Zapyškis", "Žemoji Panemunė"],
  "Šilalės rajono": ["Šilalė", "Kaltinėnai", "Laukuva", "Pajūris", "Skaudvilė", "Tūbinės", "Upyna"],
  "Joniškio rajono": ["Joniškis", "Linksmėnai", "Rudiškiai", "Satkūnai", "Skaistgirys", "Užventis", "Žagarė"],
  "Pasvalio rajono": ["Pasvalys", "Krinčinas", "Pabiržė", "Pandėlys", "Salčininkai", "Vabalninkas", "Viešintos"],
  "Kupiškio rajono": ["Kupiškis", "Alanta", "Antalieptė", "Leliūnai", "Subačius", "Vabaliunai", "Virbaliunai"],
  "Skuodo rajono": ["Skuodas", "Barstyčiai", "Kretinga", "Lenkimai", "Mosėdis", "Salantai", "Ylakiai"],
  "Druskininkų": ["Druskininkai", "Grūtas", "Kairiai", "Merkys", "Ratnyčia", "Viečiūnai"],
  "Palangos miesto": ["Palanga", "Giruliai", "Šventoji", "Nemirseta"],
  "Neringos": ["Nida", "Juodkrantė", "Preila", "Pervalka", "Smiltynė"],
  "Birštono": ["Birštonas", "Balbieriškis", "Jieznas", "Prienai", "Vievis"],
  "Kalvarijos": ["Kalvarija", "Liudvinavas", "Sasnava", "Virbalis", "Kazlų Rūda"],
  "Kazlų Rūdos": ["Kazlų Rūda", "Kazlų Rūda II", "Plokščiai", "Sasnava", "Vištytis"],
  "Pagėgių": ["Pagėgiai", "Lumpėnai", "Pilviškiai", "Vilkyčiai", "Žibininkai"],
  "Rietavo": ["Rietavas", "Girėnai", "Lauksva", "Tverai", "Vainutas", "Viduklė"],
  "Visagino": ["Visaginas", "Sedula", "Zarasai"],
};

const MICRODISTRICTS_BY_SETTLEMENT = {
  Vilnius: [
    "Antakalnis", "Fabijoniškės", "Justiniškės", "Karoliniškės", "Lazdynai", "Naujamiestis",
    "Naujininkai", "Pašilaičiai", "Pilaitė", "Senamiestis", "Šeškinė", "Šnipiškės", "Verkiai",
    "Viršuliškės", "Žirmūnai", "Žvėrynas", "Grigiškės", "Vilkpėdė",
  ],
  Kaunas: [
    "Aleksotas", "Centras", "Dainava", "Eiguliai", "Gričiupis", "Panemunė", "Petrašiūnai",
    "Šančiai", "Šilainiai", "Vilijampolė", "Žaliakalnis", "Kalniečiai", "Romainiai",
  ],
  Klaipėda: ["Centras", "Melnragė", "Smiltynė", "Vingis", "Giruliai", "Bandelė", "Martiškės", "Sendvaris"],
  Panevėžys: ["Centras", "Rožynas", "Stetiškės", "Nevėžis", "Smėlynė", "Tulpių", "Vasario 16-osios"],
  Šiauliai: ["Centras", "Dainiai", "Gytariai", "Lieporiai", "Medelynas", "Pabaliai", "Rėkyva", "Tilžė"],
  Alytus: ["Centras", "Dainava", "Putinai", "Senamiestis", "Pirmoji Alytus", "Antroji Alytus"],
  Palanga: ["Centras", "Giruliai", "Nemirseta", "Šventoji"],
  Marijampolė: ["Centras", "Geležinkelio stotis", "Prienai", "Sodų"],
  Utena: ["Centras", "Dauniškis", "Pramonės", "Sedula"],
  Telšiai: ["Centras", "Džiugas", "Luokė", "Naujamiestis"],
};

const STREETS_BY_SETTLEMENT = {
  Vilnius: [
    "Gedimino pr.", "Konstitucijos pr.", "Ukmergės g.", "Ozo g.", "Kalvarijų g.", "Savanorių pr.",
    "Antakalnio g.", "Basanavičiaus g.", "Didžioji g.", "Geležinkelio g.", "Goštauto g.",
    "J. Basanavičiaus g.", "Laisvės pr.", "Mindaugo g.", "Pilies g.", "Rinktinės g.", "T. Kosciuškos g.",
    "Vilniaus g.", "Žirmūnų g.",
  ],
  Kaunas: [
    "Laisvės al.", "Savanorių pr.", "Vytauto pr.", "Pramonės pr.", "Kovo 11-osios g.", "A. Mickevičiaus g.",
    "Donelaičio g.", "Gedimino g.", "Jonavos g.", "Karaliaus Mindaugo pr.", "Muitinės g.", "Piliakalnio g.",
    "Vytauto pr.", "Vytauto Didžiojo g.",
  ],
  Klaipėda: ["Tiltų g.", "H. Manto g.", "Taikos pr.", "Minijos g.", "Naujoji g.", "Pilies g.", "Statybininkų pr."],
  Panevėžys: ["Respublikos g.", "Klaipėdos g.", "S. Dariaus ir S. Girėno g.", "Laisvės a.", "Vasario 16-osios g."],
  Šiauliai: ["Vilniaus g.", "Tilžės g.", "Pramonės g.", "Tilžės g.", "Dubijos g.", "Gegužių g."],
  Alytus: ["Pulko g.", "S. Dariaus ir S. Girėno g.", "Topolių al.", "Vilniaus g.", "Naujoji g."],
};

export const MUNICIPALITIES = Object.keys(SETTLEMENTS_BY_MUNICIPALITY);

const header = `/** Official LT location tree — ${MUNICIPALITIES.length} savivaldybės (Aruodas-style). Auto-generated. */
`;

const body = `${header}
export const MUNICIPALITIES = ${JSON.stringify(MUNICIPALITIES, null, 2)} as const;

export type MunicipalityName = (typeof MUNICIPALITIES)[number];

export const SETTLEMENTS_BY_MUNICIPALITY: Record<string, string[]> = ${JSON.stringify(SETTLEMENTS_BY_MUNICIPALITY, null, 2)};

export const MICRODISTRICTS_BY_SETTLEMENT: Record<string, string[]> = ${JSON.stringify(MICRODISTRICTS_BY_SETTLEMENT, null, 2)};

export const STREETS_BY_SETTLEMENT: Record<string, string[]> = ${JSON.stringify(STREETS_BY_SETTLEMENT, null, 2)};

export function settlementsFor(municipality: string): string[] {
  return SETTLEMENTS_BY_MUNICIPALITY[municipality] ?? [];
}

export function microdistrictsFor(settlement: string): string[] {
  return MICRODISTRICTS_BY_SETTLEMENT[settlement] ?? [];
}

export function streetsFor(settlement: string): string[] {
  return STREETS_BY_SETTLEMENT[settlement] ?? [];
}

export function allSettlements(): string[] {
  const seen = new Set<string>();
  for (const list of Object.values(SETTLEMENTS_BY_MUNICIPALITY)) {
    for (const s of list) seen.add(s);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "lt"));
}
`;

writeFileSync(out, body, "utf8");
console.log(`Wrote ${out} — ${MUNICIPALITIES.length} municipalities`);
