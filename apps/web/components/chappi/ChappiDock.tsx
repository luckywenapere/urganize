'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Maximize2, MessageCircle, RotateCcw, X } from '@/components/icons';
import { useChappiStore } from '@/stores/useChappiStore';
import { ChappiConversation } from './ChappiConversation';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';

// When on, MobileNavBar's UrgAns tab replaces this dock's whole reason to
// exist below lg (the dock has no lg+ UI to begin with — the side rail owns
// that range).
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

// Open-state persistence — same SSR-safe pattern as TasksPanel's bucket
// state: initialize closed (stable first paint), hydrate in a mount effect.
const DOCK_OPEN_KEY = 'urganize.chappi.dock-open';
const DOCK_OPEN_VERSION = 1;
const isPersistedOpen = (value: unknown): value is boolean => typeof value === 'boolean';

type ChappiDockProps = {
  /** Opens the CreateReleaseModal owned by AppShell (the same instance the
   * topbar's "New rollout" button uses). */
  onNewRelease: () => void;
};

/**
 * Floating UrgAns dock — the Linear-"Ask Linear"-style bottom-right chat
 * surface for viewports BELOW lg (both pill and panel carry `lg:hidden`).
 * At lg+ the side rail (ChappiSidePanel, mounted app-wide by AppShell) owns
 * the assistant instead — URG-210 retired this dock's desktop role, which
 * also retired its old catalog-only `?chat=1` special-casing. Closed: an
 * "Ask UrgAns" launcher pill. Open: a fixed panel hosting ChappiConversation
 * in its compact `panel` variant.
 *
 * The conversation is the SAME global useChappiStore the /dashboard/urgans
 * page and the side rail read — expand mid-conversation and the full page
 * picks up the transcript. On that page the dock renders nothing (the page
 * IS the chat).
 *
 * Open state persists across navigation (the dock outlives route changes in
 * AppShell) and across reloads (localStorage). Ctrl/Cmd+J toggles the dock
 * below lg and the side rail at lg+. Deliberately NO Escape-to-close: the
 * assistant opens modals that close on Escape themselves; a panel handler
 * would double-fire and close both.
 *
 * Z-tiers: launcher z-50 (peer of the old pill); open panel z-[130] — above
 * the HelpMenu launcher (115), below TaskQuickCreateModal (170) and the
 * other modals (220), so anything the assistant opens stacks on top of the
 * panel.
 */
export function ChappiDock({ onNewRelease }: ChappiDockProps) {
  const router = useRouter();
  const pathname = usePathname();
  const messages = useChappiStore((state) => state.messages);
  const reset = useChappiStore((state) => state.reset);
  const [isOpen, setIsOpen] = useState(false);

  const setOpenPersisted = useCallback((next: boolean) => {
    setIsOpen(next);
    writePersistedState(DOCK_OPEN_KEY, DOCK_OPEN_VERSION, next);
  }, []);

  useEffect(() => {
    const persisted = readPersistedState(DOCK_OPEN_KEY, DOCK_OPEN_VERSION, isPersistedOpen);
    if (persisted !== null) {
      setIsOpen(persisted);
    }
  }, []);

  // Ctrl/Cmd+J toggle. preventDefault matters: Ctrl+J opens the downloads
  // panel in several browsers. No typing-target guard needed — modified
  // combos are safe to intercept from inputs.
  //
  // At lg+ this dock is CSS-hidden (the side rail owns the assistant there),
  // so the shortcut routes to the rail's store state instead — the listener
  // still runs even while the dock's own UI is hidden, so the shortcut
  // isn't lost on desktop.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        const desktop =
          typeof window !== 'undefined' &&
          !window.matchMedia('(max-width: 1023px)').matches;
        if (desktop) {
          const { railOpen, setRailOpen } = useChappiStore.getState();
          setRailOpen(!railOpen);
          return;
        }
        if (MOBILE_NAV_ENABLED) {
          // The dock's own panel doesn't render below lg when the bar is on
          // (see the early return above) — go straight to the full page
          // instead of toggling UI that no longer exists.
          router.push('/dashboard/urgans');
          return;
        }
        setIsOpen((current) => {
          const next = !current;
          writePersistedState(DOCK_OPEN_KEY, DOCK_OPEN_VERSION, next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  // The assistant page IS the chat — a floating duplicate of the same
  // conversation there is redundant. Open state is preserved for when the
  // user navigates back to a workspace page.
  if (pathname === '/dashboard/urgans') return null;

  // MobileNavBar's UrgAns tab is the below-lg entry point now; the dock never
  // had an lg+ UI, so it has nothing left to render. Persisted open state is
  // simply ignored (not migrated) — flip the flag off and it resumes exactly
  // as it was.
  if (MOBILE_NAV_ENABLED) return null;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setOpenPersisted(true)}
        aria-label="Ask UrgAns"
        className="group fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full border border-stroke-default bg-bg-elevated py-2.5 pl-3.5 pr-4 shadow-2xl transition-all duration-150 hover:border-stroke-strong hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:bottom-6 md:right-6 lg:hidden"
      >
        <MessageCircle className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-content-tertiary group-hover:text-content-primary">
          Ask UrgAns
        </span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="UrgAns assistant"
      // chappi-dock-panel is a hook for globals.css's keyboard-aware block:
      // `fixed` anchors to the LAYOUT viewport, whose bottom sits behind the
      // on-screen keyboard on iOS, so the panel needs lifting and shortening
      // while the keyboard is up. Same fix the assistant page's column gets.
      className="chappi-dock-panel fixed bottom-5 right-5 z-[130] flex h-[560px] max-h-[calc(100vh-6rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden urg-cartouche rounded-2xl border border-stroke-default bg-bg-surface shadow-2xl md:bottom-6 md:right-6 lg:hidden"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stroke-subtle px-3 py-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          UrgAns
        </p>
        <div className="flex items-center gap-1">
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={reset}
              aria-label="New conversation"
              title="New conversation"
              className="motion-focus motion-press grid h-7 w-7 place-items-center text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              // The page and the panel share one conversation, so expanding
              // is a pure navigation — the transcript follows.
              setOpenPersisted(false);
              router.push('/dashboard/urgans');
            }}
            aria-label="Open UrgAns full page"
            title="Open full page"
            className="motion-focus motion-press grid h-7 w-7 place-items-center text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setOpenPersisted(false)}
            aria-label="Close UrgAns"
            title="Close"
            className="motion-focus motion-press grid h-7 w-7 place-items-center text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-3 pb-3 pt-2">
        <ChappiConversation variant="panel" onNewRelease={onNewRelease} />
      </div>
    </div>
  );
}
