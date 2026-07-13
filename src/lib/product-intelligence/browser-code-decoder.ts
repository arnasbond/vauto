"use client";

import {
  isValidBarcode,
  normalizeBarcode,
} from "@/lib/product-intelligence/barcode-utils";

type NativeBarcodeDetector = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type NativeBarcodeDetectorCtor = new (opts?: {
  formats?: string[];
}) => NativeBarcodeDetector;

const DETECTOR_FORMATS = [
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "data_matrix",
  "ean_13",
  "ean_8",
  "itf",
  "pdf417",
  "upc_a",
  "upc_e",
];

function extractSupportedPayload(raw: string | undefined): string | null {
  const payload = raw?.trim();
  if (!payload) return null;
  if (isValidBarcode(payload)) return normalizeBarcode(payload);
  return null;
}

async function imageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

async function decodeWithNativeDetector(dataUrl: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const Detector = (window as Window & { BarcodeDetector?: NativeBarcodeDetectorCtor })
    .BarcodeDetector;
  if (!Detector) return null;

  const img = await imageFromDataUrl(dataUrl);
  const detector = new Detector({ formats: DETECTOR_FORMATS });
  const results = await detector.detect(img);
  for (const result of results) {
    const code = extractSupportedPayload(result.rawValue);
    if (code) return code;
  }
  return null;
}

export async function decodeBarcodeFromImage(
  dataUrl: string
): Promise<string | null> {
  if (!dataUrl.startsWith("data:image")) return null;

  try {
    const native = await decodeWithNativeDetector(dataUrl);
    if (native) return native;
  } catch {
    return null;
  }
  return null;
}
