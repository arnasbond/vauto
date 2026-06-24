function buildSellerContextualVoiceFollowUp(category, attributes, missingFields) {
  if (!missingFields.length) return null;

  if (category === "vehicles") {
    const filled = [];
    if (!missingFields.includes("make")) filled.push("markę");
    if (!missingFields.includes("model")) filled.push("modelį");
    const filledPhrase =
      filled.length === 2
        ? "markę ir modelį"
        : filled.length === 1
          ? filled[0]
          : null;

    const questions = [];
    if (missingFields.includes("year")) {
      questions.push("kokiais metais pagamintas jūsų automobilis");
    }
    if (missingFields.includes("price")) {
      questions.push("kokia būtų kaina");
    }
    if (missingFields.includes("make") && !filledPhrase?.includes("markę")) {
      questions.push("kokia automobilio markė");
    }
    if (missingFields.includes("model") && !filledPhrase?.includes("modelį")) {
      questions.push("koks modelis");
    }
    if (missingFields.includes("city")) {
      questions.push("kokiame mieste skelbiate");
    }

    if (filledPhrase && questions.length) {
      const q =
        questions[0].charAt(0).toUpperCase() +
        questions[0].slice(1) +
        (questions.length > 1 ? ` ir ${questions.slice(1).join(" ir ")}` : "");
      return `AI užpildė ${filledPhrase}. ${q}?`;
    }
  }

  return null;
}

module.exports = { buildSellerContextualVoiceFollowUp };
