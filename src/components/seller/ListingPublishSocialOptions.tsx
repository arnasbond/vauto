"use client";

import { Share2 } from "lucide-react";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { cn } from "@/lib/cn";

export function ListingPublishSocialOptions({ className }: { className?: string }) {
  const { listingSocialPublish, updateListingSocialPublish } = useSellerFlow();

  return (
    <section
      className={cn(
        "listing-social-publish rounded-2xl border border-[var(--vauto-border,#e5e7eb)] bg-[color-mix(in_srgb,var(--vauto-text-main,#111)_4%,transparent)] p-4",
        className
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-[var(--vauto-accent,#ff6b00)]" />
        <h3 className="text-sm font-semibold text-[var(--portal-text,var(--vauto-text-main,#111827))]">
          Automatinis dalijimasis socialiniuose tinkluose
        </h3>
      </div>
      <p className="mb-3 text-xs text-[var(--vauto-text-muted,#6b7280)]">
        Pasirinkite, kur dar automatiškai reklamuoti skelbimą po publikavimo.
      </p>
      <div className="space-y-2.5">
        <SocialCheckbox
          label="Automatiškai patalpinti į Facebook grupes (VAUTO partnerių tinklas)"
          checked={listingSocialPublish.facebookGroups}
          onChange={(facebookGroups) =>
            updateListingSocialPublish({ facebookGroups })
          }
        />
        <SocialCheckbox
          label="Sinchronizuoti su Anonser.lt skelbimų srautu"
          checked={listingSocialPublish.anonserLt}
          onChange={(anonserLt) => updateListingSocialPublish({ anonserLt })}
        />
        <SocialCheckbox
          label="Naudoti AI tekstų adaptaciją socialiniams tinklams"
          checked={listingSocialPublish.aiSocialAdaptation}
          onChange={(aiSocialAdaptation) =>
            updateListingSocialPublish({ aiSocialAdaptation })
          }
        />
      </div>
    </section>
  );
}

function SocialCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="listing-social-option flex cursor-pointer items-start gap-3 rounded-xl bg-[var(--vauto-card-bg,#fff)] px-3 py-2.5 ring-1 ring-[var(--vauto-border,#e5e7eb)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--vauto-accent,#ff6b00)]"
      />
      <span className="listing-social-option-label text-xs leading-snug text-[var(--portal-text,var(--vauto-text-main,#374151))]">
        {label}
      </span>
    </label>
  );
}
