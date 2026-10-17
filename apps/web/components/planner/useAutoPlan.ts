'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import {
  PLANNER_AUTO_POLL_MS,
  buildAutoPlanIntake,
  plannerAutoView,
  readPlannerAuto,
  type PlannerAutoState,
  type PlannerAutoView,
} from '@/lib/planner-auto';
import type { ReleasePlanIntake } from '@/lib/release-planning';

/**
 * The landing rollout's side of auto-plan (2026-10-17). Reads the build's
 * state off the rollout, polls GET /plan every few seconds while it runs, and
 * reloads the activities the moment the plan lands. "Try again" is POST /plan
 * with the intake the build saved (still the team's first plan, so free).
 */
type PlanPoll = {
  plan: unknown | null;
  intake: ReleasePlanIntake | null;
  auto: PlannerAutoState | null;
};

async function bearer(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function useAutoPlan(params: {
  releaseId: string | null;
  /** The rollout's metadata as the catalogue loaded it. */
  metadata: Record<string, unknown> | null | undefined;
  /** Facts for a retry when the build never saved its answers. */
  release: { releaseType?: string | null; artistName?: string | null; releaseDate?: string | null } | null;
  /** The rollout already shows activities: nothing to wait for. */
  hasActivities: boolean;
  /** Reload the rollout's activities. */
  onLanded: () => void;
}): {
  view: PlannerAutoView;
  startedAt: number | null;
  retrying: boolean;
  retry: () => void;
} {
  const { releaseId, metadata, release, hasActivities, onLanded } = params;
  const [polled, setPolled] = useState<{ releaseId: string; auto: PlannerAutoState | null; intake: ReleasePlanIntake | null } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;

  const fromRow = readPlannerAuto(metadata);
  const auto = polled && polled.releaseId === releaseId && polled.auto ? polled.auto : fromRow;
  const view: PlannerAutoView = !releaseId || hasActivities ? null : retrying ? 'generating' : plannerAutoView(auto, now);
  const startedAt = auto ? Date.parse(auto.started_at) || null : null;

  // Poll while the build runs; the clock tick is what turns a stale claim into "failed".
  useEffect(() => {
    if (!releaseId || view !== 'generating' || retrying) return;
    let cancelled = false;
    const poll = async () => {
      setNow(Date.now());
      try {
        const token = await bearer();
        if (!token || cancelled) return;
        const res = await fetch(`/api/releases/${releaseId}/plan`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json().catch(() => null)) as PlanPoll | null;
        if (!body || cancelled) return;
        if (body.plan) {
          landedRef.current();
          return;
        }
        setPolled({ releaseId, auto: body.auto ?? null, intake: body.intake ?? null });
      } catch {
        // A missed poll is retried on the next tick.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), PLANNER_AUTO_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [releaseId, view, retrying]);

  const retry = useCallback(() => {
    if (!releaseId || retrying) return;
    const savedIntake = polled && polled.releaseId === releaseId ? polled.intake : null;
    const releaseDate = release?.releaseDate ? String(release.releaseDate).slice(0, 10) : '';
    const intake =
      savedIntake ??
      (releaseDate
        ? buildAutoPlanIntake({
            releaseType: release?.releaseType,
            artistName: release?.artistName,
            releaseDate,
          })
        : null);
    if (!intake) return;
    captureAnalyticsEvent({ name: 'plan_auto_retry', properties: { release_id: releaseId } });
    setRetrying(true);
    void (async () => {
      let landed = false;
      try {
        const token = await bearer();
        if (!token) return;
        const res = await fetch(`/api/releases/${releaseId}/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ intake }),
        });
        const body = (await res.json().catch(() => null)) as { code?: string } | null;
        if (res.ok || body?.code === 'tasks_exist') {
          landed = true;
          landedRef.current();
          return;
        }
        if (body?.code === 'plan_in_progress') {
          // Another build is on it: wait for that one.
          setPolled({
            releaseId,
            auto: { state: 'running', started_at: new Date().toISOString(), source: 'onboarding' },
            intake,
          });
          return;
        }
        setPolled({
          releaseId,
          auto: {
            state: 'failed',
            started_at: new Date().toISOString(),
            code: body?.code ?? `status_${res.status}`,
            source: 'onboarding',
          },
          intake,
        });
      } catch {
        setPolled({
          releaseId,
          auto: { state: 'failed', started_at: new Date().toISOString(), code: 'network', source: 'onboarding' },
          intake,
        });
      } finally {
        // Kept "generating" after a landing until the activities replace the card.
        if (!landed) setRetrying(false);
        setNow(Date.now());
      }
    })();
  }, [releaseId, retrying, polled, release?.releaseDate, release?.releaseType, release?.artistName]);

  // A retry that landed: clear the flag once the activities are on screen.
  useEffect(() => {
    if (hasActivities && retrying) setRetrying(false);
  }, [hasActivities, retrying]);

  return { view, startedAt, retrying, retry };
}
