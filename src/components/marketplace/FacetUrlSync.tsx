"use client";

import { useHydrateFacetUrl } from "@/hooks/useCanonicalFacetUrl";

/** Single mount: hydrates 13B facet URL into search state. */
export function FacetUrlSync() {
  useHydrateFacetUrl();
  return null;
}
