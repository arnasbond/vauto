"use client";

import { Shield, X } from "lucide-react";

interface GdprConsentModalProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function GdprConsentModal({
  open,
  onAccept,
  onDecline,
}: GdprConsentModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="vauto-auth-modal w-full max-w-md rounded-t-3xl p-6 sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--vauto-teal)]/20">
            <Shield className="h-5 w-5 text-[var(--vauto-teal)]" />
          </div>
          <button
            type="button"
            onClick={onDecline}
            className="text-slate-400"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 className="text-lg font-semibold text-white">Privatumo sutikimas</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          VAUTO naudoja jūsų balsą ir vaizdą tik skelbimo turinio analizei pagal
          BDAR reikalavimus. Duomenys apdorojami įrenginyje arba saugiai perduodami
          AI analizei ir nėra naudojami reklamai.
        </p>
        <p className="mt-3 rounded-xl bg-[var(--vauto-orange)]/10 px-3 py-2.5 text-sm leading-relaxed text-orange-100 ring-1 ring-[var(--vauto-orange)]/20">
          VAUTO fone analizuoja tik raktažodį &ldquo;Vauto&rdquo; ir jokių kitų jūsų pokalbių
          neįrašinėja. Budintis režimas reikalauja nuolatinės mikrofono prieigos.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Galite bet kada atšaukti sutikimą profilio nustatymuose.
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 rounded-2xl bg-white/10 py-3 text-sm font-medium text-slate-300"
          >
            Atmesti
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-2xl bg-[var(--vauto-teal)] py-3 text-sm font-semibold text-white"
          >
            Sutinku
          </button>
        </div>
      </div>
    </div>
  );
}
