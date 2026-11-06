'use client';

// A released song's smart link with Copy and Share inside the box (Nov 2026,
// #1090 and #1092, mocks docs/mocks/release-day-auto-link and
// docs/mocks/out-now-placement). The same box on the Out now card on Home, on
// the artist page under Out now, and at the top of the rollout.
//
// useReleaseSmartLink reads the link for a released rollout. It shows nothing
// while there is none: the link is made in the background.

import { useEffect, useState } from 'react';
import { Check, Share } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { copyText, shareTextToApps } from '@/lib/share-file';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { isAltlinkEnabled } from '@/lib/altlink/rules';

const ALTLINK_ENABLED = isAltlinkEnabled();

export function SmartLinkBox({
  url,
  title,
  releaseId,
  className = '',
}: {
  url: string;
  title: string;
  releaseId: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    captureAnalyticsEvent({ name: 'out_now_link_copied', properties: { release_id: releaseId } });
    if (await copyText(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const share = async () => {
    captureAnalyticsEvent({ name: 'out_now_link_shared', properties: { release_id: releaseId } });
    const outcome = await shareTextToApps({ text: `${title} is out now. Listen: ${url}`, title });
    if (outcome === 'unsupported') await copy();
  };

  return (
    <div className={`flex items-center gap-1 rounded-xl border border-stroke-default bg-bg-base py-1 pl-3 pr-1 ${className}`}>
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-content-secondary">{url.replace(/^https?:\/\//, '')}</span>
      <button
        type="button"
        onClick={() => void copy()}
        className="hit-44 motion-focus inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-brand hover:bg-bg-hover"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        onClick={() => void share()}
        aria-label={`Share ${title}`}
        className="hit-44 motion-focus grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-secondary hover:bg-bg-hover hover:text-content-primary"
      >
        <Share className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The live smart link of a released rollout, or null while there is none. */
export function useReleaseSmartLink(releaseId: string | null, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!ALTLINK_ENABLED || !enabled || !releaseId) return;
    let live = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/altlink`, {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        });
        if (!response.ok) return;
        const body = (await response.json()) as { view?: { link?: { url?: string | null; status?: string } | null } };
        const link = body.view?.link;
        const next = link?.url && link.status !== 'failed' && /^https:\/\//i.test(link.url) ? link.url : null;
        if (live) setUrl(next);
      } catch {
        // No link shown is the safe answer.
      }
    })();
    return () => {
      live = false;
    };
  }, [releaseId, enabled]);
  return enabled ? url : null;
}
