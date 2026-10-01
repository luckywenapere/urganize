'use client';

import { useSyncExternalStore } from 'react';

import { isIOSApp } from '@/lib/platform';

/**
 * Whether this screen may show anything that leads to buying or upgrading.
 *
 * Apple's rules (3.1.1 and 3.1.3) bar an iOS app from pointing people at a
 * payment, so inside the iPhone app every upgrade link, "Activate your plan"
 * button, "See plans" link and price stays hidden. The website, Android and
 * the browser are unchanged.
 *
 * It reads the shell's description through useSyncExternalStore so the first
 * server and hydration render agree (both say "allowed") and the iPhone app
 * corrects itself right after, with no hydration mismatch and no
 * set-state-in-effect.
 *
 * The screens that ARE the wall (/locked, the team wall, /start-trial) do not
 * use this: they render a different, link-free body on iOS instead of hiding
 * single controls.
 */
const subscribe = () => () => {};
const serverSnapshot = () => false;

export function usePurchasePromptsAllowed(): boolean {
  const insideIOSApp = useSyncExternalStore(subscribe, isIOSApp, serverSnapshot);
  return !insideIOSApp;
}
