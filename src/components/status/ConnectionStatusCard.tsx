"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, Shield } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import {
  apiFetchHealthDetails,
  type ApiHealthDetails,
} from "@/lib/api/client";

const FEATURE_LABELS: Record<string, string> = {
  sms: "SMS OTP",
  googleOAuth: "Google prisijungimas",
  webPush: "Web Push",
  fcm: "Android FCM",
  jwt: "JWT sesijos",
  gemini: "Gemini AI",
  reportEmail: "El. paštas admin",
  stripe: "Stripe mokėjimai",
  stripeWebhook: "Stripe webhook",
  regitraPlateApi: "Regitra plate API",
  ltOpenData: "LT TA atviri duomenys",
  euVinOpenData: "ES VIN atviras dekoderis",
  vehicleLookup: "Transporto lookup",
  serviceLeads: "Paslaugų lead'ai",
};

export function ConnectionStatusCard() {
  const { apiActive } = useVauto();
  const [health, setHealth] = useState<ApiHealthDetails | null>(null);

  useEffect(() => {
    if (!apiActive) {
      setHealth(null);
      return;
    }
    void apiFetchHealthDetails().then((r) => {
      if (r.ok) setHealth(r.data);
    });
  }, [apiActive]);

  const live = apiActive && health?.ok && health.db === "connected";

  return (
    <section
      className="vauto-status-card rounded-2xl p-4"
      aria-label="Ryšio būsena"
      data-testid="connection-status"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            live ? "bg-emerald-500/20" : "bg-slate-600/30"
          }`}
        >
          {live ? (
            <Cloud className="h-5 w-5 text-emerald-400" />
          ) : (
            <CloudOff className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <div>
          <p className="vauto-text-heading text-sm font-semibold">
            {live ? "Live API" : "Demo režimas"}
          </p>
          <p className="vauto-text-subtle text-xs">
            {live
              ? "Duomenys sinchronizuojami su serveriu"
              : "Duomenys saugomi šiame įrenginyje"}
            {health?.readiness && live && (
              <span className="ml-1 font-medium text-emerald-500">
                · {health.readiness.score}/100
                {health.readiness.regitraMode === "opendata" ? " (LT atviri duomenys)" : ""}
              </span>
            )}
          </p>
        </div>
      </div>

      {health?.features && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {Object.entries(health.features).map(([key, enabled]) => (
            <li
              key={key}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                enabled ? "vauto-badge-success" : "vauto-badge-muted"
              }`}
            >
              <Shield className="h-3 w-3" />
              {FEATURE_LABELS[key] ?? key}
            </li>
          ))}
        </ul>
      )}

      {health?.embeddings && live && (
        <p
          className={`mt-3 text-[10px] ${
            health.embeddings.imageIndexed >= health.embeddings.textIndexed &&
            health.embeddings.textIndexed > 0
              ? "text-emerald-500"
              : "vauto-text-subtle"
          }`}
        >
          Paieškos indeksas: {health.embeddings.textIndexed} tekst. ·{" "}
          {health.embeddings.imageIndexed} vaizd. ·{" "}
          {health.embeddings.activeListings} aktyvūs skelbimai
          {health.embeddings.imageIndexed >= health.embeddings.textIndexed &&
          health.embeddings.textIndexed > 0
            ? " · sinchronizuota"
            : ""}
        </p>
      )}
    </section>
  );
}
