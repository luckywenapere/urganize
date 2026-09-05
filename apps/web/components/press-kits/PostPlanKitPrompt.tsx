'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Newspaper, X } from '@/components/icons';
import { authHeaders } from './press-kit-client';

/**
 * After a rollout plan is approved, offer to put the release on the artist's
 * press kit.
 *
 * The moment is chosen rather than convenient. Approving a plan is when a
 * manager has just decided a release is real and has its whole rollout in
 * front of them, which is exactly when the kit still pointing at last year's
 * single is worth knowing about. Nobody goes looking for a press kit six weeks
 * later of their own accord.
 *
 * OFFERED, NOT FORCED, and it does not intercept anything. No modal, no step
 * the manager has to answer before carrying on with what they were doing. That
 * is the same call the interview made in phase 3, and the opposite of the
 * compulsory post-create login step, which earns its interruption by being
 * about access.
 *
 * It renders NOTHING unless there is genuinely something to say: the kit has to
 * exist, and the roll in has to have real proposals. Sending somebody to a page
 * that turns out to have nothing for them is worse than staying quiet, which is
 * why this asks first rather than linking optimistically.
 */
export function PostPlanKitPrompt({
  artistId,
  artistName,
  onDismiss,
}: {
  artistId: string;
  artistName: string;
  onDismiss: () => void;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const headers = await authHeaders();
      if (!headers) return;
      try {
        const listed = await fetch('/api/press-kits', { headers, cache: 'no-store' });
        if (!listed.ok) return;
        const body = await listed.json();
        const entry = (Array.isArray(body.entries) ? body.entries : []).find(
          (item: { artistId?: string }) => item?.artistId === artistId
        );
        const kitId = entry?.kit?.id;
        // No kit yet is a quiet answer. Somebody who has never started one is
        // not in the middle of deciding whether to update it.
        if (!kitId) return;

        const rollout = await fetch(`/api/press-kits/${kitId}/rollout`, {
          headers,
          cache: 'no-store',
        });
        if (!rollout.ok) return;
        const proposals = (await rollout.json()).proposals;
        if (!cancelled && Array.isArray(proposals)) setCount(proposals.length);
      } catch {
        // A prompt nobody was shown costs nothing. The kit page carries the
        // same offer whenever they next open it.
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  if (count === 0) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
      <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-content-primary">
          {artistName}&apos;s press kit does not know about this yet.
        </p>
        <Link
          href={`/dashboard/press-kits/${artistId}`}
          className="motion-focus mt-2 inline-flex items-center rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-content-inverse"
        >
          Open the press kit
        </Link>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="motion-focus -m-1 shrink-0 rounded-md p-1 text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
