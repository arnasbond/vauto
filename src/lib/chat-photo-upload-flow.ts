import { pickNativeChatMedia } from "@/lib/chat-composer-media";

export interface ChatPhotoUploadFlowDeps {
  requestMediaConsent: (run: () => void | Promise<void>) => void;
  sendAgentMessage: (
    text: string,
    options?: { pendingImageUrls?: string[]; fromSearchBar?: boolean }
  ) => Promise<unknown>;
  setOpen?: (open: boolean) => void;
  /** e.g. redirect /add → / before opening agent chat */
  navigateBeforeSend?: () => void | Promise<void>;
  text?: string;
  onBusyChange?: (busy: boolean) => void;
}

/** Native OS picker → agent chat with optional text (Kelrodė routing for image-only). */
export function pickAndSendChatPhotos(deps: ChatPhotoUploadFlowDeps): void {
  if (deps.onBusyChange) {
    /* caller may guard busy state */
  }
  deps.requestMediaConsent(async () => {
    deps.onBusyChange?.(true);
    try {
      const picked = await pickNativeChatMedia(0);
      if (!picked.length) return;
      await deps.navigateBeforeSend?.();
      deps.setOpen?.(true);
      await deps.sendAgentMessage(deps.text?.trim() ?? "", {
        pendingImageUrls: picked,
      });
    } finally {
      deps.onBusyChange?.(false);
    }
  });
}
