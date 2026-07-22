import { pickNativeChatMedia } from "@/lib/chat-composer-media";
import { prepareChatImagesForAgent } from "@/lib/prepare-chat-images-for-agent";

export interface ChatPhotoUploadFlowDeps {
  requestMediaConsent: (run: () => void | Promise<void>) => void;
  sendAgentMessage: (
    text: string,
    options?: {
      pendingImageUrls?: string[];
      sessionImageUrls?: string[];
      documentImageUrls?: string[];
      fromSearchBar?: boolean;
    }
  ) => Promise<unknown>;
  setOpen?: (open: boolean) => void;
  /** e.g. redirect /add → / before opening agent chat */
  navigateBeforeSend?: () => void | Promise<void>;
  text?: string;
  onBusyChange?: (busy: boolean) => void;
}

/** Native OS picker → compress → agent chat (Kelrodė routing for image-only). */
export function pickAndSendChatPhotos(deps: ChatPhotoUploadFlowDeps): void {
  if (deps.onBusyChange) {
    /* caller may guard busy state */
  }
  deps.requestMediaConsent(async () => {
    deps.onBusyChange?.(true);
    try {
      const picked = await pickNativeChatMedia(0);
      if (!picked.length) return;
      const { listingImageUrls, agentVisionUrls, suspectedDocumentUrls } =
        await prepareChatImagesForAgent(picked);
      if (!listingImageUrls.length && !agentVisionUrls.length) return;
      await deps.navigateBeforeSend?.();
      deps.setOpen?.(true);
      // Full gallery stays on the client; stream gets vision subset (docs high-res).
      await deps.sendAgentMessage(deps.text?.trim() ?? "", {
        sessionImageUrls: listingImageUrls,
        pendingImageUrls: agentVisionUrls.length
          ? agentVisionUrls
          : listingImageUrls.slice(0, 6),
        ...(suspectedDocumentUrls.length
          ? { documentImageUrls: suspectedDocumentUrls }
          : {}),
      });
    } finally {
      deps.onBusyChange?.(false);
    }
  });
}
