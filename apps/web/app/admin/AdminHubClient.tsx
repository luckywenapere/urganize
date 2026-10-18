'use client';

// /admin, the one-screen Overview (2026-10-18, URG-369; the founder approved
// the mock: "Perfect"). Replaces the founder cockpit's long stack: every panel
// it had moved, not deleted, to the page it belongs to (components/admin/
// CockpitSlot.tsx lists where each went).
//
// The gate is GET /api/admin/me (verifyAdmin / ADMIN_EMAILS); anyone else
// bounces to /dashboard, the same shape as the other admin page clients. The
// numbers come from GET /api/admin/overview, read again every 60 seconds while
// the tab is on screen (and at once on coming back to it if they are older),
// with "Updated Xs ago" in the header. A failed refresh keeps the last numbers
// and says "Couldn't refresh"; a failed first load says so in place of them.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { ADMIN_SECTIONS } from '@/lib/admin-sections';
import { updatedAgo, type AdminOverview } from '@/lib/admin-overview';
import { AdminOverviewSkeleton, AdminOverviewView } from '@/components/admin/AdminOverviewView';
import { Card, cn } from '@/components/admin/ui';

/** How often the numbers reload while the page is visible. */
export const OVERVIEW_REFRESH_MS = 60 * 1000;
/** How often "Updated Xs ago" moves. */
const TICK_MS = 5 * 1000;

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export default function AdminHubClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [checked, setChecked] = useState(false);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const loadedAt = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        setChecked(true);
      } catch {
        if (!cancelled) router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
        cache: 'no-store',
      });
      const body = (await response.json().catch(() => ({}))) as { overview?: AdminOverview; error?: string };
      if (!response.ok || !body.overview) {
        setError(body.error || "Couldn't load the overview.");
        return;
      }
      setOverview(body.overview);
      setError(null);
      loadedAt.current = Date.now();
      setUpdatedAt(new Date(loadedAt.current).toISOString());
      setNow(new Date());
    } catch {
      setError("Couldn't load the overview.");
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!checked) return;
    void load();
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - loadedAt.current < OVERVIEW_REFRESH_MS - 1000) return;
      void load();
    };
    const timer = window.setInterval(refreshIfStale, OVERVIEW_REFRESH_MS);
    const ticker = window.setInterval(() => setNow(new Date()), TICK_MS);
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(ticker);
      document.removeEventListener('visibilitychange', refreshIfStale);
    };
  }, [checked, load]);

  const stale = Boolean(error && overview);

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold text-content-primary">Overview</h1>
        {checked && (updatedAt || stale) ? (
          <p className="flex items-center gap-2 pb-1 font-mono text-xs text-content-tertiary" aria-live="polite">
            <span
              aria-hidden="true"
              className={cn('h-2 w-2 rounded-full', stale ? 'bg-status-error' : 'bg-brand')}
            />
            {stale ? (
              <span className="text-status-error">Couldn&apos;t refresh</span>
            ) : null}
            <span>{updatedAgo(updatedAt, now)}</span>
          </p>
        ) : null}
      </div>

      {!checked || (!overview && !error) ? (
        <AdminOverviewSkeleton />
      ) : overview ? (
        <AdminOverviewView overview={overview} dashboards={ADMIN_SECTIONS.length} />
      ) : (
        <Card role="alert" className="mt-6 p-4 text-sm text-content-secondary">
          {error}
        </Card>
      )}
    </div>
  );
}
