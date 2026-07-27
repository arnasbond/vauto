"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Database,
  MessageSquare,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  CreditCard,
  Bell,
} from "lucide-react";
import {
  apiFetchHealthDetails,
  apiFetchPlatformFlags,
  apiUpdatePlatformFlags,
  type ApiHealthDetails,
  type ApiPlatformFlags,
} from "@/lib/api/client";

type StatusTone = "ok" | "warn" | "off";

function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "warn"
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-100 text-slate-500";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function toneFromOk(ok: boolean): StatusTone {
  return ok ? "ok" : "warn";
}

function StatusRow({
  icon: Icon,
  title,
  detail,
  ok,
}: {
  icon: typeof Database;
  title: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div className="vauto-dashboard-card flex items-center gap-3 rounded-2xl p-3.5">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          ok
            ? "bg-[color-mix(in_srgb,var(--vauto-teal)_15%,transparent)] text-[var(--vauto-teal)]"
            : "bg-amber-50 text-amber-700"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="truncate text-xs text-slate-500">{detail}</p>
      </div>
      <StatusPill tone={toneFromOk(ok)} label={ok ? "OK" : "DĖMESIO"} />
    </div>
  );
}

function KillSwitchRow({
  title,
  description,
  enabled,
  busy,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onToggle(!enabled)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          enabled ? "bg-red-600" : "bg-slate-200"
        } disabled:opacity-50`}
        aria-pressed={enabled}
        aria-label={title}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
            enabled ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

const EMPTY_FLAGS: ApiPlatformFlags = {
  maintenanceMode: false,
  disableNewListings: false,
  disableCheckout: false,
};

export function AdminOpsPanel() {
  const [health, setHealth] = useState<ApiHealthDetails | null>(null);
  const [flags, setFlags] = useState<ApiPlatformFlags>(EMPTY_FLAGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const [healthRes, flagsRes] = await Promise.all([
      apiFetchHealthDetails(),
      apiFetchPlatformFlags(),
    ]);
    if (healthRes.ok) {
      setHealth(healthRes.data);
      const infra = healthRes.data.infra;
      if (infra) {
        setFlags((prev) => ({
          maintenanceMode: infra.maintenanceMode ?? prev.maintenanceMode,
          disableNewListings: infra.disableNewListings ?? prev.disableNewListings,
          disableCheckout: infra.disableCheckout ?? prev.disableCheckout,
        }));
      }
    } else {
      setError(healthRes.error);
    }
    if (flagsRes.ok) {
      setFlags({
        maintenanceMode: flagsRes.data.maintenanceMode,
        disableNewListings: flagsRes.data.disableNewListings,
        disableCheckout: flagsRes.data.disableCheckout,
      });
      setError(null);
    } else if (!healthRes.ok) {
      setError(flagsRes.error || healthRes.error);
    }
    setUpdatedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const updateFlag = async (
    key: keyof ApiPlatformFlags,
    next: boolean,
    confirmLabel: string
  ) => {
    if (next && !window.confirm(`${confirmLabel}\n\nAr tikrai norite įjungti?`)) {
      return;
    }
    if (!next && !window.confirm(`Išjungti: ${confirmLabel}?`)) {
      return;
    }
    setBusyKey(key);
    try {
      const res = await apiUpdatePlatformFlags({ [key]: next });
      if (res.ok) {
        setFlags({
          maintenanceMode: res.data.maintenanceMode,
          disableNewListings: res.data.disableNewListings,
          disableCheckout: res.data.disableCheckout,
        });
      } else {
        window.alert(res.error || "Nepavyko atnaujinti nustatymo");
      }
    } finally {
      setBusyKey(null);
      void refresh();
    }
  };

  const dbOk = health?.db === "connected" && health?.ok === true;
  const smsOk = Boolean(health?.features?.sms);
  const smsMode =
    typeof (health as { smsMode?: string } | null)?.smsMode === "string"
      ? (health as { smsMode?: string }).smsMode
      : smsOk
        ? "live"
        : "demo";
  const stripeOk = Boolean(health?.features?.stripe && health?.infra?.stripeConfigured !== false);
  const webPushOk = Boolean(health?.features?.webPush);
  const fcmOk = Boolean(health?.features?.fcm);
  const geminiOk = Boolean(health?.features?.gemini || health?.infra?.geminiConfigured);
  const readiness = health?.readiness?.score ?? 0;
  const warnings = health?.infra?.warnings ?? [];

  return (
    <div className="space-y-4 px-4 pb-8 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Sistemos būsena</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Live sveikata · atnaujinama kas 15 s
            {updatedAt
              ? ` · ${updatedAt.toLocaleTimeString("lt-LT")}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atnaujinti
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <StatusRow
          icon={Database}
          title="Duomenų bazė"
          detail={health?.db === "connected" ? "Prisijungta" : health?.db ?? "Tikrinama…"}
          ok={dbOk}
        />
        <StatusRow
          icon={MessageSquare}
          title="SMS"
          detail={`Režimas: ${smsMode ?? "—"}`}
          ok={smsOk}
        />
        <StatusRow
          icon={CreditCard}
          title="Stripe"
          detail={
            health?.features?.stripeWebhook
              ? "Mokėjimai + webhook"
              : health?.features?.stripe
                ? "Raktas yra, webhook trūksta"
                : "Nesukonfigūruota"
          }
          ok={stripeOk && Boolean(health?.features?.stripeWebhook)}
        />
        <StatusRow
          icon={Bell}
          title="Web Push"
          detail={webPushOk ? "VAPID aktyvus" : "VAPID nerastas"}
          ok={webPushOk}
        />
        <StatusRow
          icon={Radio}
          title="FCM"
          detail={fcmOk ? "Firebase aktyvus" : "Service account nerastas"}
          ok={fcmOk}
        />
        <StatusRow
          icon={Sparkles}
          title="Gemini"
          detail={geminiOk ? "AI raktas aktyvus" : "AI raktas nerastas"}
          ok={geminiOk}
        />
        <div className="vauto-dashboard-card flex items-center gap-3 rounded-2xl p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Activity className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Pasirengimas</p>
            <p className="text-xs text-slate-500">Bendras infrastruktūros balas</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              readiness >= 80
                ? "bg-emerald-100 text-emerald-800"
                : readiness >= 50
                  ? "bg-amber-100 text-amber-900"
                  : "bg-red-100 text-red-800"
            }`}
          >
            {readiness}%
          </span>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="vauto-dashboard-card rounded-2xl p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-900">Įspėjimai</h3>
          </div>
          <ul className="space-y-1.5">
            {warnings.map((w) => (
              <li key={w} className="text-xs leading-relaxed text-slate-600">
                · {w}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="vauto-dashboard-card rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-red-600" />
          <h3 className="text-sm font-semibold text-slate-900">Avarinis režimas</h3>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Kill switch&apos;ai — tik administratoriui. Pakeitimai įsigalioja iškart.
        </p>
        <div className="space-y-2">
          <KillSwitchRow
            title="Techninė priežiūra"
            description="Blokuoja naujus skelbimus ir mokėjimus (503)."
            enabled={flags.maintenanceMode}
            busy={busyKey === "maintenanceMode"}
            onToggle={(next) =>
              void updateFlag("maintenanceMode", next, "Techninė priežiūra")
            }
          />
          <KillSwitchRow
            title="Stabdyti naujus skelbimus"
            description="Leidžia naršyti, bet nekurti naujų skelbimų."
            enabled={flags.disableNewListings}
            busy={busyKey === "disableNewListings"}
            onToggle={(next) =>
              void updateFlag("disableNewListings", next, "Stabdyti naujus skelbimus")
            }
          />
          <KillSwitchRow
            title="Stabdyti mokėjimus"
            description="Blokuoja subscribe, promote ir escrow checkout."
            enabled={flags.disableCheckout}
            busy={busyKey === "disableCheckout"}
            onToggle={(next) =>
              void updateFlag("disableCheckout", next, "Stabdyti mokėjimus")
            }
          />
        </div>
      </div>

      <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
        Skundai → tab <span className="font-semibold text-slate-700">Pranešimai</span>
        {" · "}
        Skelbimai → tab <span className="font-semibold text-slate-700">Skelbimai</span>
      </p>
    </div>
  );
}
