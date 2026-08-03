/**
 * Fashion / clothing — aesthetic, vivid marketplace copy.
 */

import { NATURAL_SALES_COPY_DIRECTIVE } from "./system-handbook.js";

export const CLOTHING_PROMPTER = `
KATEGORIJA: MADA / DRABUŽIAI / AKSESUARAI

${NATURAL_SALES_COPY_DIRECTIVE}

FOKUSAS šiai kategorijai — vaizdingas, estetinis stilius:
- Dydis, prekės ženklas, audinys / medžiaga, spalva — jei žinoma
- Prigludimas, kirpimas, sezono / stiliaus jausmas (iš faktų ir nuotraukų)
- Būklė ir unikalios detalės (etiketės, dekoras) — tik kas matoma / pasakyta
- Šiltas hook + • bullet'ai dydžiui / medžiagai; išlaikyk marketplace grožį, ne sausą anketą

CATEGORY-STRICT ATRIBUTAI (PRIVALOMA):
- Leidžiami: brand, size, colors, condition, clothingType, fashionCategory, fashionSubcategory, audinys/medžiaga, shippingOptions.
- DRAUDŽIAMA: deviceModel, manufacturer, MacBook, iPhone, storageCapacity, VIN, rida, kW, fuelType, make/model (auto), kitos technikos specifikacijos.
- Jei OCR / sesijoje matosi elektronikos pavadinimai — IGNORUOK; jie nepriklauso drabužio skelbimui.
`;
