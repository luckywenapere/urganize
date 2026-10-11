'use client';

import { memo } from 'react';
import { BillingSection } from '../BillingSection';

/**
 * The plan and the trial, in one place. Deliberately status plus one button:
 * choosing a plan and paying stay on /locked, which already carries the money
 * flow and the paywall variants, and rebuilding that inside a pop-up would touch
 * the highest-risk code in the app for no gain. That button closes the pop-up on
 * its way out, because /locked is a different page.
 */
function BillingSegmentView() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <BillingSection />
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
export const BillingSegment = memo(BillingSegmentView);
