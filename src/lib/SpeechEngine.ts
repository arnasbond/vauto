/**
 * Dynamic Locale Orchestrator — locks STT/TTS to native Lithuanian voices (no EN fallback).
 */

export const DEFAULT_LOCALE = "lt-LT";

/** Locked for the active voice session — no mid-session locale switching. */
let sessionLocaleLock: string | null = null;

let voicesReadyPromise: Promise<SpeechSynthesisVoice[]> | null = null;

const LT_VOICE_NAME_PRIORITY = [
  /google.*lietuv/i,
  /lietuv/i,
  /lithuanian/i,
  /microsoft.*liet/i,
  /com\.apple\.vocalizer.*lt/i,
];

function normalizeLangTag(lang: string): string {
  return lang.trim().toLowerCase().replace(/_/g, "-");
}

function isLithuanianLang(lang: string): boolean {
  const n = normalizeLangTag(lang);
  return n === "lt" || n === "lt-lt" || n.startsWith("lt-");
}

/** Score Lithuanian voices — prefer named LT engines over generic system default. */
export function selectBestVoice(lang: string = DEFAULT_LOCALE): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !window.speechSynthesis) return undefined;

  const target = normalizeLangTag(lang);
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return undefined;

  const ltVoices = voices.filter((v) => {
    const vLang = normalizeLangTag(v.lang);
    if (target.startsWith("lt")) return vLang.startsWith("lt");
    return vLang === target || vLang.startsWith(`${target.split("-")[0]}-`);
  });

  if (!ltVoices.length) return undefined;

  for (const pattern of LT_VOICE_NAME_PRIORITY) {
    const named = ltVoices.find((v) => pattern.test(v.name));
    if (named) return named;
  }

  const exact = ltVoices.find((v) => normalizeLangTag(v.lang) === "lt-lt");
  if (exact) return exact;

  const local = ltVoices.find((v) => v.localService);
  if (local) return local;

  return ltVoices[0];
}

export function hasLocaleVoice(lang: string = DEFAULT_LOCALE): boolean {
  return Boolean(selectBestVoice(lang));
}

/** @deprecated Use hasLocaleVoice — kept for imports. */
export function hasLithuanianVoice(): boolean {
  return hasLocaleVoice(DEFAULT_LOCALE);
}

/** @deprecated Use selectBestVoice — kept for imports. */
export function pickLithuanianVoice(): SpeechSynthesisVoice | undefined {
  return selectBestVoice(getLockedLocale());
}

export function ensureSpeechVoicesReady(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.resolve([]);
  }

  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  if (voicesReadyPromise) return voicesReadyPromise;

  voicesReadyPromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(window.speechSynthesis.getVoices());
    };

    window.speechSynthesis.onvoiceschanged = finish;
    window.setTimeout(finish, 800);
  });

  return voicesReadyPromise;
}

/** Lock locale at voice session start — prevents mid-session language drift. */
export function lockSessionLocale(lang: string = DEFAULT_LOCALE): string {
  sessionLocaleLock = isLithuanianLang(lang) ? DEFAULT_LOCALE : lang;
  return sessionLocaleLock;
}

export function getLockedLocale(): string {
  return sessionLocaleLock ?? DEFAULT_LOCALE;
}

export function clearSessionLocaleLock(): void {
  sessionLocaleLock = null;
}

/** Infer locale from first STT hypothesis (defaults to locked LT). */
export function detectSpokenLocale(transcript?: string): string {
  const sample = transcript?.trim() ?? "";
  if (!sample) return getLockedLocale();

  if (/[ąčęėįšųūž]/i.test(sample)) return lockSessionLocale(DEFAULT_LOCALE);
  if (
    /\b(noriu|ieškau|ieskau|parduodu|parduod|batai|suknel|labas|drabuž|drabuz|spinta|kaina|dydis)\b/i.test(
      sample
    )
  ) {
    return lockSessionLocale(DEFAULT_LOCALE);
  }

  return getLockedLocale();
}

/** Web Speech STT lang attribute — always matches session lock. */
export function getLockedSttLang(): string {
  return getLockedLocale();
}

export interface LocaleUtteranceOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
}

/** Apply locked voice profile to utterance — never leaves voice unset for LT. */
export function applyLocaleToUtterance(
  utterance: SpeechSynthesisUtterance,
  options: LocaleUtteranceOptions = {}
): SpeechSynthesisUtterance {
  const lang = options.lang ?? getLockedLocale();
  utterance.lang = lang;

  const voice = selectBestVoice(lang);
  if (voice) {
    utterance.voice = voice;
  }

  utterance.rate = options.rate ?? 0.9;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 1;

  return utterance;
}

export function createLocaleUtterance(
  text: string,
  options: LocaleUtteranceOptions = {}
): SpeechSynthesisUtterance | null {
  const clean = text.trim();
  if (!clean || typeof window === "undefined" || !window.speechSynthesis) return null;

  if (!selectBestVoice(options.lang ?? getLockedLocale())) return null;

  return applyLocaleToUtterance(new SpeechSynthesisUtterance(clean), options);
}

export interface SpeakLocaleOptions extends LocaleUtteranceOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

/** Speak with locked Lithuanian voice — no English engine fallback. */
export function speakWithLocale(
  text: string,
  options: SpeakLocaleOptions = {}
): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;

  window.speechSynthesis.cancel();

  const utterance = createLocaleUtterance(text, options);
  if (!utterance) return null;

  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = (e) => options.onError?.(e.error);

  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopLocaleSpeech(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  void ensureSpeechVoicesReady();
}
