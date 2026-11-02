'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { selectLiveTurnCount, useChappiStore } from '@/stores/useChappiStore';
import { isChappiEnabled } from '@/lib/chappi/config';
import { supabase } from '@/lib/supabase/client';
import type { CreditAccount } from '@/lib/credits/allowance';

// The UrgAns usage read, shared by the banner above the topbar
// (UrgansUsageStrip) and the credits line under the chat box
// (ChappiConversation). One module cache and one in-flight request, so the two
// never ask the server twice for the same number.
//
// WHY ITS OWN ENDPOINT rather than another field on /api/subscription-status:
// that payload is cached for 20s client-side and 30s server-side, and this
// number changes on every assistant turn. A cached count would go stale exactly
// when it matters.
//
// WHY IT REFETCHES ON CONVERSATION ACTIVITY. The banner is mounted in AppShell
// and survives navigation, so a mount-only fetch would answer once per full page
// load. Subscribing to the assistant store's turn count is the cheapest live
// signal available; the TTL below collapses bursts into one request. It
// over-triggers slightly (a deterministic chip costs no action but still
// appends a turn), which is the harmless direction.
//
// A team with neither a ceiling nor credits latches `noCeiling` on its first
// answer and stops asking for the rest of the session. A credit balance changes
// on every turn, so a team on credits never latches.

const CHAPPI_ENABLED = isChappiEnabled();

/** How long a fetched count is reused when nothing has changed. 2 minutes since
 *  2026-11-02 (was 15s, #1039): every page and remount re-asked, and each ask
 *  is a Vercel function run. A new chat turn still re-reads at once (see
 *  lastTurnCount below), and anything else that spends credits calls
 *  invalidateUrgansUsage(). */
const CACHE_TTL_MS = 2 * 60 * 1000;

export type CreditsView = { total: number; account: CreditAccount; nextGrantAt: string | null; low: boolean };

const isAccount = (value: unknown): value is CreditAccount =>
  value === 'trial' || value === 'subscriber' || value === 'credits_only';

export type UsageSnapshot = { used: number; limit: number | null; approaching: boolean; credits?: CreditsView };

type CacheEntry = { userId: string; snapshot: UsageSnapshot | null; fetchedAt: number };

let cache: CacheEntry | null = null;
let inFlight: { userId: string; promise: Promise<UsageSnapshot | null> } | null = null;

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
      rawCredits && typeof rawCredits.total === 'number' && isAccount(rawCredits.account)
        ? {
            total: rawCredits.total,
            account: rawCredits.account,
            nextGrantAt: typeof rawCredits.nextGrantAt === 'string' ? rawCredits.nextGrantAt : null,
            low: Boolean(rawCredits.low),
          }
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

// Anything that just moved the balance outside a chat turn (a plan build, the
// press-kit draft) calls invalidateUrgansUsage(), so the credits pill in the
// header and the strip re-read instead of showing the old number for up to
// the cache window. 2026-10-11: after a plan was built the pill still showed
// the balance from before it.
const usageListeners = new Set<() => void>();

export function invalidateUrgansUsage(): void {
  cache = null;
  inFlight = null;
  for (const listener of usageListeners) listener();
}

/**
 * The cached answer when it is still fresh, else one shared request. For
 * readers outside the hook (useCreditBalance) so a page full of credit lines
 * asks the server once rather than once per line.
 */
export function readUrgansUsageShared(userId: string): Promise<UsageSnapshot | null> {
  if (cache && cache.userId === userId && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cache.snapshot);
  }
  return loadUsage(userId);
}

/** One request per user at a time, whoever asks. */
function loadUsage(userId: string): Promise<UsageSnapshot | null> {
  if (inFlight && inFlight.userId === userId) return inFlight.promise;
  const promise = fetchUsage().then((snapshot) => {
    cache = { userId, snapshot, fetchedAt: Date.now() };
    if (inFlight?.promise === promise) inFlight = null;
    return snapshot;
  });
  inFlight = { userId, promise };
  return promise;
}

/** The signed-in user's UrgAns usage, or null while unknown or switched off. */
export function useUrgansUsage(): UsageSnapshot | null {
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
  // The turn count the last read answered for. A new turn spends credits, so
  // it skips the cache instead of waiting out CACHE_TTL_MS.
  const lastTurnCount = useRef(turnCount);

  // Bumped by invalidateUrgansUsage(), which re-runs the read below.
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const listener = () => setRevision((value) => value + 1);
    usageListeners.add(listener);
    return () => {
      usageListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!CHAPPI_ENABLED) return;
    if (isAuthLoading || !isAuthenticated || !userId) return;
    // Curator-only accounts have no team, no billing and no assistant.
    if (String(user?.role || '').toLowerCase() === 'curator') return;
    if (noCeiling.current) return;

    let cancelled = false;
    void (async () => {
      const newTurn = turnCount !== lastTurnCount.current;
      lastTurnCount.current = turnCount;
      const fresh =
        !newTurn && cache && cache.userId === userId && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
      const snapshot = fresh ? cache!.snapshot : await loadUsage(userId);
      if (snapshot && snapshot.limit === null && !snapshot.credits) noCeiling.current = true;
      if (!cancelled) setUsage(snapshot);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isAuthenticated, userId, user?.role, turnCount, revision]);

  return CHAPPI_ENABLED ? usage : null;
}
