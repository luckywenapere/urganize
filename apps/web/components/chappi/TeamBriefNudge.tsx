'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { isTeamBriefEmpty, isTeamBriefEnabled, type TeamBrief } from '@/lib/team-brief';
import {
  dismissNudge,
  readNudgeState,
  recordNudgeShown,
  shouldShowTeamBriefNudge,
} from '@/lib/team-brief-nudge';

/**
 * "UrgAns doesn't know your team yet." — the Phase 3 nudge.
 *
 * Renders in the conversation once UrgAns has answered in a team whose brief
 * is empty. One line, one link to the editor, one dismiss. Dismissal is
 * permanent; otherwise it stops by itself after a few sessions (the cap in
 * lib/team-brief-nudge.ts).
 *
 * The emptiness check is a client-side GET of /api/workspace/brief rather
 * than a field on the agent response, deliberately: the agent route has three
 * response shapes (agent / deterministic / confirmation) and the nudge must
 * work in DETERMINISTIC mode too — a team with no model configured is exactly
 * the team that has not filled anything in yet. The answer is cached in
 * sessionStorage so the dock and rail remounting does not refetch it, and no
 * fetch happens at all once the nudge is capped or dismissed.
 */

const EMPTY_CACHE_KEY = 'urganize.chappi.brief-empty';

function readCachedEmptiness(): boolean | null {
  try {
    const raw = window.sessionStorage.getItem(EMPTY_CACHE_KEY);
    return raw === null ? null : raw === '1';
  } catch {
    return null;
  }
}

function cacheEmptiness(empty: boolean): void {
  try {
    window.sessionStorage.setItem(EMPTY_CACHE_KEY, empty ? '1' : '0');
  } catch {
    // Nothing lost: the next mount refetches.
  }
}

export function TeamBriefNudge() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isTeamBriefEnabled()) return;
    if (!shouldShowTeamBriefNudge(readNudgeState())) return;

    let cancelled = false;

    const show = () => {
      if (cancelled) return;
      recordNudgeShown();
      setVisible(true);
    };

    const cached = readCachedEmptiness();
    if (cached !== null) {
      if (cached) show();
      return;
    }

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch('/api/workspace/brief', {
          headers: { Authorization: `Bearer ${token}` },
        });
        // 404 = feature off server-side or no team; either way, no nudge —
        // pointing someone at an editor that will not render is worse than
        // saying nothing.
        if (!res.ok) return;
        const brief = (await res.json()) as TeamBrief;
        const empty = isTeamBriefEmpty(brief.entries);
        cacheEmptiness(empty);
        if (empty) show();
      } catch {
        // A failed read means no nudge this session. Silence is the right
        // failure for a hint.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-stroke-default bg-bg-surface px-3 py-2"
    >
      <p className="min-w-0 text-xs text-content-secondary">
        UrgAns doesn&apos;t know your team yet.{' '}
        <Link
          href="/settings?tab=workspace"
          className="motion-focus font-medium text-brand underline-offset-2 hover:underline"
        >
          Tell it once
        </Link>{' '}
        and it stops asking.
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          dismissNudge();
          setVisible(false);
        }}
        className="motion-focus shrink-0 rounded-md p-1 text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
