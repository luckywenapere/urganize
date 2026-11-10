'use client';

// A released song's smart link (Nov 2026, #1090 and #1092, mocks
// docs/mocks/release-day-auto-link and docs/mocks/out-now-placement). The same
// box on the Out now card on Home, on the artist page under Out now, and at
// the top of the rollout.
//
// Tapping the box copies the link (founder call, 2026-11-10, #1160). The Copy
// and Share buttons inside it were removed; the link swaps to "Link copied"
// for a moment so the tap is still seen.
//
// useReleaseSmartLink reads the link for a released rollout. It shows nothing
// while there is none: the link is made in the background.

import { useEffect, useState } from 'react';
import { Check } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { copyText } from '@/lib/share-file';
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

  const label = url.replace(/^https?:\/\//, '');
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy the link to ${title}: ${label}`}
        className="motion-focus motion-press flex h-11 w-full items-center gap-2 rounded-xl border border-stroke-default bg-bg-base px-3 text-left hover:bg-bg-hover"
      >
        {copied ? (
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px] font-semibold text-brand">
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Link copied
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-content-secondary">{label}</span>
        )}
      </button>
      {/* Outside the button: its aria-label would hide a status inside it. */}
      <span role="status" className="sr-only">
        {copied ? 'Link copied' : ''}
      </span>
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
