import {
  pickNativeChatMedia,
  type ChatMediaPickSource,
} from "@/lib/chat-composer-media";
import { prepareChatImagesForAgent } from "@/lib/prepare-chat-images-for-agent";
import { buddyMessageForAgentFailure } from "@/lib/voice-graceful";

export interface ChatPhotoUploadFlowDeps {
  requestMediaConsent: (run: () => void | Promise<void>) => void;
  sendAgentMessage: (
    text: string,
    options?: {
      pendingImageUrls?: string[];
      sessionImageUrls?: string[];
      documentImageUrls?: string[];
      fromSearchBar?: boolean;
      omitPriorListingDraft?: boolean;
      freshListingSession?: boolean;
      skipUserBubble?: boolean;
    }
  ) => Promise<unknown>;
  setOpen?: (open: boolean) => void;
  /** e.g. redirect /add → / before opening agent chat */
  navigateBeforeSend?: () => void | Promise<void>;
  text?: string;
  /** Hide wire/instruction text from the visible chat bubble (photos still show). */
  skipUserBubble?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onErrorMessage?: (message: string) => void;
  /** Clear stale myListings / prior draft titles for this upload. */
  freshListingSession?: boolean;
  /** camera = Fotografuoti, gallery = Nuotraukų galerija */
  source?: ChatMediaPickSource;
}

/** Native camera/gallery → compress → agent chat (Kelrodė routing for image-only). */
export function pickAndSendChatPhotos(deps: ChatPhotoUploadFlowDeps): void {
  deps.requestMediaConsent(() => {
    void (async () => {
      deps.onBusyChange?.(true);
      try {
        const picked = await pickNativeChatMedia(0, deps.source ?? "gallery");
        if (!picked.length) return;
        const { listingImageUrls, agentVisionUrls, suspectedDocumentUrls } =
          await prepareChatImagesForAgent(picked);
        if (!listingImageUrls.length && !agentVisionUrls.length) return;
        await deps.navigateBeforeSend?.();
        deps.setOpen?.(true);
        // Zero pre-filter: send ALL attached files (cars + tech passport) to Gemini.
        // Public gallery strip happens only after Vision on the server.
        const allWire = agentVisionUrls.length ? agentVisionUrls : listingImageUrls;
        await deps.sendAgentMessage(deps.text?.trim() ?? "", {
          sessionImageUrls: allWire,
          pendingImageUrls: allWire,
          ...(deps.skipUserBubble ? { skipUserBubble: true } : {}),
          ...(deps.freshListingSession
            ? { omitPriorListingDraft: true, freshListingSession: true }
            : {}),
          ...(suspectedDocumentUrls.length
            ? { documentImageUrls: suspectedDocumentUrls }
            : {}),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err ?? "");
        const friendly = buddyMessageForAgentFailure(msg, "network_error");
        deps.onErrorMessage?.(friendly);
        console.warn("[chat-photo-upload] failed gracefully:", msg);
      } finally {
        deps.onBusyChange?.(false);
      }
    })();
  });
}
