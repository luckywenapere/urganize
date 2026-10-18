'use client';

// The cockpit's panels, in the pages they moved to (2026-10-18, URG-369).
//
// The old Overview stacked every panel GET /api/admin/cockpit returns. The
// slimmed Overview keeps only the day-to-day numbers, and each panel moved,
// not deleted, to the page it belongs to: the trend chart, activation, time to
// first rollout, week 4 retention, churn and the team growth % to Scoreboard;
// the sign-up funnel to Metrics; the UrgAns panel to UrgAns actions; the
// Directory tile to Directory; the persona split to Onboarding; runway to More.
//
// Each of those pages renders one <CockpitSlot> that reads the same route
// (whose big read is shared and cached for a minute on the server), so the
// panels show exactly the numbers they showed on the Overview. The host page
// keeps its own gate: this only ever loads after it, and a failure shows one
// quiet line and never hides the page.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { FounderCockpit } from '@/lib/founder-cockpit';
import type { AdminFunnel } from '@/lib/admin-funnel';
import type { UrgansUsage } from '@/lib/admin-urgans-usage';
import type { DirectoryTile } from '@/lib/directory-growth';
import type { PersonaSplit } from '@/lib/admin-persona-split';
import type { ChurnSummary } from '@/lib/admin-churn';
import type { Runway } from '@/lib/admin-runway';
import type { AdminReadSource } from '@/lib/admin-read-server';
import { Skeleton } from '@/components/admin/ui';

export type CockpitPayload = {
  cockpit: FounderCockpit;
  funnels: AdminFunnel[];
  urgans: UrgansUsage | null;
  directory: DirectoryTile | null;
  personas: PersonaSplit | null;
  churn: ChurnSummary | null;
  runway: Runway | null;
  runwayReadable: boolean;
  ourTeamsLeftOut: number;
  sources: AdminReadSource[];
};

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: CockpitPayload };

async function token(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export function useCockpit(): { state: State; reload: () => Promise<void> } {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    try {
      const response = await fetch('/api/admin/cockpit', {
        headers: { Authorization: `Bearer ${await token()}` },
        cache: 'no-store',
      });
      const body = (await response.json().catch(() => ({}))) as Partial<CockpitPayload> & { error?: string };
      if (isCancelled()) return;
      if (!response.ok || !body.cockpit) {
        setState({ status: 'error', message: body.error || "Couldn't load these numbers." });
        return;
      }
      setState({
        status: 'ready',
        payload: {
          cockpit: body.cockpit,
          funnels: body.funnels ?? [],
          urgans: body.urgans ?? null,
          directory: body.directory ?? null,
          personas: body.personas ?? null,
          churn: body.churn ?? null,
          runway: body.runway ?? null,
          runwayReadable: body.runwayReadable !== false,
          ourTeamsLeftOut: body.ourTeamsLeftOut ?? 0,
          sources: body.sources ?? [],
        },
      });
    } catch {
      if (!isCancelled()) setState({ status: 'error', message: "Couldn't load these numbers." });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { state, reload: () => load() };
}

/** Renders `children(payload)` once the cockpit has loaded; a skeleton before, one line on failure. */
export function CockpitSlot({
  children,
  label,
  skeletonClassName = 'h-40',
}: {
  children: (payload: CockpitPayload, reload: () => Promise<void>) => ReactNode;
  /** What is loading, for screen readers ("the trends"). */
  label: string;
  skeletonClassName?: string;
}) {
  const { state, reload } = useCockpit();
  if (state.status === 'loading') {
    return (
      <div role="status" aria-busy="true" aria-label={`Loading ${label}`} className="mt-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className={`mt-3 w-full rounded-2xl ${skeletonClassName}`} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="mt-8 text-sm text-content-secondary">
        {state.message}
      </p>
    );
  }
  return <>{children(state.payload, reload)}</>;
}
