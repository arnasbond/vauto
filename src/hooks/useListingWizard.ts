"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { apiVautoAgent } from "@/lib/api/client";
import { getPriceAdvice } from "@/lib/price-advisor";
import type { PriceAdvice } from "@/lib/price-advisor";
import type { AiExtractedListing } from "@/lib/types";
import {
  analyzeListingWizard,
  buildWizardAgentContext,
  type WizardQuickReply,
} from "@/lib/listing-wizard";
import {
  compactListingsForAgent,
  resolveAgentUserRole,
} from "@/lib/vauto-agent-client";

export interface WizardThreadMessage {
  role: "assistant" | "user";
  text: string;
}

export interface UseListingWizardOptions {
  draft: AiExtractedListing;
  userPrompt?: string | null;
  manualFallback?: boolean;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  onAttributeChange: (key: string, value: string | string[]) => void;
  onFocusVin?: () => void;
}

export function useListingWizard({
  draft,
  userPrompt,
  manualFallback = false,
  onUpdate,
  onAttributeChange,
  onFocusVin,
}: UseListingWizardOptions) {
  const { listings, user, isAuthenticated, openAuthModal } = useVauto();
  const kickedOff = useRef(false);
  const [thread, setThread] = useState<WizardThreadMessage[]>([]);
  const [agentEnhancement, setAgentEnhancement] = useState<string | null>(null);

  const priceAdvice: PriceAdvice | null = useMemo(
    () =>
      getPriceAdvice(
        {
          id: "draft",
          category: draft.category,
          location: draft.location,
          price: draft.price,
          priceLabel: draft.priceLabel,
          title: draft.title,
          tags: [],
          description: draft.description,
          attributes: draft.attributes ?? {},
        },
        listings
      ),
    [draft, listings]
  );

  const analysis = useMemo(
    () =>
      manualFallback
        ? {
            intro: "Užpildykime skelbimą kartu — paklausiu tik to, ko trūksta.",
            questions: [] as string[],
            quickReplies: [] as WizardQuickReply[],
            prompts: [] as import("@/lib/listing-wizard").WizardPromptKind[],
            missingFields: [] as string[],
          }
        : analyzeListingWizard(draft, {
            userCity: user.city,
            isAuthenticated,
            priceAdvice,
            userPrompt,
          }),
    [draft, user.city, isAuthenticated, priceAdvice, userPrompt, manualFallback]
  );

  const buddyMessage = useMemo(() => {
    const parts = [analysis.intro];
    if (analysis.questions.length) parts.push(...analysis.questions.slice(0, 2));
    if (agentEnhancement) parts.push(agentEnhancement);
    return parts.join(" ");
  }, [analysis, agentEnhancement]);

  useEffect(() => {
    if (manualFallback || kickedOff.current) return;
    kickedOff.current = true;

    const ctx = buildWizardAgentContext(draft, analysis, {
      isAuthenticated,
      userCity: user.city,
    });

    void apiVautoAgent({
      messages: [
        {
          role: "user",
          text: `Peržiūriu skelbimo juodraštį: „${draft.title}". Padėk man užbaigti vedlį ir užduok trūkstamus klausimus.`,
        },
      ],
      context: {
        userCity: user.city || "Lietuva",
        userRole: resolveAgentUserRole(user),
        contact: user.phone || "+370 612 34567",
        listings: compactListingsForAgent(listings),
        isAuthenticated,
        wizardMode: ctx.wizardMode,
        listingDraft: ctx.listingDraft,
        missingFields: ctx.missingFields,
        wizardPrompts: ctx.wizardPrompts,
      },
    })
      .then((res) => {
        if (res.ok && res.reply?.trim()) setAgentEnhancement(res.reply.trim());
      })
      .catch(() => {
        /* lokali analizė pakanka */
      });
  }, [manualFallback, draft, analysis, isAuthenticated, user, listings]);

  const handleWizardReply = useCallback(
    (reply: WizardQuickReply) => {
      setThread((prev) => [...prev, { role: "user", text: reply.label }]);

      if (reply.id === "auth-signup") {
        openAuthModal("/");
        return;
      }
      if (reply.id === "vin-yes") {
        onFocusVin?.();
        setThread((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "Puiku — įveskite VIN žemiau, ir Regitra duomenys užsipildys automatiškai.",
          },
        ]);
        return;
      }
      if (reply.id === "vin-skip") {
        setThread((prev) => [
          ...prev,
          { role: "assistant", text: "Gerai, VIN galėsite pridėti vėliau." },
        ]);
        return;
      }

      if (reply.patch) onUpdate(reply.patch);
      if (reply.attributePatch) {
        for (const [key, val] of Object.entries(reply.attributePatch)) {
          onAttributeChange(key, val);
        }
      }

      const ack =
        reply.id.startsWith("city-")
          ? `Puiku, miestas: ${reply.patch?.location ?? reply.label}.`
          : reply.id.startsWith("seller-")
            ? `Įrašiau: ${reply.label}.`
            : reply.id.startsWith("cond-")
              ? `Būklė: ${reply.label}.`
              : null;
      if (ack) {
        setThread((prev) => [...prev, { role: "assistant", text: ack }]);
      }
    },
    [onUpdate, onAttributeChange, openAuthModal, onFocusVin]
  );

  return {
    analysis,
    buddyMessage,
    thread,
    handleWizardReply,
    priceAdvice,
  };
}
