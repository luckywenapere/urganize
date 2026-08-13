'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  /** What is being guarded. Appears in the console warning and the analytics
   * event, so make it identifiable at a glance ("urgans-rail", not "panel"). */
  name: string;
  /** Rendered in place of the children after a crash. Defaults to nothing,
   * which is the right answer for a non-essential widget: it goes quiet rather
   * than taking the page with it. */
  fallback?: ReactNode;
  onError?: (error: Error, name: string) => void;
};

type ErrorBoundaryState = { hasError: boolean };

/**
 * A boundary for client subtrees that Next's route-level `error.tsx` cannot
 * reach.
 *
 * `app/error.tsx` covers the page — but it renders INSIDE the root layout, so
 * anything the root layout mounts alongside `<main>` (the UrgAns dock and rail,
 * the identity card) is outside its protection. A throw in one of those used to
 * escape all the way to `global-error.tsx`, replacing the entire application
 * with a full-page failure because a floating widget broke. This converts that
 * into the widget quietly disappearing.
 *
 * Hand-rolled rather than adding `react-error-boundary`: a class component with
 * one lifecycle method is the whole feature, and the boring-stack rule says do
 * not take a dependency for that.
 *
 * IMPORTANT: this renders `children` directly and wraps them in no element. The
 * rail and identity card are flex children of a row in AppShell — an extra
 * `<div>` here would silently break that layout.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console first and unconditionally: whatever the reporting path does, the
    // stack has to reach the developer looking at the browser console.
    console.error(`[error-boundary:${this.props.name}]`, error, info.componentStack);
    // A throw in the reporter itself must not escape this boundary — that would
    // unmount the very thing meant to contain the damage.
    try {
      this.props.onError?.(error, this.props.name);
    } catch {
      // Ignore.
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
