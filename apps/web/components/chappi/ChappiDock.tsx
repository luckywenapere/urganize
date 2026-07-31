'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Maximize2, MessageCircle, RotateCcw, X } from 'lucide-react';
import { useChappiStore } from '@/stores/useChappiStore';
import { useChatPanel } from '@/components/workspace/useChatPanel';
import { ChappiBetaBadge } from './ChappiBetaBadge';
import { ChappiConversation } from './ChappiConversation';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { isNativePlatform } from '@/lib/platform';
import { openExternalUrl } from '@/lib/external-link';

// Direct line to the founder — same number SupportChat uses. When the Chappi
// flag is on, the standalone WhatsApp pill is replaced by this dock and the
// human-support entry lives in the panel footer instead (AI-first front door,
// human fallback one tap deeper).
const WHATSAPP_URL = 'https://wa.me/2347067367057';

// Open-state persistence — same SSR-safe pattern as TasksPanel's bucket
// state: initialize closed (stable first paint), hydrate in a mount effect.
const DOCK_OPEN_KEY = 'urganize.chappi.dock-open';
const DOCK_OPEN_VERSION = 1;
const isPersistedOpen = (value: unknown): value is boolean => typeof value === 'boolean';

type ChappiDockProps = {
  /** Opens the CreateReleaseModal owned by AppShell (the same instance the
   * topbar's "New release" button uses). */
  onNewRelease: () => void;
};

/**
 * Floating Chappi dock — the Linear-"Ask Linear"-style bottom-right chat
 * surface, mounted app-wide by AppShell so the assistant is one click away
 * without leaving the current page. Closed: an "Ask Chappi" launcher pill
 * (the corner SupportChat's WhatsApp pill occupied — that link now lives in
 * this panel's footer). Open: a fixed panel hosting ChappiConversation in
 * its compact `panel` variant.
 *
 * The conversation is the SAME global useChappiStore the /dashboard/chappi
 * page reads — expand mid-conversation and the full page picks up the
 * transcript. On that page the dock renders nothing (the page IS the chat).
 *
 * Open state persists across navigation (the dock outlives route changes in
 * AppShell) and across reloads (localStorage). Ctrl/Cmd+J toggles from
 * anywhere. Deliberately NO Escape-to-close: Chappi opens modals that close
 * on Escape themselves; a panel handler would double-fire and close both.
 *
 * Z-tiers: launcher z-50 (peer of the old pill); open panel z-[130] — above
 * the HelpMenu launcher (115), below TaskQuickCreateModal (170) and the
 * other modals (220), so anything Chappi opens stacks on top of the panel.
 */
export function ChappiDock({ onNewRelease }: ChappiDockProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isChatOpen, toggleChat, openChat } = useChatPanel();
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
  // On the catalog (/dashboard) at lg+, this dock is hidden (see the null
  // check below) and the slide-in panel owns Chappi instead — so the
  // shortcut routes to `toggleChat` there. This listener still runs even
  // while the dock itself renders null, so the shortcut isn't lost.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        const onCatalogDesktop =
          pathname === '/dashboard' &&
          typeof window !== 'undefined' &&
          !window.matchMedia('(max-width: 1023px)').matches;
        if (onCatalogDesktop) {
          toggleChat();
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
  }, [pathname, toggleChat]);

  // The Chappi page IS the chat — a floating duplicate of the same
  // conversation there is redundant. Open state is preserved for when the
  // user navigates back to a workspace page.
  if (pathname === '/dashboard/chappi') return null;

  // The slide-in panel owns Chappi on the catalog while it's open — hide
  // the dock (pill + panel both) rather than show two chat surfaces on the
  // same page. Below lg the panel doesn't exist, so this stays viewport-
  // agnostic on purpose: `?chat=1` only ever gets set from a desktop click.
  if (pathname === '/dashboard' && isChatOpen) return null;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          const onCatalogDesktop =
            pathname === '/dashboard' &&
            typeof window !== 'undefined' &&
            !window.matchMedia('(max-width: 1023px)').matches;
          if (onCatalogDesktop) {
            openChat();
            return;
          }
          setOpenPersisted(true);
        }}
        aria-label="Ask Chappi (beta)"
        className="group fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full border border-stroke-default bg-bg-elevated py-2.5 pl-3.5 pr-4 shadow-2xl transition-all duration-150 hover:border-stroke-strong hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:bottom-6 md:right-6"
      >
        <MessageCircle className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-content-tertiary group-hover:text-content-primary">
          Ask Chappi
        </span>
        <ChappiBetaBadge />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Chappi assistant"
      className="fixed bottom-5 right-5 z-[130] flex h-[560px] max-h-[calc(100vh-6rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface shadow-2xl md:bottom-6 md:right-6"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stroke-subtle px-3 py-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Chappi
          <ChappiBetaBadge />
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
              router.push('/dashboard/chappi');
            }}
            aria-label="Open Chappi full page"
            title="Open full page"
            className="motion-focus motion-press grid h-7 w-7 place-items-center text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setOpenPersisted(false)}
            aria-label="Close Chappi"
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

      {/* Human fallback — the WhatsApp founder line the standalone pill used
          to carry. Same URL, same accessible name semantics. */}
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with the founder — report a bug or contact support"
        onClick={(event) => {
          if (isNativePlatform()) {
            event.preventDefault();
            void openExternalUrl(WHATSAPP_URL);
          }
        }}
        className="flex shrink-0 items-center justify-center gap-1.5 border-t border-stroke-subtle px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        Chat with the founder
      </a>
    </div>
  );
}
