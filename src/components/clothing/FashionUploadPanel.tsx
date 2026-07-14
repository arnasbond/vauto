"use client";

import { Barcode, Camera, PenLine, Sparkles } from "lucide-react";
import { useRef, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { AiModeBadge } from "@/components/AiModeBadge";
import { BarcodeScanSheet } from "@/components/product/BarcodeScanSheet";
import { useBarcodeScanFlow } from "@/hooks/useBarcodeScanFlow";
import { executeConductorRoute, conductorPhotoUploadSource } from "@/lib/vauto-conductor";
import { pickAndSendChatPhotos } from "@/lib/chat-photo-upload-flow";

export function FashionUploadPanel() {
  const {
    sellerStep,
    requestMediaConsent,
    requireAuthForListing,
  } = useVauto();
  const { sendAgentMessage, applyAgentActions, busy: agentBusy, setOpen } =
    useVautoAgent();
  const router = useRouter();
  const pathname = usePathname();
  const navigateToAgentHome = useCallback(() => {
    const normalized = (pathname || "/").replace(/\/$/, "") || "/";
    if (normalized === "/add") router.push("/");
  }, [pathname, router]);
  const { applyScannedBarcode } = useBarcodeScanFlow();
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
  const barcodePhotoContextRef = useRef<string[]>([]);

  const busy = (sellerStep !== "idle" && sellerStep !== "published") || agentBusy;

  const openPhotoUpload = () => {
    if (busy) return;
    void executeConductorRoute({
      ...conductorPhotoUploadSource("FashionUploadPanel"),
      payload: { photoCount: 1, wardrobe: true },
    });
    pickAndSendChatPhotos({
      requestMediaConsent,
      sendAgentMessage,
      setOpen,
      navigateBeforeSend: navigateToAgentHome,
      onBusyChange: setPhotoSubmitting,
    });
  };

  const openBarcodeFlow = () => {
    if (busy) return;
    if (!requireAuthForListing("/add?vertical=fashion")) return;
    setBarcodeOpen(true);
  };

  return (
    <>
      <div className={`seller-upload-panel fashion-upload-desktop${busy ? " pointer-events-none opacity-50" : ""}`}>
        <button
          type="button"
          onClick={openBarcodeFlow}
          disabled={busy}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#7c3aed] bg-[#faf5ff] py-3.5 text-sm font-bold text-[#6d28d9] shadow-sm disabled:opacity-50 md:mb-0"
        >
          <Barcode className="h-5 w-5" />
          Skenuoti brūkšninį kodą nuo etiketės
        </button>

        <button
          type="button"
          onClick={openPhotoUpload}
          disabled={busy || photoSubmitting}
          className="seller-upload-primary-btn upload-primary mb-3 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold shadow-sm disabled:opacity-50"
        >
          <Camera className="h-5 w-5" />
          Įkelti nuotraukas (Spinta AI)
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!requireAuthForListing("/add?vertical=fashion")) return;
            setOpen(true);
            void sendAgentMessage("Padėk užpildyti drabužio skelbimą ranka", {
              fromSearchBar: true,
            }).then((res) => {
              if (res.actions && res.actions.type !== "none") applyAgentActions(res.actions);
            });
          }}
          className="seller-upload-manual-btn mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 py-3.5 text-sm font-bold shadow-sm disabled:opacity-50 md:mb-0"
        >
          <PenLine className="h-5 w-5" />
          Užpildyti ranka
        </button>

        <p className="upload-primary text-center text-sm text-[var(--vauto-text-muted)] md:col-span-2">
          <Sparkles className="mr-1 inline h-4 w-4 text-[var(--vauto-primary)]" />
          Nuskenuokite etiketės kodą — AI užpildys prekės ženklą ir paruoš stilingą aprašymą.
        </p>
        <div className="upload-primary mt-3 flex justify-center">
          <AiModeBadge />
        </div>
      </div>

      <BarcodeScanSheet
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onBarcodeResolved={(code) =>
          void applyScannedBarcode(code, {
            fashion: true,
            pendingImageUrls: barcodePhotoContextRef.current,
          })
        }
        title="Skenuoti brūkšninį kodą nuo etiketės"
        subtitle="Kvepalai, kosmetika, drabužiai, avalynė — nufotografuokite brūkšninį kodą arba įveskite ranka."
      />
    </>
  );
}
