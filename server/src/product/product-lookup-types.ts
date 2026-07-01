export type BarcodeLookupSource =
  | "open-library"
  | "open-beauty-facts"
  | "open-food-facts"
  | "upcitemdb"
  | "barcode-unregistered";

export interface BarcodeLookupResult {
  source: BarcodeLookupSource;
  verified: boolean;
  confidence: number;
  barcode: string;
  title: string;
  brand?: string;
  category?: string;
  quantity?: string;
  ingredients?: string;
  author?: string;
  publishYear?: string;
  specs: string[];
  technicalDescription: string;
  notFoundInRegistry?: boolean;
  userMessage?: string;
}
