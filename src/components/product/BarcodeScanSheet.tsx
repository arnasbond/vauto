"use client";

import { Barcode, Camera, Loader2, X } from "lucide-react";
import { useCallback, useState } from "react";
import { capturePhoto } from "@/lib/native-media";
import { isValidBarcode, normalizeBarcode } from "@/lib/product-intelligence/barcode-utils";
import { isDataApiEnabled } from "@/lib/api/config";

interface BarcodeScanSheetProps {
  open: boolean;
  onClose: () => void;
  onBarcodeResolved: (barcode: string) => void;
  title?: string;
  subtitle?: string;
}

export function BarcodeScanSheet({
  open,
  onClose,
  onBarcodeResolved,
  title = "Skenuoti brūkšninį kodą",
  subtitle = "Nufotografuokite aiškiai matomą etiketę arba įveskite kodą ranka.",
}: BarcodeScanSheetProps) {
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitCode = useCallback(
    (raw: string) => {
      const code = normalizeBarcode(raw);
      if (!isValidBarcode(code)) {
        setError("Neteisingas EAN/UPC/ISBN kodas. Patikrinkite skaitmenis.");
        return;
      }
      setError(null);
      setManual("");
      onBarcodeResolved(code);
      onClose();
    },
    [onBarcodeResolved, onClose]
  );

  const handlePhotoScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const photo = await capturePhoto();
      if (!photo?.dataUrl) {
        setError("Nuotrauka neįrašyta.");
        return;
      }

      const { decodeBarcodeFromImage } = await import(
        "@/lib/product-intelligence/browser-code-decoder"
      );
      const localCode = await decodeBarcodeFromImage(photo.dataUrl);
      if (localCode) {
        submitCode(localCode);
        return;
      }

      if (isDataApiEnabled()) {
        const { apiScanBarcodeImage } = await import("@/lib/api/client");
        const code = await apiScanBarcodeImage(photo.dataUrl);
        if (code) {
          submitCode(code);
          return;
        }
      }

      setError(
        "Kodo nuotraukoje nepavyko aptikti. Priartinkite etiketę, pagerinkite apšvietimą arba įveskite kodą ranka."
      );
    } finally {
      setScanning(false);
    }
  }, [submitCode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-xl"
        role="dialog"
        aria-label="Brūkšninio kodo skaitymas"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--vauto-text-main)]">{title}</h3>
            <p className="mt-1 text-sm text-[var(--vauto-text-muted)]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <button
          type="button"
          disabled={scanning}
          onClick={() => void handlePhotoScan()}
          className="vauto-btn-primary mb-3 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm disabled:opacity-50"
        >
          {scanning ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
          Fotografuoti etiketę
        </button>

        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <Barcode className="h-5 w-5 shrink-0 text-primary" />
          <input
            type="text"
            inputMode="numeric"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="EAN / UPC / ISBN kodas"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            disabled={!manual.trim()}
            onClick={() => submitCode(manual)}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            OK
          </button>
        </div>

        {error && (
          <p className="mt-3 text-xs leading-relaxed text-amber-700" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
