'use client';

import { BillingSection } from '../BillingSection';

/**
 * The plan and the trial, in one place. Deliberately status plus one button:
 * choosing a plan and paying stay on /locked, which already carries the money
 * flow and the paywall variants, and rebuilding that inside a pop-up would touch
 * the highest-risk code in the app for no gain. That button closes the pop-up on
 * its way out, because /locked is a different page.
 */
export function BillingSegment() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <BillingSection />
    </div>
  );
}
