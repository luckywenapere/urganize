'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from '@/components/icons';
import { authHeaders, readError } from '@/components/press-kits/press-kit-client';
import type { TeamPageResponse } from '@/lib/team-page';

/**
 * Leave a team you joined. It lived in the Team tab's Settings segment until
 * that segment was removed (founder, 2026-10-30); team name is in Artists &
 * brand and the seat count is in the Team header. The owner never sees this:
 * an owner cannot leave their own team (#856 is handing it over).
 */
export function LeaveTeamSection() {
  const [team, setTeam] = useState<TeamPageResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = await authHeaders();
      if (!headers) return;
      try {
        const response = await fetch('/api/team', { headers, cache: 'no-store' });
        if (!response.ok || cancelled) return;
        setTeam((await response.json()) as TeamPageResponse);
      } catch {
        // No row is better than a broken one; the rest of the segment still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!team || team.viewer.isOwner) return null;
  const { workspace } = team;

  const leave = async () => {
    setLeaving(true);
    setError(null);
    const headers = await authHeaders();
    if (!headers) {
      setLeaving(false);
      setError('Sign in again to leave.');
      return;
    }
    const response = await fetch('/api/team/leave', {
      method: 'POST',
      headers,
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    if (!response.ok) {
      setLeaving(false);
      setError(await readError(response, 'Could not leave the team.'));
      return;
    }
    // A full load, so every cached list forgets the team they just left.
    window.location.assign('/dashboard/artists');
  };

  return (
    <section id="leave-team" className="relative scroll-mt-4 border-l-2 border-status-error/50 py-9 pl-5">
      <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-status-error">Leave this team</h2>
      <p className="text-sm text-content-secondary">
        You lose access to {workspace.name}&apos;s rollouts. Your open tasks go back to {workspace.ownerName}.
      </p>
      {confirming ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void leave()}
            disabled={leaving}
            className="inline-flex items-center gap-2 rounded-lg bg-status-error px-4 py-2 text-sm font-semibold text-content-inverse hover:opacity-90 disabled:opacity-55"
          >
            {leaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Yes, leave {workspace.name}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg px-3 py-2 text-sm text-content-secondary"
          >
            Stay
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 rounded-lg border border-status-error/35 px-4 py-2 text-sm font-semibold text-status-error"
        >
          Leave {workspace.name}
        </button>
      )}
      {error ? <p role="alert" className="mt-2 text-sm text-status-error">{error}</p> : null}
    </section>
  );
}
