"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Context label for console diagnostics */
  label?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * S0 — isolates seller/agent wizard render failures from the full app tree.
 * Prevents NativeErrorBoundary "Programėlė sustojo" for recoverable UI errors.
 */
export class SafeAgentActionBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[VAUTO SafeAgentActionBoundary]",
      this.props.label ?? "agent-flow",
      error,
      info.componentStack
    );
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        className="mx-4 my-6 rounded-2xl border border-amber-500/40 bg-amber-950/40 px-5 py-6 text-center shadow-lg"
        role="alert"
      >
        <p className="text-sm font-semibold text-amber-100">
          Nepavyko atvaizduoti AI vedlio
        </p>
        <p className="mt-2 text-xs leading-relaxed text-amber-200/80">
          Įvyko laikina klaida rodant formą. Jūsų duomenys neištrinti — galite bandyti
          dar kartą arba tęsti pokalbį su asistentu.
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="mt-4 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-amber-500"
        >
          Bandyti dar kartą
        </button>
      </div>
    );
  }
}
