'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/** The address this page is on, read in the browser. Null while the server
 *  renders, so a link built from it starts relative and settles after load
 *  without a hydration mismatch (#1378). */
export function useHost(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => window.location.host,
    () => null
  );
}
