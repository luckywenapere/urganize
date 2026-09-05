'use client';

import { useRouter } from 'next/navigation';
import { Maximize2, MessageCircle, RotateCcw, X } from 'lucide-react';
import { useChappiStore } from '@/stores/useChappiStore';
import { ChappiConversation } from './ChappiConversation';

// Same fixed width the outer animating column resolves to when open — kept
// as a module const so the outer (animated `width`) and inner (static) card
// can never drift apart. `vw`, not `%`: the inner card's width must stay
// derived from the VIEWPORT, not the outer column's own (animating) width,
// or the two would fight every frame of the transition.
const PANEL_WIDTH = 'clamp(360px, 31vw, 460px)';

type ChappiSidePanelProps = {
  /** Opens the CreateReleaseModal owned by AppShell (the same instance
   * the topbar's "New release" button and the dock use). */
  onNewRelease: () => void;
};

/**
 * The UrgAns side rail — a layout-flow right column mounted by AppShell
 * beside `<main>` on EVERY chrome page (dashboard + settings) at lg+, so the
 * assistant travels with the user wherever they navigate (URG-210; it was
 * previously scoped to the catalog only, driven by a `?chat=1` URL param —
 * a param can't survive navigation, so open state moved to the store).
 * Shares the SAME global `useChappiStore` conversation as the dock and the
 * full `/dashboard/urgans` page — closing this panel does NOT lose the
 * conversation (module-scope store, proven by the dock's existing
 * expand-to-page behavior).
 *
 * Open state is `useChappiStore.railOpen`: persisted on write, hydrated once
 * by AppShell, auto-opened once per session after the user lands on the
 * assistant page (AppShell's arming effect). Always mounted at lg+ so the
 * width transition (0 -> PANEL_WIDTH) can animate; hidden entirely below lg
 * (the floating ChappiDock is the small-viewport surface).
 *
 * Header is a deliberate near-duplicate of ChappiDock's (see that file) —
 * the two surfaces are expected to diverge over time (this one is the
 * natural home for a future scope indicator), so copying beats a shared
 * abstraction here. Cross-reference: ChappiDock.tsx.
 *
 * Deliberately NO Escape-to-close, same reason as the dock: the assistant
 * opens modals (task quick-create, create-release) that close on Escape
 * themselves — a panel handler would double-fire and close both.
 *
 * No z-index: this is a layout-flow column, not an overlay. No body-scroll
 * lock, no InviteTeamBanner — matches the dock, not the full page.
 */
export function ChappiSidePanel({ onNewRelease }: ChappiSidePanelProps) {
  const router = useRouter();
  const open = useChappiStore((state) => state.railOpen);
  const setRailOpen = useChappiStore((state) => state.setRailOpen);
  const messages = useChappiStore((state) => state.messages);
  const reset = useChappiStore((state) => state.reset);

  return (
    <aside
      aria-label="UrgAns assistant"
      aria-hidden={!open}
      inert={!open}
      className={`hidden shrink-0 self-start overflow-hidden transition-[width,margin-right,visibility] duration-slow ease-standard lg:block ${
        // Height calc is the same arithmetic as WorkspaceDesktopFocused's
        // viewport lock (topbar 4rem + 1px border + AppShell main pt-5
        // 1.25rem = 5.25rem top offset; 100dvh minus that offset minus
        // main's md:pb-10 2.5rem = 7.75rem total). This NUMERICALLY equals
        // .chappi-shell-height's md+ value but must stay written out here,
        // not reference that class — that class also carries a mobile
        // branch and is documented as chappi-route-only (globals.css).
        'sticky top-[calc(5.25rem+1px)] h-[calc(100dvh-7.75rem-1px)] min-h-[24rem]'
      } ${
        // mr-8 matches <main>'s lg:px-8 inset so the rail's right edge lines
        // up with where content edges sit; main's own right padding is the
        // gap on the other side. (As a sibling of <main> in AppShell's flex
        // row, the rail sits OUTSIDE main's padding.)
        open ? 'mr-8 visible' : 'mr-0 w-0 invisible'
      }`}
      style={open ? { width: PANEL_WIDTH } : undefined}
    >
      <div
        className="flex h-full flex-col overflow-hidden urg-cartouche rounded-2xl border border-stroke-default bg-bg-surface"
        style={{ width: PANEL_WIDTH }}
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
                // The page and the rail share one conversation, so expanding
                // is a pure navigation — the transcript follows. railOpen is
                // left true on purpose: the rail renders nowhere on the
                // assistant page, and navigating back restores the split.
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
              onClick={() => setRailOpen(false)}
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
    </aside>
  );
}
