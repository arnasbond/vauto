"use client";

import { useState, useRef, useEffect } from "react";
import { Apple, Building2, LayoutGrid, Phone, Shield, UserRound, X } from "lucide-react";
import type { AuthProvider, UserRole } from "@/lib/types";
import type { AuthSignupIntent } from "@/context/AuthContext";
import { ADMIN_EMAIL, ADMIN_PHONE } from "@/lib/reports";
import { apiSendOtp, isAuthApiAvailable } from "@/lib/auth/api";
import {
  isGoogleAuthConfigured,
  requestGoogleIdToken,
} from "@/lib/auth/google-client";
import { isAppleAuthConfigured } from "@/lib/auth/apple-client";
import { isNativeAuthEnvironment } from "@/lib/auth/oauth-redirect";
import { blockNativeClickThrough } from "@/lib/native-click-guard";
import { formatLtPhoneInput, normalizeLtPhoneForApi } from "@/lib/phone-input";
import {
  isQaTestModeActive,
  qaTestCredentialsSummary,
  QA_DEMO_OTP,
} from "@/lib/qa-test-mode";
import {
  REMEMBER_ME_KEY,
  REMEMBER_PHONE_KEY,
} from "@/lib/auth/session-constants";

type AuthStep = "methods" | "phone" | "otp" | "admin";

const AUTH_FORM_INITIAL = {
  step: "methods" as AuthStep,
  phone: "+370 ",
  otp: "",
  role: "private" as UserRole,
  signupIntent: "private" as AuthSignupIntent,
  adminEmail: ADMIN_EMAIL,
  otpError: null as string | null,
  googleIdToken: null as string | null,
};

const SMS_COOLDOWN_SECONDS = 60;

interface AuthModalProps {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onClearError?: () => void;
  onClose: () => void;
  onComplete: (data: {
    provider: AuthProvider;
    phone?: string;
    role: UserRole;
    email?: string;
    otp?: string;
    idToken?: string;
    signupIntent?: AuthSignupIntent;
  }) => void;
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

const inputClass =
  "w-full rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-4 py-3.5 text-[var(--vauto-text-main)] outline-none placeholder:text-[var(--vauto-text-muted)] focus:border-[var(--vauto-primary)] focus:ring-2 focus:ring-[var(--vauto-primary)]/20";

export function AuthModal({
  open,
  loading = false,
  error,
  onClearError,
  onClose,
  onComplete,
}: AuthModalProps) {
  const [step, setStep] = useState<AuthStep>(AUTH_FORM_INITIAL.step);
  const [phone, setPhone] = useState(AUTH_FORM_INITIAL.phone);
  const [otp, setOtp] = useState(AUTH_FORM_INITIAL.otp);
  const [role, setRole] = useState<UserRole>(AUTH_FORM_INITIAL.role);
  const [signupIntent, setSignupIntent] = useState<AuthSignupIntent>(
    AUTH_FORM_INITIAL.signupIntent
  );
  const [adminEmail, setAdminEmail] = useState(AUTH_FORM_INITIAL.adminEmail);
  const [otpSending, setOtpSending] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(AUTH_FORM_INITIAL.otpError);
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(
    AUTH_FORM_INITIAL.googleIdToken
  );
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [rememberMe, setRememberMe] = useState(true);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const showQaBanner = isQaTestModeActive();

  const loadRememberedPhone = () => {
    if (typeof window === "undefined") return AUTH_FORM_INITIAL.phone;
    try {
      const savedRemember = localStorage.getItem(REMEMBER_ME_KEY);
      if (savedRemember === "0") return AUTH_FORM_INITIAL.phone;
      const savedPhone = localStorage.getItem(REMEMBER_PHONE_KEY);
      if (savedPhone) return formatLtPhoneInput(savedPhone);
    } catch {
      /* ignore */
    }
    return AUTH_FORM_INITIAL.phone;
  };

  const persistRememberedPhone = (value: string) => {
    if (typeof window === "undefined" || !rememberMe) return;
    try {
      localStorage.setItem(REMEMBER_ME_KEY, "1");
      localStorage.setItem(REMEMBER_PHONE_KEY, normalizeLtPhoneForApi(value));
    } catch {
      /* ignore */
    }
  };

  const resetAuthForm = () => {
    setStep(AUTH_FORM_INITIAL.step);
    setPhone(AUTH_FORM_INITIAL.phone);
    setOtp(AUTH_FORM_INITIAL.otp);
    setRole(AUTH_FORM_INITIAL.role);
    setSignupIntent(AUTH_FORM_INITIAL.signupIntent);
    setAdminEmail(AUTH_FORM_INITIAL.adminEmail);
    setOtpError(AUTH_FORM_INITIAL.otpError);
    setGoogleIdToken(AUTH_FORM_INITIAL.googleIdToken);
    setSmsCooldown(0);
  };

  useEffect(() => {
    if (smsCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setSmsCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [smsCooldown]);

  useEffect(() => {
    if (open) {
      setStep(AUTH_FORM_INITIAL.step);
      setOtp(AUTH_FORM_INITIAL.otp);
      setRole(AUTH_FORM_INITIAL.role);
      setSignupIntent(AUTH_FORM_INITIAL.signupIntent);
      setAdminEmail(AUTH_FORM_INITIAL.adminEmail);
      setOtpError(AUTH_FORM_INITIAL.otpError);
      setGoogleIdToken(AUTH_FORM_INITIAL.googleIdToken);
      setSmsCooldown(0);
      setPhone(loadRememberedPhone());
      try {
        setRememberMe(localStorage.getItem(REMEMBER_ME_KEY) !== "0");
      } catch {
        setRememberMe(true);
      }
      return;
    }
    resetAuthForm();
  }, [open]);

  useEffect(() => {
    if (!open || step !== "methods" || !googleBtnRef.current) return;
    if (!isGoogleAuthConfigured()) return;
    if (isNativeAuthEnvironment()) return;
    void import("@/lib/auth/google-client").then(({ renderGoogleButton }) => {
      if (!googleBtnRef.current) return;
      void renderGoogleButton(googleBtnRef.current, (credential) => {
        setGoogleIdToken(credential);
        onClearError?.();
        onComplete({
          provider: "google",
          role: "private",
          idToken: credential,
          signupIntent,
        });
      });
    });
  }, [open, step, onComplete, onClearError, signupIntent]);

  if (!open) return null;

  const finish = (provider: AuthProvider) => {
    onClearError?.();
    onComplete({
      provider,
      phone: provider === "phone" ? normalizeLtPhoneForApi(phone) : undefined,
      otp: provider === "phone" ? otp : undefined,
      idToken: provider === "google" ? googleIdToken ?? undefined : undefined,
      role: role === "admin" ? "admin" : "private",
      email: role === "admin" ? ADMIN_EMAIL : undefined,
      signupIntent: role === "admin" ? undefined : signupIntent,
    });
  };

  const handleGoogle = async () => {
    onClearError?.();
    if (isNativeAuthEnvironment()) {
      setOtpError(
        "Programėlėje saugiausias būdas — prisijungti su telefonu (SMS). Google WebView gali sudrebinti sistemą."
      );
      setStep("phone");
      return;
    }
    if (isAuthApiAvailable() && !isGoogleAuthConfigured()) {
      setOtpError(
        "Google prisijungimas dar neaktyvuotas serveryje. Naudokite telefoną arba admin OTP."
      );
      return;
    }
    if (isGoogleAuthConfigured()) {
      const token = await requestGoogleIdToken();
      if (token) {
        onComplete({ provider: "google", role: "private", idToken: token, signupIntent });
        return;
      }
      if (isAuthApiAvailable()) {
        setOtpError("Nepavyko gauti Google patvirtinimo. Bandykite dar kartą.");
        return;
      }
    }
    if (!isAuthApiAvailable()) {
      onComplete({ provider: "google", role: "private", signupIntent });
    }
  };

  const sendOtp = async () => {
    if (smsCooldown > 0) return;
    setOtpError(null);
    onClearError?.();
    setOtpSending(true);
    try {
      if (isAuthApiAvailable()) {
        const res = await apiSendOtp(normalizeLtPhoneForApi(phone));
        if (!res.ok) {
          setOtpError(res.error);
          return;
        }
      }
      setSmsCooldown(SMS_COOLDOWN_SECONDS);
      setStep("otp");
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = () => {
    onClearError?.();
    if (!otp.trim() || otp.length !== 6) {
      setOtpError("Įveskite 6 skaitmenų kodą");
      return;
    }
    blockNativeClickThrough();
    persistRememberedPhone(phone);
    finish("phone");
  };

  const displayError = error ?? otpError;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-foreground/40 backdrop-blur-sm sm:items-center"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="vauto-auth-modal w-full max-w-md rounded-t-3xl p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--vauto-text-heading)]">
              Prisijungti prie VAUTO
            </h2>
            <p className="mt-1 text-sm text-[var(--vauto-text-muted)]">
              {step === "methods" && "Saugus prisijungimas per 30 sek."}
              {step === "phone" && "Įveskite telefono numerį"}
              {step === "otp" && "Patvirtinkite SMS kodą"}
              {step === "admin" && "VAUTO moderatorių prieiga"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--vauto-text-muted)] hover:bg-[var(--vauto-surface-muted)]"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {showQaBanner && (
          <div className="vauto-qa-test-banner mb-4 rounded-xl px-3 py-2.5 text-xs font-medium leading-relaxed">
            {qaTestCredentialsSummary()}
          </div>
        )}

        {displayError && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {displayError}
          </p>
        )}

        {step === "methods" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)] p-1">
              <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-main)]">
                Paskyros tipas
              </p>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ["private", "Privatus", UserRound],
                    ["pro", "Verslas PRO", Building2],
                    ["wardrobe", "Asortimentas", LayoutGrid],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSignupIntent(key)}
                    className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[10px] font-semibold transition ${
                      signupIntent === key
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-card hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleGoogle()}
              disabled={loading || (isAuthApiAvailable() && !isGoogleAuthConfigured())}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] py-3.5 text-sm font-semibold text-[var(--vauto-text-main)] transition hover:bg-[var(--vauto-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GoogleIcon />
              Prisijungti su Google
            </button>

            {isAuthApiAvailable() && !isGoogleAuthConfigured() && (
              <p className="text-center text-[10px] text-[var(--vauto-text-muted)]">
                Google prisijungimas netrukus — naudokite telefono numerį.
              </p>
            )}

            {isGoogleAuthConfigured() && !isNativeAuthEnvironment() && (
              <div ref={googleBtnRef} className="flex justify-center" />
            )}

            {isNativeAuthEnvironment() && (
              <p className="text-center text-[11px] leading-relaxed text-[var(--vauto-text-muted)]">
                Google prisijungimas programėlėje laikinai išjungtas. Naudokite{" "}
                <span className="font-medium text-[var(--vauto-primary)]">telefono numerį</span>{" "}
                žemiau.
              </p>
            )}

            {isAppleAuthConfigured() ? (
              <button
                type="button"
                onClick={() => {
                  onClearError?.();
                  onComplete({ provider: "apple", role: "private", signupIntent });
                }}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-foreground py-3.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
              >
                <Apple className="h-5 w-5" />
                Prisijungti su Apple
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center gap-3 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)] py-3.5 text-sm font-semibold text-[var(--vauto-text-muted)]"
              >
                <Apple className="h-5 w-5" />
                Apple (netrukus)
              </button>
            )}

            <button
              type="button"
              onClick={() => setStep("phone")}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[var(--vauto-primary)] py-3.5 text-sm font-semibold text-[var(--vauto-primary-contrast,#fff)] transition hover:opacity-95 disabled:opacity-60"
            >
              <Phone className="h-5 w-5" />
              Prisijungti su telefonu
            </button>

            {isAuthApiAvailable() ? (
              <p className="pt-2 text-center text-xs text-[var(--vauto-text-muted)]">
                OTP kodas siunčiamas per VAUTO serverį
              </p>
            ) : (
              <p className="pt-2 text-center text-xs text-[var(--vauto-text-muted)]">
                Demo režimas: kodas{" "}
                <span className="font-mono font-semibold text-[var(--vauto-primary)]">
                  {QA_DEMO_OTP}
                </span>
              </p>
            )}

            <button
              type="button"
              onClick={() => setStep("admin")}
              className="flex w-full items-center justify-center gap-2 pt-1 text-xs text-[var(--vauto-text-muted)] hover:text-red-600"
            >
              <Shield className="h-3.5 w-3.5" />
              VAUTO Control Center (admin)
            </button>
          </div>
        )}

        {step === "admin" && (
          <div className="space-y-4">
            <input
              type="email"
              name="username"
              autoComplete="username"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className={inputClass}
              placeholder="admin@vauto.com"
            />
            {isGoogleAuthConfigured() ? (
              <button
                type="button"
                onClick={async () => {
                  if (adminEmail.trim().toLowerCase() !== ADMIN_EMAIL) return;
                  const token = await requestGoogleIdToken();
                  if (!token && isAuthApiAvailable()) {
                    setOtpError("Nepavyko gauti Google patvirtinimo.");
                    return;
                  }
                  onComplete({
                    provider: "google",
                    role: "admin",
                    email: ADMIN_EMAIL,
                    idToken: token ?? undefined,
                  });
                }}
                disabled={adminEmail.trim().toLowerCase() !== ADMIN_EMAIL || loading}
                className="w-full rounded-2xl bg-red-600 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Prisijungti su Google (admin)
              </button>
            ) : (
              <>
                <p className="text-xs text-[var(--vauto-text-muted)]">
                  Google OAuth neaktyvus — naudokite admin telefoną{" "}
                  <span className="font-mono font-semibold text-[var(--vauto-text-main)]">
                    {ADMIN_PHONE}
                  </span>{" "}
                  ir demo OTP{" "}
                  <span className="font-mono font-semibold text-[var(--vauto-text-main)]">
                    {QA_DEMO_OTP}
                  </span>
                  .
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (adminEmail.trim().toLowerCase() !== ADMIN_EMAIL) return;
                    setPhone(formatLtPhoneInput(ADMIN_PHONE));
                    setRole("admin");
                    setStep("phone");
                  }}
                  disabled={adminEmail.trim().toLowerCase() !== ADMIN_EMAIL || loading}
                  className="w-full rounded-2xl bg-red-600 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Tęsti su admin telefonu
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setStep("methods")}
              className="w-full text-center text-xs text-[var(--vauto-text-muted)]"
            >
              Grįžti
            </button>
          </div>
        )}

        {step === "phone" && (
          <form
            className="space-y-4"
            autoComplete="on"
            onSubmit={(e) => {
              e.preventDefault();
              void sendOtp();
            }}
          >
            <input
              type="tel"
              name="tel"
              id="vauto-auth-phone"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(formatLtPhoneInput(e.target.value))}
              className={inputClass}
              placeholder="+370 600 00000"
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--vauto-text-main)]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRememberMe(checked);
                  try {
                    localStorage.setItem(REMEMBER_ME_KEY, checked ? "1" : "0");
                    if (!checked) localStorage.removeItem(REMEMBER_PHONE_KEY);
                  } catch {
                    /* ignore */
                  }
                }}
                className="h-4 w-4 rounded border-[var(--vauto-border)] accent-[var(--vauto-primary)]"
              />
              Prisiminti mane (įrenginio autofill)
            </label>
            <button
              type="submit"
              disabled={otpSending || smsCooldown > 0}
              className="w-full rounded-2xl bg-[var(--vauto-primary)] py-3.5 text-sm font-semibold text-[var(--vauto-primary-contrast,#fff)] disabled:opacity-60"
            >
              {otpSending
                ? "Siunčiama…"
                : smsCooldown > 0
                  ? `Siųsti kodą (${smsCooldown}s)`
                  : "Siųsti kodą"}
            </button>
            <button
              type="button"
              onClick={() => setStep("methods")}
              className="w-full text-center text-xs text-[var(--vauto-text-muted)]"
            >
              Grįžti
            </button>
          </form>
        )}

        {step === "otp" && (
          <form
            className="space-y-4"
            autoComplete="on"
            onSubmit={(e) => {
              e.preventDefault();
              verifyOtp();
            }}
          >
            <input
              type="text"
              name="one-time-code"
              id="vauto-auth-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
              placeholder="••••••"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-[var(--vauto-primary)] py-3.5 text-sm font-semibold text-[var(--vauto-primary-contrast,#fff)] disabled:opacity-60"
            >
              {loading ? "Jungiamasi…" : "Patvirtinti ir prisijungti"}
            </button>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="w-full text-center text-xs text-[var(--vauto-text-muted)]"
            >
              Grįžti
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
