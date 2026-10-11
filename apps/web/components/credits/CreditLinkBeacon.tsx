'use client';

import { useEffect, useRef } from 'react';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { creditLinkOpenedProperties } from '@/lib/profile-growth';

/**
 * Reports that a public credit link was opened (`credit_link_opened`), the
 * first step of the profile growth loop (2026-10-11).
 *
 * Browser side on purpose: these links are pasted into WhatsApp, which fetches
 * the page on the server for its preview before anyone has read it, and a
 * crawler that runs no script is not a person. Only whether the link is still
 * open leaves; no token, no release, no name. A ref guards React's development
 * double invoke.
 */
export function CreditLinkBeacon({ closed }: { closed: boolean }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    captureAnalyticsEvent(createPostHogEvent('credit_link_opened', creditLinkOpenedProperties({ closed })));
    // Fires once per mount, whatever the props do afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
