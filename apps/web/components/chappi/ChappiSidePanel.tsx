'use client';

import { useRouter } from 'next/navigation';
import { Maximize2, MessageCircle, RotateCcw, X } from 'lucide-react';
import { useChappiStore } from '@/stores/useChappiStore';
import { ChappiBetaBadge } from './ChappiBetaBadge';
import { ChappiConversation } from './ChappiConversation';
import { useChatPanel } from '@/components/workspace/useChatPanel';

// Same fixed width the outer animating column resolves to when open — kept
// as a module const so the outer (animated `width`) and inner (static) card
// can never drift apart. `vw`, not `%`: the inner card's width must stay
// derived from the VIEWPORT, not the outer column's own (animating) width,
// or the two would fight every frame of the transition.
const PANEL_WIDTH = 'clamp(360px, 31vw, 460px)';

type ChappiSidePanelProps = {
  /** Whether the panel is open. Always mounted at lg+ so the width
   * transition (0 -> PANEL_WIDTH) can animate; hidden entirely below lg. */
  open: boolean;
  /** Opens the CreateReleaseModal owned by WorkspaceView (the same instance
   * the topbar's "New release" button and the dock use). */
  onNewRelease: () => void;
};

/**
 * The Chappi slide-in panel on the catalog (`/dashboard`, desktop only).
 * Sits inside WorkspaceView's flex row as the ~1/3-width column beside the
 * catalog content, sharing the SAME global `useChappiStore` conversation as
 * the dock and the full `/dashboard/chappi` page — closing this panel does
 * NOT lose the conversation (module-scope store, proven by the dock's
 * existing expand-to-page behavior).
 *
 * Header is a deliberate near-duplicate of ChappiDock's (see that file) —
 * the two surfaces are expected to diverge over time (this one is the
 * natural home for a future scope indicator), so copying beats a shared
 * abstraction here. Cross-reference: ChappiDock.tsx.
 *
 * Deliberately NO Escape-to-close, same reason as the dock: Chappi opens
 * modals (task quick-create, create-release) that close on Escape
 * themselves — a panel handler would double-fire and close both.
 *
 * No z-index: this is a layout-flow column, not an overlay. No body-scroll
 * lock, no InviteTeamBanner, no WhatsApp footer — matches the dock, not the
 * full page.
 */
export function ChappiSidePanel({ open, onNewRelease }: ChappiSidePanelProps) {
  const router = useRouter();
  const { closeChat } = useChatPanel();
  const messages = useChappiStore((state) => state.messages);
  const reset = useChappiStore((state) => state.reset);

  return (
    <aside
      aria-label="Chappi assistant"
      aria-hidden={!open}
      inert={!open}
      className={`hidden shrink-0 self-start overflow-hidden transition-[width,margin-left,visibility] duration-slow ease-standard lg:block ${
        // Height calc is the same arithmetic as WorkspaceDesktopFocused's
        // viewport lock (topbar 4rem + 1px border + AppShell main pt-5
        // 1.25rem = 5.25rem top offset; 100dvh minus that offset minus
        // main's md:pb-10 2.5rem = 7.75rem total). This NUMERICALLY equals
        // .chappi-shell-height's md+ value but must stay written out here,
        // not reference that class — that class also carries a mobile
        // branch and is documented as chappi-route-only (globals.css).
        'sticky top-[calc(5.25rem+1px)] h-[calc(100dvh-7.75rem-1px)] min-h-[24rem]'
      } ${open ? 'ml-6 visible' : 'ml-0 w-0 invisible'}`}
      style={open ? { width: PANEL_WIDTH } : undefined}
    >
      <div
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface"
        style={{ width: PANEL_WIDTH }}
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
                // Leaving `?chat=1` in the /dashboard history entry is
                // intentional — the Chappi page's collapse button routes
                // back to it, and browser Back from there restores the
                // split view exactly.
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
              onClick={closeChat}
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
      </div>
    </aside>
  );
}
