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
  Search,
  Wallet,
} from "lucide-react";
import { Badge, Card } from "@/design-system";
import {
  apiAdminBillingLookup,
  apiAdminCreditWallet,
  apiFetchHealthDetails,
  apiFetchPlatformFlags,
  apiUpdatePlatformFlags,
  type AdminBillingLookup,
  type ApiHealthDetails,
  type ApiPlatformFlags,
} from "@/lib/api/client";

type StatusTone = "ok" | "warn" | "off";

function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  const badgeTone =
    tone === "ok" ? "success" : tone === "warn" ? "warning" : "neutral";
  return <Badge tone={badgeTone}>{label}</Badge>;
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
    <Card
      variant={ok ? "default" : "warning"}
      className="flex items-center gap-3 py-3"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ds-radius-control)] ${
          ok
            ? "bg-[var(--ds-success-soft)] text-[var(--ds-success)]"
            : "bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--ds-text-primary)]">
          {title}
        </p>
        <p className="truncate text-xs text-[var(--ds-text-muted)]">{detail}</p>
      </div>
      <StatusPill tone={toneFromOk(ok)} label={ok ? "Operatyvus" : "Įspėjimas"} />
    </Card>
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
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<AdminBillingLookup | null>(null);
  const [creditBusy, setCreditBusy] = useState(false);

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

  const runBillingLookup = async () => {
    const q = lookupQuery.trim();
    if (!q) return;
    setLookupBusy(true);
    setLookupError(null);
    try {
      const opts = q.includes("@")
        ? { email: q }
        : { userId: q };
      const res = await apiAdminBillingLookup(opts);
      if (!res.ok) {
        setLookup(null);
        setLookupError(res.error || "Nerasta");
        return;
      }
      setLookup(res.data);
    } finally {
      setLookupBusy(false);
    }
  };

  const creditFromLookup = async () => {
    if (!lookup?.user.id || creditBusy) return;
    const raw = window.prompt(
      `Kreditas piniginėje ${lookup.user.name} (${lookup.user.id})\nSuma €:`,
      "5"
    );
    if (raw == null) return;
    const amount = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("Neteisinga suma");
      return;
    }
    setCreditBusy(true);
    try {
      const res = await apiAdminCreditWallet({
        userId: lookup.user.id,
        amount,
        reason: "Ops panel credit",
      });
      if (!res.ok) {
        window.alert(res.error || "Nepavyko");
        return;
      }
      window.alert(
        `Įskaityta +${amount.toFixed(2)} €. Balansas: ${res.data.walletBalance.toFixed(2)} €`
      );
      void runBillingLookup();
    } finally {
      setCreditBusy(false);
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

      <div className="vauto-dashboard-card rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-semibold text-slate-900">Mokėjimų paieška</h3>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Ieškokite pagal el. paštą arba user id — Stripe session / sąskaitos + piniginės
          kreditas.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runBillingLookup();
            }}
            placeholder="arnasbond@gmail.com arba user-…"
            className="vauto-admin-input min-w-[220px] flex-1 rounded-xl border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void runBillingLookup()}
            disabled={lookupBusy || !lookupQuery.trim()}
            className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {lookupBusy ? "Ieškoma…" : "Ieškoti"}
          </button>
        </div>
        {lookupError ? (
          <p className="mt-2 text-xs text-red-600">{lookupError}</p>
        ) : null}
        {lookup ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">{lookup.user.name}</p>
              <p>ID: {lookup.user.id}</p>
              <p>Email: {lookup.user.email || "—"}</p>
              <p>
                Piniginė:{" "}
                <span className="font-semibold">
                  {(lookup.user.walletBalance ?? 0).toFixed(2)} €
                </span>
              </p>
              <p>
                Stripe customer:{" "}
                {lookup.stripeCustomerId ? (
                  <a
                    href={`https://dashboard.stripe.com/customers/${lookup.stripeCustomerId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-700 underline"
                  >
                    {lookup.stripeCustomerId}
                  </a>
                ) : (
                  "—"
                )}
              </p>
              <button
                type="button"
                onClick={() => void creditFromLookup()}
                disabled={creditBusy}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                <Wallet className="h-3.5 w-3.5" />
                {creditBusy ? "Įskaitoma…" : "Kreditas / refund"}
              </button>
            </div>
            {lookup.invoices.length === 0 ? (
              <p className="text-xs text-slate-500">Sąskaitų nerasta.</p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto">
                {lookup.invoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] text-slate-600"
                  >
                    <p className="font-semibold text-slate-900">
                      {inv.number || inv.id} · {inv.kind} ·{" "}
                      {Number(inv.amountGross).toFixed(2)} €
                    </p>
                    <p>{new Date(inv.createdAt).toLocaleString("lt-LT")}</p>
                    {inv.stripeSessionId ? (
                      <p className="truncate">
                        Session:{" "}
                        <a
                          href={`https://dashboard.stripe.com/payments/${inv.stripeSessionId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-700 underline"
                        >
                          {inv.stripeSessionId}
                        </a>
                      </p>
                    ) : null}
                    {inv.listingId ? <p>Listing: {inv.listingId}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
        Skundai → tab <span className="font-semibold text-slate-700">Pranešimai</span>
        {" · "}
        Skelbimai → tab <span className="font-semibold text-slate-700">Skelbimai</span>
      </p>
    </div>
  );
}
