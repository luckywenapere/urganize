'use client';

import { Component, type ReactNode } from 'react';
import { unstable_rethrow, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

// The error page's code is only needed after a crash, and app/error.tsx is
// already its own chunk for Next's root boundary; a static import here would
// copy it into the frame's first load.
const AppError = dynamic(() => import('@/app/error'), { ssr: false });

/**
 * The route error page (app/error.tsx), inside the workspace chrome.
 *
 * The chrome is mounted by the /dashboard and /settings layouts now (URG-314
 * batch 7), so Next's root error boundary sits OUTSIDE it: a crashed page would
 * take the top bar and side menu with it. This boundary sits where the root one
 * used to (inside <main>, around the page) and shows the same AppError, so a
 * crash still costs the user their page and not their way out of it.
 *
 * Not a segment error.tsx on purpose: a dashboard/error.tsx made every
 * dashboard page without its own loading.tsx wait on that file's code while the
 * server rendered it, and the waiting page fell back to the brand mark in the
 * server HTML (verified against a build, 2026-10-16).
 *
 * Next's own redirect / not-found signals are rethrown, so they still reach the
 * boundaries that handle them. Like Next's boundary, it clears itself when the
 * page changes.
 */
type Props = { children: ReactNode; pathname: string | null };
type State = { error: (Error & { digest?: string }) | null; pathname: string | null };

class Boundary extends Component<Props, State> {
  state: State = { error: null, pathname: this.props.pathname };

  static getDerivedStateFromError(error: Error): Partial<State> {
    unstable_rethrow(error);
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.pathname !== state.pathname) {
      return { pathname: props.pathname, error: null };
    }
    return null;
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return <AppError error={this.state.error} reset={this.reset} />;
    return this.props.children;
  }
}

export function WorkspacePageErrorBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <Boundary pathname={pathname}>{children}</Boundary>;
}
