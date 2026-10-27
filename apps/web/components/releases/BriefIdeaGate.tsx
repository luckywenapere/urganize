'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { IDEAS_CHANGED_EVENT } from '@/components/workspace/RolloutFirstSteps';

/**
 * The Brief opens only once the rollout has a plan or a recorded idea
 * (2026-10-26, founder). Before that, the Brief tab shows the idea screen
 * ("What's the idea for ...?") in its place. A new idea flips it to the brief
 * straight away (IDEAS_CHANGED_EVENT). With the idea round on (2026-10-27) the
 * flip is the round closing instead, so the brief is written before the plan.
 */
export function BriefIdeaGate({
  releaseId,
  hasPlan,
  ideaScreen,
  children,
}: {
  releaseId: string;
  hasPlan: boolean;
  /** The rollout's idea card. Without one, the brief always shows. */
  ideaScreen?: ReactNode;
  children: ReactNode;
}) {
  const gated = !hasPlan && Boolean(ideaScreen);
  // null while the notes are loading.
  const [hasIdea, setHasIdea] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setHasIdea(true);
      return;
    }
    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/ideas`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      // A failed read opens the brief rather than trapping the page.
      if (!response.ok) {
        setHasIdea(true);
        return;
      }
      const payload = (await response.json()) as { notes?: unknown[]; round?: { state?: string } | null };
      // With the idea round on (2026-10-27) the brief opens once the round is
      // closed; until then this tab is where ideas are collected.
      setHasIdea(payload.round ? payload.round.state !== 'open' : (payload.notes?.length ?? 0) > 0);
    } catch {
      setHasIdea(true);
    }
  }, [releaseId]);

  useEffect(() => {
    if (!gated) return;
    void load();
    const onChanged = () => void load();
    window.addEventListener(IDEAS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(IDEAS_CHANGED_EVENT, onChanged);
  }, [gated, load]);

  if (!gated) return <>{children}</>;
  if (hasIdea === null) return null;
  return <>{hasIdea ? children : ideaScreen}</>;
}
