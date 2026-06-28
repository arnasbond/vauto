import { cancelActiveVoiceSearch, recycleSpeechRecognitionEngine } from "@/lib/voice-search";
import { clearSessionLocaleLock, stopLocaleSpeech } from "@/lib/SpeechEngine";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";

/** Complete mic + TTS queue teardown after AI-driven UI mutation. */
export async function completeVoiceTeardown(): Promise<void> {
  cancelActiveVoiceSearch();
  stopLocaleSpeech();
  clearSessionLocaleLock();
  await recycleSpeechRecognitionEngine();
}

export function isUiDrivingAgentAction(action: VautoAgentAction): boolean {
  switch (action.type) {
    case "apply_ui_filters":
    case "navigate_to_screen":
    case "search":
    case "empty_search":
    case "navigate":
    case "zero_ui_screen":
      return true;
    default:
      return false;
  }
}
