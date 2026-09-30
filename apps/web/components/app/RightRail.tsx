'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { useChappiStore } from '@/stores/useChappiStore';
import { selectMenuPresent, useRailMenuStore } from '@/stores/useRailMenuStore';
import { useSidebarStore } from '@/stores/useSidebarStore';
import {
  DEFAULT_RAIL_WIDTH,
  RAIL_KEYBOARD_STEP,
  RAIL_KEYBOARD_STEP_LARGE,
  RAIL_MENU_ONLY_WIDTH,
  clampRailWidth,
  railColumnWidth,
  railWidthFromDrag,
  resolveRailBounds,
} from '@/lib/rail-width';
import { sidebarTotalWidth } from '@/lib/sidebar-width';

// The chat card is the heavy half of this column (the whole conversation UI),
// so it stays its own async chunk. ssr:false is safe: the old rail was
// client-only too and rendered nothing on the server.
const ChappiSidePanel = dynamic(
  () => import('@/components/chappi/ChappiSidePanel').then((m) => m.ChappiSidePanel),
  { ssr: false }
);

const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

// Same two-flag definition AppShell mounts the side menu on. The old rail file
// read only the first of these, which agreed with AppShell only as long as both
// happened to be on together.
const IDENTITY_PANEL_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

/**
 * If the chat card throws, close the chat rather than leave a blank card-sized
 * gap in the column. Subscribes to the open state and not just the mount, so
 * pressing the topbar's UrgAns icon afterwards does not reopen an empty hole:
 * it goes quiet until a reload, which is what the old whole-rail boundary did
 * (the rail vanished and the icon did nothing). The menu above it is untouched.
 */
function CloseChatOnCrash() {
  const railOpen = useChappiStore((state) => state.railOpen);
  useEffect(() => {
    if (railOpen) useChappiStore.getState().setRailOpen(false);
  }, [railOpen]);
  return null;
}

type RightRailProps = {
  /** Opens the CreateReleaseModal owned by AppShell (the same instance the
   *  topbar's "New rollout" button and the dock use). */
  onNewRelease: () => void;
};

/**
 * THE RIGHT-HAND COLUMN — one column, two cards. The rollout's menu on top and
 * the UrgAns chat directly under it (founder call, 2026-09-30, from Cursor's
 * agent window: "chat should go under the other right hand menu").
 *
 * This component owns everything that is LAYOUT, and moved here whole from the
 * UrgAns rail it replaces: the sticky, height-locked column, the viewport
 * measure, the drag bounds, `--urgans-rail-width` and the resize handle. The
 * chat card (ChappiSidePanel) is only the card now. The menu is not rendered
 * here at all: WorkspaceView renders it, because Share, Change artist and
 * Archive depend on state that lives there, and portals its DOM into `slot`
 * below (see stores/useRailMenuStore.ts for why).
 *
 * THE COLUMN'S WIDTH is `railColumnWidth`: the chat's width when the chat is
 * open, RAIL_MENU_ONLY_WIDTH when only the menu is showing, nothing when
 * neither is. That one answer is what the side menu reserves room for too.
 *
 * Mounted by AppShell on every chrome page except the assistant's own, where
 * the page IS the chat. It is deliberately NOT gated on the assistant flag: with
 * the assistant off the column still carries the menu.
 *
 * Deliberately NO Escape-to-close, same reason as the dock: the assistant opens
 * modals (task quick-create, create-release) that close on Escape themselves —
 * a column handler would double-fire and close both.
 *
 * MUST NOT call `useSearchParams`: this is mounted app-wide, and that hook in a
 * statically prerendered client component bails the whole page out to its
 * nearest Suspense boundary, which is exactly what keeps /auth, /onboarding,
 * /settings and /dashboard `○ Static`. Everything URL-shaped lives in the menu,
 * which WorkspaceView renders.
 *
 * No z-index: this is a layout-flow column, not an overlay. No body-scroll lock.
 */
export function RightRail({ onNewRelease }: RightRailProps) {
  const railOpen = useChappiStore((state) => state.railOpen);
  const railWidth = useChappiStore((state) => state.railWidth);
  const setRailWidth = useChappiStore((state) => state.setRailWidth);
  const sidebarWidth = useSidebarStore((state) => state.width);
  const sidebarCollapsed = useSidebarStore((state) => state.collapsed);
  const menuPresent = useRailMenuStore(selectMenuPresent);
  const setSlot = useRailMenuStore((state) => state.setSlot);

  // The chat is open only if it exists AND was opened.
  const chatOpen = CHAPPI_ENABLED && railOpen;

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

  // How much the workspace side menu is taking, which is a real measurement
  // now rather than a constant: that card is draggable too, so a fixed
  // reservation under-reserves the moment somebody widens it and the shortfall
  // comes straight out of <main>'s floor.
  //
  // It hides ITSELF between lg and xl while this column is on screen
  // (railIsCompeting in WorkspaceIdentityPanel) — but only while EXPANDED; a
  // collapsed 64px card coexists with the column from lg up, which is what makes
  // collapsing the menu the user's own way to give the chat more room. Reserving
  // a column that is not on screen would compute the maximum against space
  // nobody can see, so those cases pass 0.
  const identityPanelTotal = !IDENTITY_PANEL_ENABLED
    ? 0
    : sidebarCollapsed
      ? sidebarTotalWidth(sidebarWidth, true)
      : viewport >= 1280
        ? sidebarTotalWidth(sidebarWidth, false)
        : 0;
  // These are the CHAT's bounds and the CHAT's width. The menu-only column is
  // not subject to them (it is narrower than the narrowest chat on purpose).
  const bounds = resolveRailBounds(viewport, identityPanelTotal);
  const width = clampRailWidth(railWidth, bounds);

  // A width the current viewport cannot pay for is corrected in state too,
  // not just on screen — otherwise the next drag would start from a number
  // nothing on the page agrees with.
  useEffect(() => {
    if (viewport > 0 && width !== railWidth) setRailWidth(width);
  }, [viewport, width, railWidth, setRailWidth]);

  const columnWidth = railColumnWidth({ chatOpen, menuPresent, chatWidth: width });
  const visible = columnWidth > 0;

  // Whether the column's width change is animated. It is, unless the ONLY thing
  // that changed is whether a menu is present: opening a rollout mounts the
  // menu, and a 280ms slide would reflow <main> frame by frame and flip the
  // timeline and calendar container queries mid-animation. The chat opening or
  // closing keeps its slide, exactly as the old rail had it.
  //
  // Kept in state and adjusted DURING render (React's "storing information from
  // previous renders" pattern) rather than in a ref or an effect: a ref read in
  // render is an error in this repo's lint config, and an effect would paint
  // one frame with the wrong answer first.
  const [seen, setSeen] = useState({ chatOpen: false, menuPresent: false, animate: true });
  if (seen.chatOpen !== chatOpen || seen.menuPresent !== menuPresent) {
    setSeen({ chatOpen, menuPresent, animate: seen.chatOpen !== chatOpen });
  }

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
          resolveRailBounds(document.documentElement.clientWidth, identityPanelTotal)
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
    [bounds.resizable, commit, identityPanelTotal, width]
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
      aria-label="Rollout menu and UrgAns"
      aria-hidden={!visible}
      inert={!visible}
      ref={asideRef}
      className={`relative hidden shrink-0 self-start overflow-hidden lg:block ${
        // The transition is REMOVED while dragging. It animates `width`, so
        // every frame of a drag would lag a third of a second behind the
        // cursor — the single most likely way for this to look broken. It is
        // also removed while only the menu's presence changed; see `seen`.
        dragging || !seen.animate
          ? ''
          : 'transition-[width,margin-right,visibility] duration-slow ease-standard'
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
        // mr-8 matches <main>'s lg:px-8 inset so the column's right edge lines
        // up with where content edges sit; main's own right padding is the
        // gap on the other side. (As a sibling of <main> in AppShell's flex
        // row, the column sits OUTSIDE main's padding.)
        visible ? 'mr-8 visible' : 'mr-0 w-0 invisible'
      }`}
      // `--urgans-rail-width` is the CHAT's width, always — open or not — so the
      // chat card keeps its own width while the column slides shut around it
      // instead of reflowing its transcript mid-animation. The outer width is
      // the column's actual width: that same variable while the chat is open
      // (which is what the drag writes to), the menu-only width otherwise.
      style={
        {
          '--urgans-rail-width': `${width}px`,
          ...(visible
            ? { width: chatOpen ? 'var(--urgans-rail-width)' : `${RAIL_MENU_ONLY_WIDTH}px` }
            : null),
        } as CSSProperties
      }
    >
      {/* The drag handle sits on the column's LEFT edge, so dragging toward the
          centre of the screen widens the chat. It runs the full height and so
          lies over the menu card's left edge too; the menu card is padded in
          to keep its rows clear of it. Withheld entirely when the chat is
          closed (there is nothing to resize) or the viewport cannot pay for any
          movement — a control that cannot move is worse than none. */}
      {chatOpen && bounds.resizable ? (
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

      <div className="relative flex h-full flex-col" style={{ width: 'var(--urgans-rail-width)' }}>
        {/* The menu's slot. An empty div has no height, so a page with no
            rollout open reserves nothing above the chat. While the chat is open
            the slot is capped so the chat always keeps roughly 22rem to work
            in (22rem plus the 0.75rem gap the menu card carries below itself);
            with the chat closed it may use the whole column. `setSlot` is the
            store's own stable function, NOT an inline callback: an inline ref
            is a new function every render and would unmount and remount the
            portalled menu each time. */}
        <div
          ref={setSlot}
          className={`flex min-h-0 shrink-0 flex-col ${
            chatOpen ? 'max-h-[clamp(9rem,calc(100%-22.75rem),50%)]' : 'max-h-full'
          }`}
          style={chatOpen ? undefined : { width: `${RAIL_MENU_ONLY_WIDTH}px` }}
        />

        {CHAPPI_ENABLED ? (
          // Its own boundary, so a chat crash closes the chat and leaves the
          // menu standing. The outer boundary in AppShell is for the column.
          <ErrorBoundary
            name="urgans-rail"
            onError={reportBoundaryError}
            fallback={<CloseChatOnCrash />}
          >
            <ChappiSidePanel open={chatOpen} onNewRelease={onNewRelease} />
          </ErrorBoundary>
        ) : null}
      </div>
    </aside>
  );
}
