"use client";

import { useEffect, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { apiFetchHealthDetails } from "@/lib/api/client";
import {
  deriveFeatureClaims,
  type FeatureClaim,
} from "@/lib/feature-readiness";

export function useFeatureReadiness(): {
  claims: FeatureClaim[];
  loading: boolean;
  live: boolean;
} {
  const { apiActive } = useVauto();
  const [claims, setClaims] = useState<FeatureClaim[]>(() =>
    deriveFeatureClaims(null, apiActive)
  );
  const [loading, setLoading] = useState(apiActive);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!apiActive) {
      setClaims(deriveFeatureClaims(null, false));
      setLive(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    void apiFetchHealthDetails().then((r) => {
      const health = r.ok ? r.data : null;
      const isLive = Boolean(health?.ok && health.db === "connected");
      setLive(isLive);
      setClaims(deriveFeatureClaims(health, apiActive));
      setLoading(false);
    });
  }, [apiActive]);

  return { claims, loading, live };
}
