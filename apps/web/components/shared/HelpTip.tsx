'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from '@/components/icons';
import { HELP_COPY, type HelpKey } from '@/lib/help-copy';
import { placeHelpTip, type PlacedHelpTip } from '@/lib/help-tip-position';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';

/**
 * A small pullout that explains one thing, in place of a paragraph of grey text.
 *
 * Founder ask (2026-09-08), from a screenshot of Vercel's side menu: the places
 * carrying too much text should OFFER the explanation rather than print it, and
 * the whole app should be usable by someone who has never seen software like
 * this before.
 *
 * TWO LAYERS, because the two surfaces that needed this want different
 * triggers:
 *
 *  - `HelpTipPanel` is the positioned panel and nothing else. It takes the
 *    element to point at, so a caller can attach it to whatever it likes.
 *  - `HelpTip` is the self-contained version: a small round `i` button that
 *    toggles its own panel. This is what a form field label wants.
 *
 * The side menu uses the panel directly with ONE instance for the whole list,
 * because only one tip is ever visible and its rows are built inside a `.map`
 * where a per-row hook would break the rules of hooks.
 *
 * FOUR THINGS WORTH KNOWING BEFORE EDITING THIS.
 *
 * 1. TAP IS THE BASELINE FOR THE BUTTON, HOVER IS THE ENHANCEMENT. `HelpTip` is
 *    a real <button> that toggles on click, so it works on a phone, which is
 *    most of this product's traffic. Hover only opens it where a pointer can
 *    actually hover, checked with matchMedia rather than a width breakpoint: a
 *    touch laptop is wide and cannot hover, and `hover: hover` is the only
 *    honest test. The SIDE MENU is the deliberate exception and is hover-only,
 *    which costs nothing there because that card is `hidden lg:block` and never
 *    renders on a touch device at all.
 *
 * 2. IT PORTALS TO THE BODY, and it has to. Both target surfaces clip their own
 *    children (the side menu's nav list scrolls, every metadata step card is
 *    `overflow-hidden`), and inside AppShell a `fixed` panel is broken by the
 *    `lazy-fade` transform, which makes that element the containing block — the
 *    trap DeleteReleaseDialog already portals around. See
 *    lib/help-tip-position.ts for the placement decision that follows from it.
 *
 * 3. IT REPOSITIONS ON CAPTURE-PHASE SCROLL. Scroll does not bubble, so a
 *    document listener only sees inner scrollers in the capture phase — and the
 *    side menu's nav list is exactly such a scroller. Without capture,
 *    scrolling the nav leaves the panel behind, pointing at nothing.
 *
 * 4. IT IS NOT A MODAL. No scroll lock, no focus trap, no backdrop, and the
 *    panel is `pointer-events-none` so it can never swallow a click meant for
 *    what is underneath. Its z-tier sits above app chrome and deliberately
 *    BELOW the modal tier, so a tip cannot cover a dialog.
 *
 * The copy lives in lib/help-copy.ts rather than in a prop: vitest reaches
 * `lib/` and nothing else in this repo, so that is the only place the
 * fifth-grader bar can be enforced instead of reviewed.
 */

/** Above app chrome and MobileNavBar's own z-[140], below the modal tier
 * (z-[170]+) that Escape and the scroll lock belong to. */
const PANEL_Z = 'z-[150]';

export function HelpTipPanel({
  helpKey,
  anchor,
  prefer = 'bottom',
  id,
  onDismiss,
}: {
  helpKey: HelpKey;
  /** The element to point at. `null` closes the panel — callers hold the open
   * state, which is what lets one panel serve a whole list of rows. */
  anchor: HTMLElement | null;
  prefer?: 'right' | 'bottom';
  /** Passed in rather than generated so the caller can put the same value on
   * its anchor's aria-describedby. */
  id: string;
  /** Called on Escape. Optional: the side menu closes on pointer leave and has
   * nothing to restore focus to. */
  onDismiss?: () => void;
}) {
  const { text } = HELP_COPY[helpKey];
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [placed, setPlaced] = useState<PlacedHelpTip | null>(null);

  const reposition = useCallback(() => {
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    setPlaced(
      placeHelpTip({
        trigger: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        panel: { width: panel.offsetWidth, height: panel.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        prefer,
      })
    );
  }, [anchor, prefer]);

  // Measured before paint, so the panel is never seen at an unplaced position.
  // Until `placed` lands it renders hidden, which covers the single frame
  // between mounting it and knowing how big it is.
  useIsomorphicLayoutEffect(() => {
    if (!anchor) {
      setPlaced(null);
      return;
    }
    reposition();
  }, [anchor, reposition]);

  useEffect(() => {
    if (!anchor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss?.();
    };
    // Capture phase for scroll: see note 3 in the docblock.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    if (onDismiss) document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchor, reposition, onDismiss]);

  // `document.body` is read during render rather than captured in state via an
  // effect, and that is safe by construction rather than by luck: `anchor` is a
  // DOM element, which cannot exist on the server, so this line is unreachable
  // during SSR and the early return above fires instead. Doing it the other way
  // needed a setState in a mount effect, which this repo runs as a warning.
  if (!anchor) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="tooltip"
      style={{
        position: 'fixed',
        top: placed?.top ?? 0,
        left: placed?.left ?? 0,
        visibility: placed ? 'visible' : 'hidden',
      }}
      className={`pointer-events-none ${PANEL_Z} max-w-[17rem] rounded-lg border border-stroke-default bg-bg-elevated px-3 py-2 text-xs leading-relaxed text-content-primary shadow-lg`}
    >
      {text}
    </div>,
    document.body
  );
}

export function HelpTip({
  helpKey,
  prefer = 'bottom',
  className = '',
}: {
  helpKey: HelpKey;
  prefer?: 'right' | 'bottom';
  className?: string;
}) {
  const { label } = HELP_COPY[helpKey];
  const panelId = useId();
  // The trigger element lives in STATE, not a ref, and that is not a style
  // preference: the panel needs it as a prop, and reading `ref.current` during
  // render is a `react-hooks/refs` error in this config (the rule that already
  // accounts for every pre-existing error in the repo). A callback ref keeps it
  // in the render path legitimately.
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    // Hand focus back, so a keyboard user pressing Escape is not dropped at the
    // top of the document.
    trigger?.focus();
  }, [trigger]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && trigger?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, trigger]);

  // `hover: hover` rather than a width breakpoint — see note 1. Read on demand
  // so it cannot go stale when a device gains or loses a pointer.
  const pointerCanHover = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  return (
    <>
      <button
        ref={setTrigger}
        type="button"
        // Names what it explains rather than a bare "Help", so a screen reader
        // user hears which of nine fields this one belongs to.
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onPointerEnter={() => {
          if (pointerCanHover()) setOpen(true);
        }}
        onPointerLeave={() => {
          if (pointerCanHover()) setOpen(false);
        }}
        onFocus={(event) => {
          // Only KEYBOARD focus opens it. A tap or a click also focuses the
          // button, and then the click toggled it straight back shut, so on an
          // Android phone the tip flashed and vanished. `:focus-visible` is
          // true for a keyboard arrival and false for a pointer one.
          let keyboardArrival = true;
          try {
            keyboardArrival = event.currentTarget.matches(':focus-visible');
          } catch {
            // An engine without the selector: keep the old behaviour.
          }
          if (keyboardArrival) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        // The circle is 20px, which is a hard thing to hit with a thumb. The
        // pseudo-element widens the target to 44px without moving anything.
        className={`motion-focus relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-content-tertiary transition-colors before:absolute before:-inset-3 before:content-[''] hover:bg-bg-hover hover:text-content-primary ${className}`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <HelpTipPanel
        helpKey={helpKey}
        anchor={open ? trigger : null}
        prefer={prefer}
        id={panelId}
        onDismiss={close}
      />
    </>
  );
}
