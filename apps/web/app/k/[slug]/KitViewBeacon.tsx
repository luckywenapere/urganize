'use client';

import { useEffect, useRef } from 'react';

/**
 * Tell the server this kit was opened.
 *
 * A browser side beacon rather than a count taken during the server render,
 * for two reasons. A crawler that never runs scripts does not inflate the
 * number, which matters more here than on any other page in this product,
 * because a listed kit is the one thing search engines are invited to fetch.
 * And a tracking write has no business sitting between a reader and the page
 * appearing.
 *
 * A ref guards it so React's development double invoke does not record two
 * views for one visit. Every failure is swallowed: a view that went unrecorded
 * is not worth anything on the reader's screen.
 */
export function KitViewBeacon({ slug }: { slug: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch(`/api/k/${encodeURIComponent(slug)}/view`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => {});
  }, [slug]);

  return null;
}
