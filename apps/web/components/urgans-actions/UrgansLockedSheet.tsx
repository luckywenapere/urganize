'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Lock, X } from '@/components/icons';
import { Button } from '@urganize/ui';

import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { trackUpgradeClicked } from '@/lib/urgans-actions/client';

/**
 * The sheet a Solo team sees when an embedded UrgAns action refuses them —
 * the entitlement gate's UI, one action-type-agnostic surface for every
 * refusal that carries `reason: 'plan_required'`.
 *
 * PORTAL TO document.body (the DeleteReleaseDialog rule): every trigger for
 * this sheet lives deep inside AppShell's `lazy-fade` subtree, whose
 * transform breaks `position: fixed` for any descendant.
 *
 * BOTTOM SHEET BELOW sm, centered above it — the TaskOutcomeSheet contract:
 * lockBodyScroll while open, swipe-to-dismiss on mobile, and deliberately NO
 * Escape handler. This can open from inside the plan review scene, which
 * itself sits inside chrome that may already own Escape elsewhere in the
 * tree; a second window listener risks closing two things on one keypress,
 * so the X and the backdrop are the only ways out here, matching the sheet
 * this one is modelled on.
 */

export type UrgansLockedSheetProps = {
  open: boolean;
  /** The server's OWN refusal string, verbatim — never reworded here. It
   *  names the actual action and the actual minimum plan
   *  (minimumTierWith), so it can never go stale against a re-cut tier. */
  message: string;
  actionType: string;
  onClose: () => void;
};

const SWIPE_DISMISS_PX = 80;

export function UrgansLockedSheet({ open, message, actionType, onClose }: UrgansLockedSheetProps) {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartYRef = useRef<number | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // Fresh every open, so a stale drag from a previous sheet never survives:
  // this component is mounted unconditionally at the bottom of WorkspaceView
  // and never actually unmounts between opens, so a swipe that dismissed a
  // PREVIOUS message without crossing the drag threshold would otherwise
  // leave the next open flashing mid-transform for one frame. (A render-time
  // ref comparison was tried here instead of this effect, to dodge the
  // set-state-in-effect warning below — this repo's react-hooks/refs rule
  // is an ERROR, not a warning, and rejects reading/writing `.current`
  // during render even for React's own documented "adjust state when a prop
  // changes" pattern. The effect stays.)
  useEffect(() => {
    if (open) setDragOffset(0);
  }, [open]);

  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open && isMounted, panelRef, { onBackClose: onClose });

  if (!open || !isMounted) return null;

  const handleUpgrade = () => {
    void trackUpgradeClicked(actionType);
    onClose();
    // TeamWall already treats this intent as a deliberate visit rather than
    // bouncing straight back to the app.
    router.push('/locked?intent=upgrade');
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    dragStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (dragStartYRef.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - dragStartYRef.current;
    setDragOffset(Math.max(0, delta));
  };

  const handleTouchEnd = () => {
    dragStartYRef.current = null;
    if (dragOffset > SWIPE_DISMISS_PX) {
      onClose();
      return;
    }
    setDragOffset(0);
  };

  const sheet = (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI is not available on your plan"
        className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border-t border-stroke-strong bg-bg-surface shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] sm:rounded-2xl sm:border"
        style={
          dragOffset > 0
            ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
            : { transform: 'translateY(0)', transition: 'transform 180ms var(--motion-out)' }
        }
      >
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="shrink-0 px-5 pt-3 sm:px-6"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stroke-strong sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-brand">
              <Lock className="h-4 w-4" aria-hidden="true" />
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="motion-focus motion-press grid h-9 w-9 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
          <h2 className="font-display text-xl text-content-primary">{message}</h2>
          <p className="mt-2 text-sm leading-6 text-content-secondary">
            Everything else on your plan keeps working as it does today.
          </p>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} className="justify-center">
              Not now
            </Button>
            <Button type="button" onClick={handleUpgrade} className="justify-center">
              Upgrade
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
