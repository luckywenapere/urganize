'use client';

import { useEffect, useRef } from 'react';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { profileViewedProperties } from '@/lib/directory-events';

/**
 * Reports that a public profile page was opened (`profile_viewed`).
 *
 * Browser side, like the press kit's view beacon: a crawler that never runs
 * scripts does not inflate the number, and a tracking call has no business
 * sitting between a reader and the page appearing. The properties come from the
 * allowlist in lib/directory-events.ts: a role from the fixed list and whether
 * the profile is claimed. No name, no slug, nothing a person typed.
 *
 * A ref guards React's development double invoke so one visit is one view.
 */
export function ProfileViewBeacon({ roles, claimed }: { roles: string[]; claimed: boolean }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    captureAnalyticsEvent(createPostHogEvent('profile_viewed', profileViewedProperties({ roles, claimed })));
    // Fires once per mount, whatever the props do afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
