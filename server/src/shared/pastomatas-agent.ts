import {
  buildLockerPrompt,
  buildParcelLabelBubble,
  buildRecipientPrompt,
  createPastomatasFlow,
  generateSimulatedParcelCode,
  parseRecipientLine,
  type PastomatasFlowState,
  type PastomatasLockerOption,
} from "./pastomatas-chat-flow.js";

/** Synthetic lockers per city — same contract as client shipping-routing. */
export function lockersForCity(city: string): PastomatasLockerOption[] {
  const c = city.trim() || "Vilnius";
  return [1, 2, 3, 4, 5].map((i) => ({
    id: `omniva-${c.toLowerCase().replace(/\s+/g, "-")}-${i}`,
    name: `Omniva ${c} #${i}`,
    address: `${c} g. ${10 + i * 3}`,
    city: c,
  }));
}

export function startPastomatasGuide(city: string): {
  state: PastomatasFlowState;
  reply: string;
} {
  const state = createPastomatasFlow(city, "simulated");
  const lockers = lockersForCity(state.city);
  return {
    state,
    reply: buildLockerPrompt(state.city, lockers),
  };
}

export function advancePastomatasGuide(
  state: PastomatasFlowState,
  userText: string
): { state: PastomatasFlowState; reply: string; done?: boolean } {
  const lockers = lockersForCity(state.city);

  if (state.step === "choose_locker") {
    const n = Number.parseInt(userText.trim(), 10);
    let picked =
      Number.isFinite(n) && n >= 1 && n <= lockers.length
        ? lockers[n - 1]
        : lockers.find((l) =>
            l.name.toLowerCase().includes(userText.trim().toLowerCase())
          );
    if (!picked) picked = lockers[0];
    const next: PastomatasFlowState = {
      ...state,
      step: "collect_recipient",
      lockerId: picked!.id,
      lockerName: picked!.name,
    };
    return { state: next, reply: buildRecipientPrompt(picked!.name) };
  }

  if (state.step === "collect_recipient") {
    const parsed = parseRecipientLine(userText);
    if (!parsed) {
      return {
        state,
        reply:
          "Nepavyko nuskaityti gavėjo. Parašykite pvz.: „Jonas +37061234567“.",
      };
    }
    const code = generateSimulatedParcelCode();
    const next: PastomatasFlowState = {
      ...state,
      step: "label_ready",
      recipientName: parsed.name,
      recipientPhone: parsed.phone,
      parcelCode: code,
    };
    return {
      state: next,
      done: true,
      reply: buildParcelLabelBubble({
        lockerName: next.lockerName || "Paštomatas",
        recipientName: parsed.name,
        recipientPhone: parsed.phone,
        parcelCode: code,
        shippingMode: next.shippingMode,
      }),
    };
  }

  return {
    state,
    reply: "Siuntos vedimas jau baigtas. Jei reikia naujo lipduko — parašykite „paštomatas“.",
  };
}
