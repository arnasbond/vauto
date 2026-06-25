export function scrollToListingResults() {
  window.requestAnimationFrame(() => {
    document
      .getElementById("listing-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/** Scroll to top assistant banner when search returns zero matches */
export function scrollToSearchEmptyAssistant() {
  window.requestAnimationFrame(() => {
    const banner = document.getElementById("search-empty-assistant");
    if (banner) {
      banner.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

export function focusSearchOutcome(resultCount: number) {
  if (resultCount > 0) {
    scrollToListingResults();
  } else {
    scrollToSearchEmptyAssistant();
  }
}
