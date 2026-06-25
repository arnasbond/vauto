"use client";

import { useEffect, useRef } from "react";
import { useVauto } from "@/context/VautoContext";
import { focusSearchOutcome } from "@/lib/search-results-focus";

/** Automatiškai slinkti prie rezultatų arba tuščio asistento bloko */
export function SearchResultsFocus() {
  const { searchQuery, rankedListings, searchLoading } = useVauto();
  const prevCountRef = useRef(-1);
  const prevQueryRef = useRef("");

  useEffect(() => {
    if (searchQuery.trim() !== prevQueryRef.current) {
      prevCountRef.current = -1;
      prevQueryRef.current = searchQuery.trim();
    }
  }, [searchQuery]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (searchLoading || q.length < 3) return;
    if (prevCountRef.current === rankedListings.length && prevCountRef.current >= 0) return;

    const timer = window.setTimeout(() => {
      focusSearchOutcome(rankedListings.length);
      prevCountRef.current = rankedListings.length;
    }, 80);

    return () => window.clearTimeout(timer);
  }, [searchQuery, rankedListings.length, searchLoading]);

  return null;
}
