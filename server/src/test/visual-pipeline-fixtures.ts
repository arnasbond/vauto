/** Visual pipeline QA fixtures — deterministic text/code samples for regression checks. */

export interface VisualPipelineFixture {
  id: string;
  category: string;
  description: string;
  /** Synthetic OCR text merged into pipeline attribute extraction. */
  mergedText: string;
  expectVin?: string;
  expectPlate?: string;
  expectBarcode?: string;
  minConfidence?: number;
}

export const VISUAL_PIPELINE_FIXTURES: VisualPipelineFixture[] = [
  {
    id: "auto-vin-plate",
    category: "Auto",
    description: "VIN plokštelė su LT numeriu",
    mergedText: "WVWZZZ3CZWE123456\nABC 123",
    expectVin: "WVWZZZ3CZWE123456",
    expectPlate: "ABC 123",
    minConfidence: 0.4,
  },
  {
    id: "ean-barcode",
    category: "Elektronika",
    description: "EAN-13 brūkšninis kodas",
    mergedText: "5901234123457",
    expectBarcode: "5901234123457",
    minConfidence: 0.4,
  },
  {
    id: "qr-payload",
    category: "Įvairūs",
    description: "QR su URL ir EAN",
    mergedText: "https://example.com/product?ean=5901234123457",
    expectBarcode: "5901234123457",
    minConfidence: 0.35,
  },
  {
    id: "fashion-label",
    category: "Drabužiai",
    description: "Drabužio etiketė su dydžiu",
    mergedText: "ZARA\nDydis M\n100% cotton",
    minConfidence: 0.3,
  },
  {
    id: "service-card",
    category: "Paslaugos",
    description: "Paslaugų vizitinė",
    mergedText: "Remontas Vilniuje\n+37060000000",
    minConfidence: 0.3,
  },
];
