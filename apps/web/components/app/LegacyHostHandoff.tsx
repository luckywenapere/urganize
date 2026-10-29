'use client';

import { useEffect, useState } from 'react';
import { LoadingScreen } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { isLegacyAppHost } from '@/lib/app-hosts';
import { buildHandoffUrl } from '@/lib/legacy-host-handoff';

/**
 * On app.urganize.app, moves the visitor to my.urganize.app, signed in if they
 * were signed in here. Renders nothing anywhere else. See
 * lib/legacy-host-handoff.ts for why the old host still serves the app.
 */
export function LegacyHostHandoff() {
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!isLegacyAppHost(window.location.hostname)) return;
    setMoving(true);
    const { pathname, search, hash } = window.location;
    let cancelled = false;
    void (async () => {
      let session = null;
      try {
        // getSession() refreshes an expired access token first, so the new
        // host is handed one that still works.
        session = (await supabase.auth.getSession()).data.session;
      } catch {
        // No session to carry: the visitor signs in on the new host.
      }
      if (cancelled) return;
      window.location.replace(buildHandoffUrl({ pathname, search, hash }, session));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!moving) return null;
  return (
    <div className="fixed inset-0 z-[2147483647] bg-bg-base">
      <LoadingScreen />
    </div>
  );
}
