'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { lockBodyScroll } from '@/lib/body-scroll-lock';
import {
  ROLLOUT_OFFER_COPY as COPY,
  planChoiceForMode,
  type RolloutPlanMode,
} from '@/lib/rollout-offer';
import { useShellStore } from '@/stores/useShellStore';

import { EmptyRolloutPreview, PLAN_OPTION_CARD, UrgansPlanPreview } from './PlanOptionPreview';

const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';

/** Level with the create modal (z-[220]), which it never overlaps because it
 *  closes before opening that. */
const DIALOG_Z = 'z-[220]';

/**
 * The plan choice: UrgAns plans it, or plan it myself. Reusable: any rollout
 * offer opens it through `useShellStore.openPlanChoice` and the one copy
 * mounted in AppShell (PlanChoiceHost below) answers. Choosing opens the
 * shell's create modal past its own chooser, tagged origin 'hint'
 * (lib/rollout-origin.ts), because an offer is what led here.
 *
 * Extracted from the first-rollout focus (removed 2026-10-24), which used to
 * open it by itself once per session.
 */
export function PlanChoiceDialog({
  onChoose,
  onClose,
}: {
  onChoose: (mode: RolloutPlanMode) => void;
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
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-choice-title"
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-stroke-default bg-bg-elevated p-5 shadow-xl sm:p-6"
      >
        <h2 id="plan-choice-title" className="font-display text-xl font-semibold text-content-primary">
          {COPY.choiceTitle}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-content-secondary">{COPY.choiceBody}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            ref={firstRef}
            type="button"
            onClick={() => onChoose('urgans')}
            className={`${PLAN_OPTION_CARD} hover:border-brand/50`}
          >
            <UrgansPlanPreview planner={PLANNER_ENABLED} />
            <span className="flex items-center gap-2 font-display text-base font-semibold text-content-primary">
              {COPY.urgansTitle}
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                {COPY.recommended}
              </span>
            </span>
            <span className="text-sm leading-6 text-content-secondary">
              {PLANNER_ENABLED ? COPY.urgansBody : COPY.urgansBodyNoPlanner}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChoose('self')}
            className={`${PLAN_OPTION_CARD} hover:border-stroke-strong`}
          >
            <EmptyRolloutPreview />
            <span className="font-display text-base font-semibold text-content-primary">{COPY.selfTitle}</span>
            <span className="text-sm leading-6 text-content-secondary">{COPY.selfBody}</span>
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="motion-focus min-h-11 rounded-full px-4 text-sm font-medium text-content-secondary hover:text-content-primary"
          >
            {COPY.notNow}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The one mounted copy (AppShell). Renders nothing until an offer opens it. */
export function PlanChoiceHost() {
  const open = useShellStore((state) => state.planChoiceOpen);
  const artistId = useShellStore((state) => state.planChoiceArtistId);
  const close = useShellStore((state) => state.closePlanChoice);
  const openCreate = useShellStore((state) => state.openCreate);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <PlanChoiceDialog
      onClose={close}
      onChoose={(mode) => {
        close();
        openCreate(planChoiceForMode(mode), { origin: 'hint', artistId });
      }}
    />,
    document.body
  );
}
