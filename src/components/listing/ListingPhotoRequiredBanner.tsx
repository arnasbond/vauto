"use client";

interface ListingPhotoRequiredBannerProps {
  visible: boolean;
}

export function ListingPhotoRequiredBanner({ visible }: ListingPhotoRequiredBannerProps) {
  if (!visible) return null;
  return (
    <p
      className="listing-form-error mb-3 rounded-lg border px-3 py-2 text-sm font-medium"
      role="alert"
    >
      Prašome įkelti bent vieną nuotrauką
    </p>
  );
}
