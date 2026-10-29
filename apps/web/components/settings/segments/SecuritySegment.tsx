'use client';

import { memo } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { canDeleteRollouts } from '@/lib/settings-nav';
import { DataExportSection } from '../DataExportSection';
import { DeleteAccountSection } from '../DeleteAccountSection';
import { ReleasesSection } from '../ReleasesSection';
import { SecuritySection } from '../SecuritySection';

/**
 * Your password, a copy of your data, then the danger zone.
 *
 * The data export moved here from Connections when that segment was retired
 * (#860, 2026-10-29). It sits just above the danger zone on purpose: take your
 * data, then decide.
 *
 * Every irreversible action in Settings lives in the one clearly separated block
 * at the bottom: deleting rollouts (the only place a real one can be deleted,
 * URG-163) and deleting the account. Nothing destructive sits beside an everyday
 * setting any more. Log out is not here; it is pinned to the foot of the pop-up's
 * list so it is one tap from any segment.
 */
function SecuritySegmentView() {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <div>
      <SecuritySection />
      <DataExportSection />
      <div className="mt-6 border border-status-error/40 bg-status-error/5 p-4 sm:p-5">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-status-error">
          Danger zone
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          A deleted rollout goes to Trash for 30 days. Deleting your account can&apos;t be undone.
        </p>
        <div className="mt-2 divide-y divide-stroke-subtle">
          {canDeleteRollouts(role) ? <ReleasesSection /> : null}
          <DeleteAccountSection />
        </div>
      </div>
    </div>
  );
}

/**
 * Memoised (2026-10-11): every segment opened in this visit stays mounted, and
 * the dialog re-renders on each keystroke in its search box and each dirty or
 * URL change, which used to re-render every one of them. Measured as a 304ms
 * INP on the Team segment. With stable props it now re-renders only when its
 * own inputs change.
 */
export const SecuritySegment = memo(SecuritySegmentView);
