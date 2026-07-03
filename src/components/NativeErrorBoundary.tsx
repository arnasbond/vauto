"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { SITE_URL } from "@/lib/site-url";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  reloading: boolean;
}

export class NativeErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, reloading: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[VAUTO ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ reloading: true });
    window.location.reload();
  };

  handleOpenWeb = () => {
    window.location.href = `${SITE_URL}/`;
  };

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;

    const native =
      typeof window !== "undefined" && Capacitor.isNativePlatform();

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0b0f17] px-6 text-center text-white">
        <p className="text-lg font-semibold text-[#00BFA5]">VAUTO</p>
        <h1 className="mt-4 text-xl font-bold">Programėlė sustojo</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
          {native
            ? "Dažniausia priežastis — prisijungimo langas arba WebView atmintis. Perkraukite programėlę; duomenys neištrinami."
            : "Įvyko netikėta klaida. Perkraukite puslapį."}
        </p>
        <button
          type="button"
          disabled={reloading}
          onClick={this.handleReload}
          className="mt-8 rounded-2xl bg-[#00BFA5] px-8 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {reloading ? "Perkraunama…" : "Perkrauti programėlę"}
        </button>
        {native && (
          <button
            type="button"
            onClick={this.handleOpenWeb}
            className="mt-3 text-sm text-slate-400 underline"
          >
            Atidaryti www.vauto.lt naršyklėje
          </button>
        )}
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
