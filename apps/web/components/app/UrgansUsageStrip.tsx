'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { selectLiveTurnCount, useChappiStore } from '@/stores/useChappiStore';
import { isChappiEnabled } from '@/lib/chappi/config';
import { supabase } from '@/lib/supabase/client';
import { creditsLeftLine, creditsResetLine } from '@/lib/credits/copy';

// The assistant-usage indicator. One calm line above the topbar once a team has
// spent 80% of its monthly UrgAns actions, and nothing at all before that.
//
// SAME CONTRACT AS TeamTrialStrip, deliberately, because it occupies the same
// slot and the reasoning transfers wholesale: above the topbar rather than in it
// (the right cluster's width budget already overflows a 375px phone), calm (it
// states a number and does not escalate, redden or carry a warning icon), and
// NOT dismissible (dismissing hides the one thing that stops the ceiling being a
// surprise, which is the entire purpose).
//
// WHY ITS OWN ENDPOINT rather than another field on /api/subscription-status:
// that payload is cached for 20s client-side and 30s server-side, and this
// number changes on every assistant turn. A cached count would go stale exactly
// when it matters.
//
// WHY IT REFETCHES ON CONVERSATION ACTIVITY. Mounted in AppShell, this component
// survives navigation, so a mount-only fetch would answer once per full page
// load — and a heavy session could cross 80% and hit the ceiling without the
// warning ever appearing. Subscribing to the assistant store's turn count is the
// cheapest live signal available; the TTL below collapses bursts into one
// request. It over-triggers slightly (a deterministic chip costs no action but
// still appends a turn), which is the harmless direction.
//
// AND WHY THAT COSTS NOTHING FOR ALMOST EVERYONE: the first answer for an
// uncapped team is `limit: null`, which latches `noCeiling` and stops the
// component fetching for the rest of the session. Tier only changes through a
// checkout, which returns through /payment/callback and reloads the app. Today
// that is every team — no code path can write the capped tier yet.

const CHAPPI_ENABLED = isChappiEnabled();

/** How long a fetched count is reused. Short: the banner is a live-ish warning,
 *  and the request is one indexed count. */
const CACHE_TTL_MS = 15 * 1000;

type CreditsView = { total: number; resetsAt: string; low: boolean };

type UsageSnapshot = { used: number; limit: number | null; approaching: boolean; credits?: CreditsView };

type CacheEntry = { userId: string; snapshot: UsageSnapshot | null; fetchedAt: number };

let cache: CacheEntry | null = null;

async function fetchUsage(): Promise<UsageSnapshot | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;

    const response = await fetch('/api/urgans/usage', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    // 404 means the assistant flag is off server-side; 402 means the team is
    // walled and has a bigger banner already. Either way: no opinion.
    if (!response.ok) return null;

    const payload = (await response.json().catch(() => ({}))) as Partial<UsageSnapshot>;
    if (typeof payload.used !== 'number') return null;

    const rawCredits = (payload as { credits?: Partial<CreditsView> }).credits;
    const credits: CreditsView | undefined =
      rawCredits && typeof rawCredits.total === 'number' && typeof rawCredits.resetsAt === 'string'
        ? { total: rawCredits.total, resetsAt: rawCredits.resetsAt, low: Boolean(rawCredits.low) }
        : undefined;

    return {
      used: payload.used,
      limit: typeof payload.limit === 'number' ? payload.limit : null,
      approaching: Boolean(payload.approaching),
      ...(credits ? { credits } : {}),
    };
  } catch {
    // Fail quiet. Null means "we do not know", and nothing renders on null.
    return null;
  }
}

export function UrgansUsageStrip() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  // Turns added this session. Opening a saved chat spends no action, so it
  // must not count as one (identical to messages.length with history off).
  const turnCount = useChappiStore(selectLiveTurnCount);

  const userId = user?.id ?? null;

  // Seeded from the module cache so a remount paints on the first frame rather
  // than popping the line in.
  const [usage, setUsage] = useState<UsageSnapshot | null>(() => {
    if (!userId || !cache || cache.userId !== userId) return null;
    if (Date.now() - cache.fetchedAt >= CACHE_TTL_MS) return null;
    return cache.snapshot;
  });

  // Latched once we learn this team has no ceiling. A ref, not state: flipping
  // it must not re-render, and it is read inside the effect that sets it.
  const noCeiling = useRef(false);

  useEffect(() => {
    if (!CHAPPI_ENABLED) return;
    if (isAuthLoading || !isAuthenticated || !userId) return;
    // Curator-only accounts have no team, no billing and no assistant.
    if (String(user?.role || '').toLowerCase() === 'curator') return;
    if (noCeiling.current) return;

    let cancelled = false;
    void (async () => {
      const fresh = cache && cache.userId === userId && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
      const snapshot = fresh ? cache!.snapshot : await fetchUsage();
      if (!fresh) cache = { userId, snapshot, fetchedAt: Date.now() };
      // A credit balance changes on every turn, so it never latches: only a team
      // with neither a ceiling nor credits is done being asked.
      if (snapshot && snapshot.limit === null && !snapshot.credits) noCeiling.current = true;
      if (!cancelled) setUsage(snapshot);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isAuthenticated, userId, user?.role, turnCount]);

  if (!CHAPPI_ENABLED) return null;

  // Credits replace the action count. Calm, like the line below: it says how many
  // are left and when they come back, and it stays quiet until they run low.
  if (usage?.credits) {
    if (!usage.credits.low) return null;
    const credits = Math.max(0, usage.credits.total);
    return (
      <div className="flex items-center justify-center gap-3 border-b border-stroke-subtle bg-bg-surface px-4 py-2 text-center">
        <p className="text-sm text-content-secondary">
          <span className="font-medium text-content-primary">{creditsLeftLine(credits)}</span>{' '}
          {creditsResetLine(credits, usage.credits.resetsAt)}
        </p>
        <Link
          href="/locked?intent=upgrade"
          className="shrink-0 text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          See plans
        </Link>
      </div>
    );
  }

  if (!usage || usage.limit === null || !usage.approaching) return null;

  const left = Math.max(0, usage.limit - usage.used);
  const atCeiling = left === 0;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-stroke-subtle bg-bg-surface px-4 py-2 text-center">
      <p className="text-sm text-content-secondary">
        <span className="font-medium text-content-primary">
          {atCeiling
            ? 'You have used this month’s UrgAns actions.'
            : `UrgAns: ${left} ${left === 1 ? 'action' : 'actions'} left this month.`}
        </span>{' '}
        {atCeiling
          ? 'Quick commands still work, and your actions reset on your billing day.'
          : 'They reset on your billing day.'}
      </p>
      <Link
        href="/locked?intent=upgrade"
        className="shrink-0 text-sm font-medium text-brand underline-offset-4 hover:underline"
      >
        See plans
      </Link>
    </div>
  );
}
