"use client";

import { useState, useRef, useEffect } from "react";
import { Apple, Phone, Shield, X } from "lucide-react";
import type { AuthProvider, ProBusinessType, UserRole } from "@/lib/types";
import { ADMIN_EMAIL } from "@/lib/reports";
import { apiSendOtp, isAuthApiAvailable } from "@/lib/auth/api";
import {
  isGoogleAuthConfigured,
  requestGoogleIdToken,
} from "@/lib/auth/google-client";

type AuthStep = "methods" | "phone" | "otp" | "role" | "admin";

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
    businessType?: ProBusinessType;
    email?: string;
    otp?: string;
    idToken?: string;
    companyName?: string;
    companyCode?: string;
    vatCode?: string;
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

export function AuthModal({
  open,
  loading = false,
  error,
  onClearError,
  onClose,
  onComplete,
}: AuthModalProps) {
  const [step, setStep] = useState<AuthStep>("methods");
  const [phone, setPhone] = useState("+370 ");
  const [otp, setOtp] = useState("");
  const [role, setRole] = useState<UserRole>("private");
  const [businessType, setBusinessType] = useState<ProBusinessType>("general");
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [vatCode, setVatCode] = useState("");
  const [pendingProvider, setPendingProvider] = useState<AuthProvider>("google");
  const [adminEmail, setAdminEmail] = useState(ADMIN_EMAIL);
  const [otpSending, setOtpSending] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || step !== "methods" || !googleBtnRef.current) return;
    if (!isGoogleAuthConfigured()) return;
    void import("@/lib/auth/google-client").then(({ renderGoogleButton }) => {
      if (!googleBtnRef.current) return;
      void renderGoogleButton(googleBtnRef.current, (credential) => {
        setGoogleIdToken(credential);
        setPendingProvider("google");
        setStep("role");
      });
    });
  }, [open, step]);

  if (!open) return null;

  const finish = (provider: AuthProvider) => {
    onComplete({
      provider,
      phone: provider === "phone" ? phone : undefined,
      otp: provider === "phone" ? otp : undefined,
      idToken: provider === "google" ? googleIdToken ?? undefined : undefined,
      role,
      businessType: role === "pro" ? businessType : undefined,
      companyName: role === "pro" ? companyName.trim() || undefined : undefined,
      companyCode: role === "pro" ? companyCode.trim() || undefined : undefined,
      vatCode: role === "pro" ? vatCode.trim() || undefined : undefined,
    });
    setStep("methods");
    setOtp("");
    setGoogleIdToken(null);
  };

  const handleGoogle = async () => {
    onClearError?.();
    if (isGoogleAuthConfigured()) {
      const token = await requestGoogleIdToken();
      if (token) {
        setGoogleIdToken(token);
        setPendingProvider("google");
        setStep("role");
        return;
      }
    }
    setPendingProvider("google");
    setStep("role");
  };

  const sendOtp = async () => {
    setOtpError(null);
    onClearError?.();
    setOtpSending(true);
    try {
      if (isAuthApiAvailable()) {
        const res = await apiSendOtp(phone);
        if (!res.ok) {
          setOtpError(res.error);
          return;
        }
      }
      setStep("otp");
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = () => {
    onClearError?.();
    if (!otp.trim() || otp.length < 4) {
      setOtpError("Įveskite 6 skaitmenų kodą");
      return;
    }
    setPendingProvider("phone");
    setStep("role");
  };

  const displayError = error ?? otpError;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center">
      <div className="vauto-auth-modal w-full max-w-md rounded-t-3xl p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              {step === "role" ? "Pasirinkite paskyrą" : "Prisijungti prie Vauto"}
            </h2>
            <p className="mt-1 text-sm text-teal-200/70">
              {step === "methods" && "Saugus prisijungimas per 30 sek."}
              {step === "phone" && "Įveskite telefono numerį"}
              {step === "otp" && "Patvirtinkite SMS kodą"}
              {step === "role" && "Privatus pardavėjas arba verslas"}
              {step === "admin" && "Vauto moderatorių prieiga"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-white/10"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {displayError && (
          <p className="mb-4 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {displayError}
          </p>
        )}

        {step === "methods" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void handleGoogle()}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white py-3.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 disabled:opacity-60"
            >
              <GoogleIcon />
              Prisijungti su Google
            </button>
            {isGoogleAuthConfigured() && (
              <div ref={googleBtnRef} className="flex justify-center" />
            )}
            <button
              type="button"
              onClick={() => {
                onClearError?.();
                setPendingProvider("apple");
                setStep("role");
              }}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-black py-3.5 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-gray-900 disabled:opacity-60"
            >
              <Apple className="h-5 w-5" />
              Prisijungti su Apple
            </button>
            <button
              type="button"
              onClick={() => setStep("phone")}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[var(--vauto-teal)]/20 py-3.5 text-sm font-semibold text-[var(--vauto-teal)] ring-1 ring-[var(--vauto-teal)]/40 transition hover:bg-[var(--vauto-teal)]/30 disabled:opacity-60"
            >
              <Phone className="h-5 w-5" />
              Prisijungti su telefonu
            </button>
            {isAuthApiAvailable() ? (
              <p className="pt-2 text-center text-xs text-slate-500">
                OTP kodas siunčiamas per Vauto serverį
              </p>
            ) : (
              <p className="pt-2 text-center text-xs text-slate-500">
                Demo režimas: kodas <span className="font-mono text-teal-400">123456</span>
              </p>
            )}
            <button
              type="button"
              onClick={() => setStep("admin")}
              className="flex w-full items-center justify-center gap-2 pt-1 text-xs text-slate-500 hover:text-red-400"
            >
              <Shield className="h-3.5 w-3.5" />
              Vauto Control Center (admin)
            </button>
          </div>
        )}

        {step === "admin" && (
          <div className="space-y-4">
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="w-full rounded-2xl bg-white/10 px-4 py-3.5 text-white outline-none ring-1 ring-white/10 focus:ring-red-400"
              placeholder="admin@vauto.com"
            />
            <button
              type="button"
              onClick={async () => {
                if (adminEmail.trim().toLowerCase() !== ADMIN_EMAIL) return;
                const token = isGoogleAuthConfigured()
                  ? await requestGoogleIdToken()
                  : null;
                onComplete({
                  provider: "google",
                  role: "admin",
                  email: ADMIN_EMAIL,
                  idToken: token ?? undefined,
                });
                if (!isAuthApiAvailable() || token) {
                  setStep("methods");
                }
              }}
              disabled={adminEmail.trim().toLowerCase() !== ADMIN_EMAIL || loading}
              className="w-full rounded-2xl bg-red-600 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Prisijungti kaip admin
            </button>
            <button
              type="button"
              onClick={() => setStep("methods")}
              className="w-full text-center text-xs text-slate-500"
            >
              Grįžti
            </button>
          </div>
        )}

        {step === "phone" && (
          <div className="space-y-4">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-2xl bg-white/10 px-4 py-3.5 text-white outline-none ring-1 ring-white/10 focus:ring-[var(--vauto-teal)]"
              placeholder="+370 600 00000"
            />
            <button
              type="button"
              onClick={() => void sendOtp()}
              disabled={otpSending}
              className="w-full rounded-2xl bg-[var(--vauto-teal)] py-3.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {otpSending ? "Siunčiama…" : "Siųsti kodą"}
            </button>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-2xl bg-white/10 px-4 py-3.5 text-center font-mono text-2xl tracking-[0.4em] text-white outline-none ring-1 ring-white/10 focus:ring-[var(--vauto-teal)]"
              placeholder="••••••"
            />
            <button
              type="button"
              onClick={verifyOtp}
              className="w-full rounded-2xl bg-[var(--vauto-teal)] py-3.5 text-sm font-semibold text-white"
            >
              Patvirtinti
            </button>
          </div>
        )}

        {step === "role" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("private")}
                className={`rounded-2xl p-4 text-left transition ${
                  role === "private"
                    ? "bg-[var(--vauto-teal)]/25 ring-2 ring-[var(--vauto-teal)]"
                    : "bg-white/5 ring-1 ring-white/10"
                }`}
              >
                <p className="text-sm font-semibold text-white">Privatus</p>
                <p className="mt-1 text-xs text-slate-400">Paprasti skelbimai</p>
              </button>
              <button
                type="button"
                onClick={() => setRole("pro")}
                className={`rounded-2xl p-4 text-left transition ${
                  role === "pro"
                    ? "bg-[var(--vauto-orange)]/25 ring-2 ring-[var(--vauto-orange)]"
                    : "bg-white/5 ring-1 ring-white/10"
                }`}
              >
                <p className="text-sm font-semibold text-white">Pro Verslas</p>
                <p className="mt-1 text-xs text-slate-400">Analitika + piniginė</p>
              </button>
            </div>

            {role === "pro" && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-400">Verslo tipas</p>
                {(
                  [
                    ["dealer", "Auto salonas"],
                    ["services", "Paslaugų teikėjas"],
                    ["general", "Kitas verslas"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBusinessType(key)}
                    className={`w-full rounded-xl px-4 py-2.5 text-left text-sm ${
                      businessType === key
                        ? "bg-white/15 text-white"
                        : "bg-white/5 text-slate-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <div className="grid gap-2">
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Įmonės pavadinimas"
                    className="w-full rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-[var(--vauto-orange)]"
                  />
                  <input
                    type="text"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value)}
                    placeholder="Įmonės kodas"
                    className="w-full rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-[var(--vauto-orange)]"
                  />
                  <input
                    type="text"
                    value={vatCode}
                    onChange={(e) => setVatCode(e.target.value)}
                    placeholder="PVM kodas (nebūtina)"
                    className="w-full rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-[var(--vauto-orange)]"
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => finish(pendingProvider)}
              disabled={loading}
              className="w-full rounded-2xl bg-[var(--vauto-orange)] py-3.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Jungiamasi…" : "Pradėti naudoti Vauto"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
