'use client';

import { useAuthStore } from '@/lib/auth-store';
import { canDeleteRollouts } from '@/lib/settings-nav';
import { DeleteAccountSection } from '../DeleteAccountSection';
import { ReleasesSection } from '../ReleasesSection';
import { SecuritySection } from '../SecuritySection';

/**
 * Your password, then the danger zone.
 *
 * Every irreversible action in Settings lives in the one clearly separated block
 * at the bottom: deleting rollouts (the only place a real one can be deleted,
 * URG-163) and deleting the account. Nothing destructive sits beside an everyday
 * setting any more. Log out is not here; it is pinned to the foot of the pop-up's
 * list so it is one tap from any segment.
 */
export function SecuritySegment() {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <div>
      <SecuritySection />
      <div className="mt-2 border-t border-stroke-subtle pt-6">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-status-error">
          Danger zone
        </h2>
        <p className="mt-1 text-sm text-content-secondary">These can&apos;t be undone.</p>
        <div className="mt-2 divide-y divide-stroke-subtle">
          {canDeleteRollouts(role) ? <ReleasesSection /> : null}
          <DeleteAccountSection />
        </div>
      </div>
    </div>
  );
}
