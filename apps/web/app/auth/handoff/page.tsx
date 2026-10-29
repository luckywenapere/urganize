'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { isSafeNextPath } from '@/lib/email-confirmation';
import { parseHandoffHash } from '@/lib/legacy-host-handoff';

/**
 * Where an old host (app. or my.urganize.app) sends a signed-in visitor (lib/legacy-host-handoff.ts):
 * stores the session it was handed and opens the page they were on. Unlike
 * /auth/callback this is not a new sign-in, so it runs none of the sign-up,
 * invite or onboarding steps.
 */
export default function AuthHandoffPage() {
  const router = useRouter();

  useEffect(() => {
    const url = new URL(window.location.href);
    const nextParam = url.searchParams.get('next');
    const next = isSafeNextPath(nextParam) ? nextParam : '/';
    const handed = parseHandoffHash(window.location.hash);
    // The tokens leave the address bar and history straight away.
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);

    void (async () => {
      let signedIn = false;
      try {
        if (handed) {
          const { data, error } = await supabase.auth.setSession(handed);
          signedIn = !error && !!data.session;
        }
        if (!signedIn) signedIn = !!(await supabase.auth.getSession()).data.session;
      } catch {
        signedIn = false;
      }
      router.replace(signedIn ? next : `/auth?next=${encodeURIComponent(next)}`);
    })();
  }, [router]);

  return <LoadingScreen title="Opening Urganize" />;
}
