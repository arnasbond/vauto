"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { wipeNativeAppStorage } from "@/lib/native-recovery";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  resetting: boolean;
}

export class NativeErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetting: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, resetting: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[VAUTO ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ resetting: true });
    void wipeNativeAppStorage().finally(() => {
      window.location.href = "/";
    });
  };

  render() {
    const { error, resetting } = this.state;
    if (!error) return this.props.children;

    const native =
      typeof window !== "undefined" && Capacitor.isNativePlatform();

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0b0f17] px-6 text-center text-white">
        <p className="text-lg font-semibold text-[#00BFA5]">Vauto</p>
        <h1 className="mt-4 text-xl font-bold">Programėlė sustojo</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
          {native
            ? "Dažniausia priežastis — sugadinti vietiniai duomenys arba atminties trūkumas (Samsung Fold). Atstatykite programėlę."
            : "Įvyko netikėta klaida. Perkraukite puslapį."}
        </p>
        <button
          type="button"
          disabled={resetting}
          onClick={this.handleReset}
          className="mt-8 rounded-2xl bg-[#00BFA5] px-8 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {resetting ? "Atstatoma…" : "Atstatyti programėlę"}
        </button>
        {!native && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 text-sm text-slate-500 underline"
          >
            Perkrauti
          </button>
        )}
      </div>
    );
  }
}
