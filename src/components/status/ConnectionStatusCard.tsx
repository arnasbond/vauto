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
      className="rounded-2xl border border-white/10 bg-white/5 p-4"
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
          <p className="text-sm font-semibold text-white">
            {live ? "Live API" : "Demo režimas"}
          </p>
          <p className="text-xs text-slate-400">
            {live
              ? "Duomenys sinchronizuojami su serveriu"
              : "Duomenys saugomi šiame įrenginyje"}
          </p>
        </div>
      </div>

      {health?.features && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {Object.entries(health.features).map(([key, enabled]) => (
            <li
              key={key}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                enabled
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-slate-700/50 text-slate-500"
              }`}
            >
              <Shield className="h-3 w-3" />
              {FEATURE_LABELS[key] ?? key}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
