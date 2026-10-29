'use client';

// The smart link task's panel (Oct 29, 2026, #850). Every new plan holds a
// "Set up and share your smart link" task; opening it shows the link itself,
// ready to copy or share, and the way into Distribute where the link and its
// numbers live. The GET is the same one the Smart link view makes, so opening
// the task also makes the link if the rollout is ready.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { copyText, shareTextToApps } from '@/lib/share-file';
import { smartLinkPhase } from '@/lib/altlink/rules';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

type View = {
  enabled: boolean;
  link: { url: string | null; status: string; releaseDate: string | null } | null;
  facts: { title: string | null; releaseDate: string | null };
  notReady: string | null;
};

const NOT_READY: Record<string, string> = {
  no_date: 'Set a release date and the link makes itself.',
  no_title: 'Name the rollout and the link makes itself.',
  no_artist: 'Add the artist and the link makes itself.',
  no_code: 'The song is out, so the link needs its UPC or ISRC. Add one in the details.',
};

const BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors';

export function SmartLinkTaskPanel({ releaseId }: { releaseId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  // The clock the phase is read against, set when the view lands (not in render).
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch(`/api/releases/${releaseId}/altlink`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        });
        if (!response.ok) throw new Error('load');
        const body = (await response.json()) as { view: View };
        if (!cancelled) {
          setNow(Date.now());
          setView(body.view);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  const href = (tab: 'link' | 'numbers') => `/dashboard/distribute/${encodeURIComponent(releaseId)}?tab=${tab}`;

  if (failed || (view && !view.enabled)) return null;
  if (!view) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="h-10 w-full" />
      </div>
    );
  }

  const releaseDate = view.link?.releaseDate ?? view.facts.releaseDate;
  const phase = smartLinkPhase(view.link, releaseDate, now);
  const url = phase === 'presave' || phase === 'released' ? view.link?.url ?? null : null;

  const copy = async () => {
    if (!url) return;
    if (await copyText(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };
  const share = async () => {
    if (!url) return;
    const title = view.facts.title ?? 'New music';
    const text = phase === 'released' ? `${title} is out now. Listen: ${url}` : `Pre-save ${title}: ${url}`;
    if ((await shareTextToApps({ text, title })) === 'unsupported') await copy();
  };

  return (
    <section className="rounded-[24px] border border-stroke-default bg-bg-elevated/50 p-4">
      <h3 className="text-sm font-semibold text-content-primary">Your smart link</h3>
      {url ? (
        <>
          <p className="mt-1 text-sm text-content-secondary">
            Fans tap once and the song lands in their library on release day. Share it everywhere the artist posts.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-stroke-control bg-bg-base px-3 py-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate font-mono text-sm text-content-primary hover:underline"
            >
              {url.replace(/^https?:\/\//, '')}
            </a>
            <button
              type="button"
              onClick={() => void copy()}
              className="motion-focus inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void share()} className={`${BUTTON} bg-brand text-content-inverse hover:bg-brand-hover`}>
              Share link
            </button>
            <Link href={href('numbers')} className={`${BUTTON} border border-stroke-control text-content-primary hover:bg-bg-hover`}>
              See the numbers
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-content-secondary" role="status">
            {phase === 'creating'
              ? 'Making your smart link now.'
              : phase === 'failed'
                ? 'The link was not made. Open it to try again.'
                : (view.notReady && NOT_READY[view.notReady]) ?? 'The link makes itself once the rollout is ready.'}
          </p>
          <Link href={href('link')} className={`${BUTTON} mt-3 border border-stroke-control text-content-primary hover:bg-bg-hover`}>
            Open smart link
          </Link>
        </>
      )}
    </section>
  );
}
