import { BrandButton } from "@/components/ui/BrandButton";

type DetailCtaStackProps = {
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  footnote?: string;
  className?: string;
};

/** Listing detail contact CTAs — presentational; wire tel/chat in Phase 3. */
export function DetailCtaStack({
  primaryLabel = "Rodyti telefono numerį",
  secondaryLabel = "Rašyti pardavėjui",
  onPrimary,
  onSecondary,
  footnote = "Saugūs mokėjimai ir pokalbiai per VAUTO",
  className = "",
}: DetailCtaStackProps) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      <BrandButton
        variant="primary"
        className="w-full rounded-xl py-3.5"
        onClick={onPrimary}
      >
        {primaryLabel}
      </BrandButton>
      <BrandButton
        variant="secondary"
        className="w-full rounded-xl py-3.5"
        onClick={onSecondary}
      >
        {secondaryLabel}
      </BrandButton>
      {footnote ? (
        <p className="text-center text-[11px] text-[var(--vauto-subtle)]">{footnote}</p>
      ) : null}
    </div>
  );
}
