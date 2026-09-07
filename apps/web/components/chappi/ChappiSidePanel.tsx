'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Maximize2, MessageCircle, RotateCcw, X } from '@/components/icons';
import { useChappiStore } from '@/stores/useChappiStore';
import {
  DEFAULT_RAIL_WIDTH,
  RAIL_KEYBOARD_STEP,
  RAIL_KEYBOARD_STEP_LARGE,
  clampRailWidth,
  railWidthFromDrag,
  resolveRailBounds,
} from '@/lib/rail-width';
import { ChappiConversation } from './ChappiConversation';

const IDENTITY_PANEL_ENABLED = process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true';

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
  const railWidth = useChappiStore((state) => state.railWidth);
  const setRailWidth = useChappiStore((state) => state.setRailWidth);

  const asideRef = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);

  // Measured rather than assumed, and re-measured on resize: a width sized on
  // a big monitor must not survive onto a laptop, and browser zoom, OS display
  // scaling and a rotating tablet all arrive through this same event.
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      // documentElement.clientWidth, never innerWidth: this repo has already
      // been burned measuring the wrong one, and innerWidth includes a
      // classic scrollbar that is not layout space.
      setViewport(document.documentElement.clientWidth);
    };
    measure();
    const onResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // The identity card hides ITSELF between lg and xl while the rail is open
  // (railIsCompeting in WorkspaceIdentityPanel), so reserving its width in
  // that band would compute the maximum against a column that is not there.
  const identityPanelPresent =
    IDENTITY_PANEL_ENABLED && viewport >= 1280;
  const bounds = resolveRailBounds(viewport, identityPanelPresent);
  const width = clampRailWidth(railWidth, bounds);

  // A width the current viewport cannot pay for is corrected in state too,
  // not just on screen — otherwise the next drag would start from a number
  // nothing on the page agrees with.
  useEffect(() => {
    if (viewport > 0 && width !== railWidth) setRailWidth(width);
  }, [viewport, width, railWidth, setRailWidth]);

  const commit = useCallback(
    (next: number) => setRailWidth(clampRailWidth(next, bounds)),
    [bounds, setRailWidth]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Left button only. A right or middle click here is not a resize, and
      // a second finger arriving mid-drag must not hijack the first.
      if (event.button !== 0 || !bounds.resizable) return;
      event.preventDefault();

      const handle = event.currentTarget;
      const startX = event.clientX;
      const startWidth = width;
      const pointerId = event.pointerId;
      handle.setPointerCapture(pointerId);
      setDragging(true);

      // The drag writes a CSS variable, not React state: at 120Hz this is one
      // style write per frame instead of one render per frame. State is set
      // once, on release.
      let frame = 0;
      let latest = startWidth;

      const paint = () => {
        frame = 0;
        asideRef.current?.style.setProperty('--urgans-rail-width', `${latest}px`);
      };

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        // Bounds are recomputed per move so a window resized mid-drag cannot
        // strand the rail outside them.
        latest = railWidthFromDrag(
          startWidth,
          startX,
          moveEvent.clientX,
          resolveRailBounds(document.documentElement.clientWidth, identityPanelPresent)
        );
        if (!frame) frame = window.requestAnimationFrame(paint);
      };

      const finish = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        if (frame) window.cancelAnimationFrame(frame);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', finish);
        // A cancelled drag COMMITS what the user last saw rather than
        // snapping back: the pointer was taken by the OS, not by them.
        handle.removeEventListener('pointercancel', finish);
        try {
          handle.releasePointerCapture(pointerId);
        } catch {
          // Already released, or the element is going away. Nothing to undo.
        }
        asideRef.current?.style.removeProperty('--urgans-rail-width');
        setDragging(false);
        commit(latest);
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    },
    [bounds.resizable, commit, identityPanelPresent, width]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!bounds.resizable) return;
      const step = event.shiftKey ? RAIL_KEYBOARD_STEP_LARGE : RAIL_KEYBOARD_STEP;
      // Left widens, matching the drag direction exactly.
      if (event.key === 'ArrowLeft') commit(width + step);
      else if (event.key === 'ArrowRight') commit(width - step);
      else if (event.key === 'Home') commit(bounds.max);
      else if (event.key === 'End') commit(bounds.min);
      else if (event.key === 'Enter' || event.key === ' ') commit(DEFAULT_RAIL_WIDTH);
      else return;
      // Only once we know it was ours: Escape and Tab still belong to the page.
      event.preventDefault();
    },
    [bounds, commit, width]
  );

  // Cursor and selection are set on <body> for the whole drag, so neither
  // flickers as the pointer crosses other elements.
  useEffect(() => {
    if (!dragging) return;
    const { style } = document.body;
    const previousCursor = style.cursor;
    const previousSelect = style.userSelect;
    style.cursor = 'col-resize';
    style.userSelect = 'none';
    return () => {
      style.cursor = previousCursor;
      style.userSelect = previousSelect;
    };
  }, [dragging]);

  return (
    <aside
      aria-label="UrgAns assistant"
      aria-hidden={!open}
      inert={!open}
      ref={asideRef}
      className={`relative hidden shrink-0 self-start overflow-hidden lg:block ${
        // The transition is REMOVED while dragging. It animates `width`, so
        // every frame of a drag would lag a third of a second behind the
        // cursor — the single most likely way for this to look broken.
        dragging ? '' : 'transition-[width,margin-right,visibility] duration-slow ease-standard'
      } ${
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
      // ONE width, read by both the outer animating column and the inner
      // card through the same custom property. They were two copies of a
      // module const before, with a comment saying they must never drift;
      // a variable is the version of that which cannot.
      style={
        {
          '--urgans-rail-width': `${width}px`,
          ...(open ? { width: 'var(--urgans-rail-width)' } : null),
        } as React.CSSProperties
      }
    >
      {/* The drag handle sits on the rail's LEFT edge, so dragging toward the
          centre of the screen widens it. 8px of visible hairline inside a
          wider hit area; withheld entirely when the viewport cannot pay for
          any movement, because a control that cannot move is worse than none. */}
      {open && bounds.resizable ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize UrgAns panel"
          aria-valuenow={width}
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          tabIndex={0}
          draggable={false}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          onDoubleClick={() => commit(DEFAULT_RAIL_WIDTH)}
          className="motion-focus group absolute left-0 top-0 z-10 h-full w-3 cursor-col-resize touch-none select-none"
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 left-1 w-0.5 rounded-full transition-colors ${
              dragging ? 'bg-brand' : 'bg-transparent group-hover:bg-brand/50 group-focus-visible:bg-brand'
            }`}
          />
        </div>
      ) : null}

      <div
        className="relative flex h-full flex-col overflow-hidden urg-cartouche rounded-2xl border border-stroke-default bg-bg-surface"
        style={{ width: 'var(--urgans-rail-width)' }}
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
