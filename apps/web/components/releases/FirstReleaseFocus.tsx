'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@urganize/ui';
import { BlankSheetIllustration, PlanIllustration } from '@/components/app/BrandIcons';
import { useAuthStore } from '@/lib/auth-store';
import { isBodyScrollLocked, lockBodyScroll } from '@/lib/body-scroll-lock';
import {
  FIRST_RELEASE_FOCUS_COPY as COPY,
  decideFirstReleaseFocus,
  isFirstReleaseFocusEnabled,
  isLockedHref,
  planChoiceForMode,
  type FirstReleasePlanMode,
} from '@/lib/first-release-focus';
import { placeHelpTip, type PlacedHelpTip } from '@/lib/help-tip-position';
import { readTourSeen } from '@/lib/tours';
import { selectLiveTurnCount, useChappiStore } from '@/stores/useChappiStore';
import { useShellStore } from '@/stores/useShellStore';
import { useTourStore } from '@/stores/useTourStore';
import { useFirstReleaseRequired } from './useFirstReleaseRequired';

const TOURS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TOURS === 'true';
const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';

/** Above the tour (z-[210]/[211]) so the choice can never be covered by it,
 *  and level with the create modal (z-[220]), which it never overlaps because
 *  it closes before opening that. */
const DIALOG_Z = 'z-[220]';
const CALLOUT_Z = 'z-[215]';

/** Once per browser session per account: the choice opens itself the first
 *  time focus starts, then waits to be asked for (the bar, a locked link).
 *  sessionStorage so a returning zero-rollout user is offered it again. */
function choiceShownKey(userId: string): string {
  return `urganize.first-release-focus.choice.${userId}`;
}

function readChoiceShown(userId: string): boolean {
  try {
    return window.sessionStorage.getItem(choiceShownKey(userId)) === '1';
  } catch {
    // Unreadable storage must not mean "open it on every render".
    return true;
  }
}

function markChoiceShown(userId: string): void {
  try {
    window.sessionStorage.setItem(choiceShownKey(userId), '1');
  } catch {
    /* ignore */
  }
}

type Callout = { rect: { top: number; left: number; width: number; height: number } };

/**
 * The first-rollout focus (lib/first-release-focus.ts): after the tour, with
 * no rollout yet, the rest of the app is locked and the one thing on offer is
 * making the first rollout, planned by UrgAns or by the manager.
 *
 * Three surfaces, one switch:
 *  - a standing bar saying what is locked and why, with the create button;
 *  - a catch on in-app links that are locked, which explains instead of going;
 *  - the choice dialog (UrgAns plan vs plan it yourself), opened once on its
 *    own and on demand after that.
 *
 * Mounted once in AppShell. Renders nothing while the flag is off or focus is
 * not active, and the effects below only ever ADD a lock while it is.
 */
export function FirstReleaseFocus() {
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const isCurator = useAuthStore((state) => state.user?.role === 'curator');
  const firstReleaseRequired = useFirstReleaseRequired();
  const tourBlocking = useTourStore((state) => state.active !== null || state.pendingReplay !== null);
  const createOpen = useShellStore((state) => state.createOpen);
  const openCreate = useShellStore((state) => state.openCreate);

  // Read in an effect, not during render: storage during render is the
  // hydration mismatch this repo has fixed before. Re-read whenever a tour
  // starts or ends, because the tour marks itself seen at START.
  const [tourSeen, setTourSeen] = useState(false);
  useEffect(() => {
    setTourSeen(readTourSeen(userId, 'catalog'));
  }, [userId, tourBlocking]);

  const active = decideFirstReleaseFocus({
    flag: isFirstReleaseFocusEnabled(),
    firstReleaseRequired,
    isCurator,
    toursEnabled: TOURS_ENABLED,
    tourSeen,
    tourBlocking,
  });

  const [choiceOpen, setChoiceOpen] = useState(false);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // The attribute is the CSS hook that dims the locked areas in the nav
  // (globals.css). Removed the moment focus lifts.
  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.releaseFocus = 'on';
    return () => {
      delete document.documentElement.dataset.releaseFocus;
    };
  }, [active]);

  // Open the choice by itself once per session. Guards fail toward waiting:
  // another modal up, or a conversation with UrgAns in progress, means the bar
  // stays and the dialog is left for the manager to ask for.
  useEffect(() => {
    if (!active || !userId) return;
    if (readChoiceShown(userId)) return;
    if (isBodyScrollLocked() || createOpen) return;
    if (selectLiveTurnCount(useChappiStore.getState()) > 0) return;
    markChoiceShown(userId);
    setChoiceOpen(true);
  }, [active, userId, createOpen]);

  // Catch clicks on locked in-app links in the CAPTURE phase on the document,
  // which runs before React's root listener, so the router never sees them.
  useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;
      if (!isLockedHref(anchor.getAttribute('href'), window.location.origin)) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = anchor.getBoundingClientRect();
      setCallout({
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active]);

  const choose = useCallback(
    (mode: FirstReleasePlanMode) => {
      setChoiceOpen(false);
      setCallout(null);
      openCreate(planChoiceForMode(mode));
    },
    [openCreate]
  );

  if (!isMounted || !active) return null;

  return createPortal(
    <>
      {!choiceOpen && !createOpen ? (
        <div
          role="status"
          className="fixed left-1/2 top-[84px] z-40 flex w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-full border border-stroke-default bg-bg-elevated py-1.5 pl-4 pr-1.5 shadow-lg"
        >
          <span className="text-xs font-medium text-content-secondary sm:text-sm">
            {COPY.barLabel}
          </span>
          <Button size="md" className="min-h-11 shrink-0" onClick={() => setChoiceOpen(true)}>
            {COPY.barCta}
          </Button>
        </div>
      ) : null}
      {callout ? (
        <LockedCallout
          rect={callout.rect}
          onCreate={() => {
            setCallout(null);
            setChoiceOpen(true);
          }}
          onClose={() => setCallout(null)}
        />
      ) : null}
      {choiceOpen ? <PlanChoiceDialog onChoose={choose} onClose={() => setChoiceOpen(false)} /> : null}
    </>,
    document.body
  );
}

function LockedCallout({
  rect,
  onCreate,
  onClose,
}: {
  rect: Callout['rect'];
  onCreate: () => void;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [placed, setPlaced] = useState<PlacedHelpTip | null>(null);

  // placeHelpTip is the repo's one placer (see TourOverlay's docblock); a
  // second one would be the drift it warns about.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    setPlaced(
      placeHelpTip({
        trigger: rect,
        panel: { width: card.offsetWidth, height: card.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        prefer: 'bottom',
      })
    );
  }, [rect]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (cardRef.current && event.target instanceof Node && cardRef.current.contains(event.target)) {
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-label={COPY.lockedTitle}
      style={{
        position: 'fixed',
        top: placed?.top ?? 0,
        left: placed?.left ?? 0,
        visibility: placed ? 'visible' : 'hidden',
      }}
      className={`${CALLOUT_Z} w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-stroke-default bg-bg-elevated p-4 shadow-xl`}
    >
      <p className="text-sm font-semibold text-content-primary">{COPY.lockedTitle}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-content-secondary">{COPY.lockedBody}</p>
      <div className="mt-4 flex justify-end">
        <Button size="md" className="min-h-11" onClick={onCreate}>
          {COPY.lockedCta}
        </Button>
      </div>
    </div>
  );
}

function PlanChoiceDialog({
  onChoose,
  onClose,
}: {
  onChoose: (mode: FirstReleasePlanMode) => void;
  onClose: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-x-0 top-0 ${DIALOG_Z} flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-release-focus-title"
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-stroke-default bg-bg-elevated p-5 shadow-xl sm:p-6"
      >
        <h2 id="first-release-focus-title" className="font-display text-xl font-semibold text-content-primary">
          {COPY.choiceTitle}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-content-secondary">{COPY.choiceBody}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            ref={firstRef}
            type="button"
            onClick={() => onChoose('urgans')}
            className="motion-focus motion-press flex flex-col items-start gap-3 rounded-xl border border-stroke-default bg-bg-elevated p-4 text-left transition-colors hover:border-brand/50 hover:bg-bg-hover sm:p-5"
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand">
              <PlanIllustration className="h-7 w-7" />
            </span>
            <span className="flex items-center gap-2 font-display text-base font-semibold text-content-primary">
              {COPY.urgansTitle}
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                {COPY.recommended}
              </span>
            </span>
            <span className="text-sm leading-6 text-content-secondary">{PLANNER_ENABLED ? COPY.urgansBody : COPY.urgansBodyNoPlanner}</span>
          </button>
          <button
            type="button"
            onClick={() => onChoose('self')}
            className="motion-focus motion-press flex flex-col items-start gap-3 rounded-xl border border-stroke-default bg-bg-elevated p-4 text-left transition-colors hover:border-stroke-strong hover:bg-bg-hover sm:p-5"
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-bg-surface text-content-secondary">
              <BlankSheetIllustration className="h-7 w-7" />
            </span>
            <span className="font-display text-base font-semibold text-content-primary">
              {COPY.selfTitle}
            </span>
            <span className="text-sm leading-6 text-content-secondary">{COPY.selfBody}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
