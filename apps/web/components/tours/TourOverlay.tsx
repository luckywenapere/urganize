'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@urganize/ui';
import { placeHelpTip, type PlacedHelpTip } from '@/lib/help-tip-position';
import { pickVisibleAnchor, tourStepProgress, type TourAnchor } from '@/lib/tours';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { useTourStore } from '@/stores/useTourStore';

/**
 * The spotlight and the card. One at a time, driven entirely by useTourStore.
 *
 * WHAT THIS REUSES, AND WHY THERE IS NO SECOND PLACER. `placeHelpTip`
 * (lib/help-tip-position.ts) already prefers a side, flips when there is no
 * room, clamps to a viewport margin and never returns a negative offset, and
 * it has its own tests. This calls it with `prefer: 'bottom'`. HelpTip.tsx is
 * also the model for the two DOM traps below, both of which it records by
 * name.
 *
 * WHAT IT DOES THAT HelpTip DOES NOT, which is the reason it exists at all:
 * HelpTip is explicitly not a modal — no backdrop, no spotlight,
 * `pointer-events-none` — because it answers "what is this field" on demand.
 * A tour answers "where am I, what do I do first", unasked, once. They
 * compose; neither replaces the other.
 *
 * FIVE THINGS WORTH KNOWING BEFORE EDITING THIS.
 *
 * 1. IT PORTALS TO THE BODY. AppShell's `lazy-fade` transform makes that
 *    element the containing block for any `fixed` descendant, and
 *    MobileNavBar's `backdrop-blur-xl` does the same — so an overlay rendered
 *    in place would be measured against the wrong box. Same mount guard
 *    DeleteReleaseDialog uses.
 *
 * 2. IT REPOSITIONS ON CAPTURE-PHASE SCROLL. Scroll does not bubble, and half
 *    these anchors live in inner scrollers (the side menu's nav list, the
 *    activities panel). Without capture the spotlight is left pointing at
 *    nothing the moment anything scrolls.
 *
 * 3. THE BACKDROP DOES NOT SKIP ON CLICK. It swallows the click and nothing
 *    else. A tour is three steps long and an accidental backdrop tap losing it
 *    is a worse outcome than a stray click doing nothing; Skip is right there
 *    and says what it does.
 *
 * 4. NO BODY SCROLL LOCK, deliberately, unlike every dialog in this app. The
 *    anchors live in scrollable panels and `scrollIntoView` has to work.
 *
 * 5. A STEP WITH NO ANCHOR ON SCREEN ADVANCES rather than stranding the user
 *    on an empty spotlight, and a tour whose steps ALL fail to resolve simply
 *    closes. Note what that means: seen-state is written by the caller at
 *    START (see useCatalogTourAutoStart), so such a tour is burned. Accepted
 *    rather than engineered around, because it cannot really arise — Tour A's
 *    first two anchors are nav chrome that exists wherever this overlay is
 *    mounted at all (AppShell gates both on `showWorkspaceChrome`), and Tour
 *    B is offered from inside the scoped rollout whose panel carries its
 *    anchors. Replay is the recovery if it ever does.
 */

/** Above sheets (z-[170]) and toasts (z-[200]) so neither can cover the card,
 *  and below the heavy dialog tier so anything the user deliberately opens
 *  wins. The backdrop sits one below the card. */
const BACKDROP_Z = 'z-[210]';
const CARD_Z = 'z-[211]';

/** Breathing room around the spotlit element. */
const SPOTLIGHT_PAD = 6;

type Box = { top: number; left: number; width: number; height: number };

function resolveAnchor(anchor: TourAnchor): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)
  );
  if (!nodes.length) return null;
  const index = pickVisibleAnchor(
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        rect: { width: rect.width, height: rect.height },
        hasOffsetParent: node.offsetParent !== null,
      };
    })
  );
  return index === null ? null : nodes[index];
}

export function TourOverlay() {
  const active = useTourStore((state) => state.active);
  const next = useTourStore((state) => state.next);
  const skip = useTourStore((state) => state.skip);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [spotlight, setSpotlight] = useState<Box | null>(null);
  const [placed, setPlaced] = useState<PlacedHelpTip | null>(null);

  const step = active ? active.steps[active.stepIndex] : null;
  const stepKey = step ? `${active?.tourId}:${step.id}` : '';

  // Resolve the anchor whenever the step changes. A step whose anchor is not
  // on screen advances rather than stranding the user on an empty spotlight.
  useIsomorphicLayoutEffect(() => {
    if (!step) {
      setAnchorEl(null);
      setSpotlight(null);
      setPlaced(null);
      return;
    }
    const el = resolveAnchor(step.anchor);
    if (!el) {
      // Deferred: calling next() during layout would set state inside another
      // component's render pass.
      const id = window.setTimeout(() => next(), 0);
      return () => window.clearTimeout(id);
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setAnchorEl(el);
  }, [stepKey, step, next]);

  const reposition = useCallback(() => {
    const card = cardRef.current;
    if (!anchorEl || !card) return;
    const rect = anchorEl.getBoundingClientRect();
    setSpotlight({
      top: rect.top - SPOTLIGHT_PAD,
      left: rect.left - SPOTLIGHT_PAD,
      width: rect.width + SPOTLIGHT_PAD * 2,
      height: rect.height + SPOTLIGHT_PAD * 2,
    });
    setPlaced(
      placeHelpTip({
        trigger: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        panel: { width: card.offsetWidth, height: card.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        prefer: 'bottom',
      })
    );
  }, [anchorEl]);

  useIsomorphicLayoutEffect(() => {
    if (!anchorEl) return;
    reposition();
  }, [anchorEl, reposition]);

  useEffect(() => {
    if (!anchorEl) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        reposition();
      });
    };
    // Capture phase: see note 2 in the docblock.
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(anchorEl);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [anchorEl, reposition]);

  // Focus the primary control on every step so a keyboard user is never left
  // behind the backdrop with nothing focused.
  useEffect(() => {
    if (!anchorEl) return;
    nextButtonRef.current?.focus();
  }, [anchorEl, stepKey]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        skip();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, skip]);

  if (!isMounted || !active || !step || !anchorEl) return null;

  const isLast = active.stepIndex === active.steps.length - 1;
  const primaryLabel = step.ctaLabel ?? (isLast ? 'Done' : 'Next');
  const progress = tourStepProgress(active.stepIndex, active.steps.length);

  return createPortal(
    <>
      <div
        className={`fixed inset-0 ${BACKDROP_Z}`}
        // Swallows the click; see note 3. aria-hidden because the card below
        // carries the accessible content.
        aria-hidden="true"
        onClick={(event) => event.stopPropagation()}
      />
      {spotlight ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed ${BACKDROP_Z} rounded-xl`}
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: '0 0 0 9999px rgb(var(--shadow-ink) / 0.6)',
          }}
        />
      ) : null}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label={step.title}
        style={{
          position: 'fixed',
          top: placed?.top ?? 0,
          left: placed?.left ?? 0,
          visibility: placed ? 'visible' : 'hidden',
        }}
        className={`${CARD_Z} w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-stroke-default bg-bg-elevated p-4 shadow-xl`}
      >
        {/* The step indicator sits on its own row above the title, in the
            app's stepped-flow eyebrow (TeamBriefSection's guided mode): the
            words for anyone reading, the bar for a glance. On its own row so
            a long last-step label ("Go to Team") never squeezes it. */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
            {progress.label}
          </span>
          <div
            aria-hidden="true"
            className="h-1.5 w-16 overflow-hidden rounded-full bg-stroke-strong"
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
        <p aria-live="polite" className="mt-2 text-sm font-semibold text-content-primary">
          {step.title}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-content-secondary">{step.body}</p>
        {/* Both controls are 44px tall: this card is shown mostly on phones,
            and Skip was a 24px text link before. */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={skip}
            className="motion-focus inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            Skip
          </button>
          <Button ref={nextButtonRef} size="md" className="min-h-11" onClick={next}>
            {primaryLabel}
          </Button>
        </div>
      </div>
    </>,
    document.body
  );
}
