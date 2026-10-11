'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { publicProfileUrl } from '@/lib/profile-growth';
import { ShareProfileLink } from './ShareProfileLink';

// "This is my page. Let me send it." (2026-10-11)
//
// The public page is server-rendered with no session, because sessions in
// this app live in the browser, not in a cookie the server can read. So the
// owner check happens here, after the page has drawn: only a signed-in reader
// asks, with one call to their OWN profile (/api/claim-profile, which reads by
// the caller's user id and never by anything in the request), and the share
// row appears only when that profile's slug is this page's slug.
//
// A stranger, and everyone signed out, sees nothing and costs no request. No
// user id is ever put into the page's HTML.

export function OwnProfileShare({ slug }: { slug: string }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await fetch('/api/claim-profile', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as {
          profile?: { slug?: unknown; visibility?: unknown } | null;
        } | null;
        const mine = body?.profile;
        if (cancelled || !mine || mine.slug !== slug || mine.visibility !== 'public') return;
        setUrl(publicProfileUrl(window.location.origin, slug));
      } catch {
        // Not shown. The page itself is unaffected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, slug]);

  if (!url) return null;
  return (
    <div className="mt-12 rounded-xl px-4 py-2" style={{ border: '1px solid var(--kit-border)' }}>
      <ShareProfileLink url={url} surface="own_page" tone="kit" />
    </div>
  );
}
