"use client";

interface ListingValidationBannerProps {
  issues: string[];
  className?: string;
}

/** Shown above the publish CTA when the draft is not ready — never inside the button label. */
export function ListingValidationBanner({ issues, className = "" }: ListingValidationBannerProps) {
  if (!issues.length) return null;

  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-left ${className}`}
    >
      <p className="mb-1 text-xs font-semibold text-red-800">Prieš publikuojant:</p>
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-red-700">
        {issues.slice(0, 6).map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </div>
  );
}

export const LISTING_PUBLISH_CTA = "Įkelti skelbimą";
