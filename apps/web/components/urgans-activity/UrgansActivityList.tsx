'use client';

// "What UrgAns did": every change UrgAns made, and who asked for it. Shown on
// the UrgAns page only (2026-10-29, #849, founder approved the mock): it left
// the rollout menu and Settings > UrgAns, and the page picks the rollout
// itself (All rollouts, or one) with a filter by person. Reads GET
// /api/urgans/activity; words each row with lib/urgans-activity.ts. Mocks
// approved by the founder 2026-10-27. No Undo: the mock showed one on a
// WhatsApp row, and it was left out because an undo is a write of its own that
// needs its own rules (see docs/notes/2026-10-27-urgans-action-log.md).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, MessageCircle, MessageSquare, Mic, Plug, Sparkles } from '@/components/icons';
import { SiWhatsapp } from 'react-icons/si';
import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { displayReleaseTitle } from '@/types/releases';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import {
  describeActivity,
  diffSnapshots,
  type UrgansActivityIcon,
  type UrgansActivityRow,
} from '@/lib/urgans-activity';

type Payload = { viewerId: string; rows: UrgansActivityRow[]; names: Record<string, string> };

const ICONS: Record<UrgansActivityIcon, (props: { className?: string }) => React.ReactNode> = {
  message: (p) => <MessageSquare {...p} aria-hidden="true" />,
  microphone: (p) => <Mic {...p} aria-hidden="true" />,
  whatsapp: (p) => <SiWhatsapp {...p} aria-hidden="true" />,
  clock: (p) => <Clock {...p} aria-hidden="true" />,
  button: (p) => <Sparkles {...p} aria-hidden="true" />,
  plug: (p) => <Plug {...p} aria-hidden="true" />,
  memory: (p) => <MessageCircle {...p} aria-hidden="true" />,
};

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token || ''}` };
}

export function UrgansActivityList({
  showRolloutPicker = false,
  showPersonFilter = false,
}: {
  showRolloutPicker?: boolean;
  showPersonFilter?: boolean;
}) {
  const releases = useReleaseStore((state) => state.releases);
  // Empty means every rollout this person can see.
  const [releaseId, setReleaseId] = useState('');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [person, setPerson] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const query = releaseId ? `?releaseId=${encodeURIComponent(releaseId)}` : '';
      const res = await fetch(`/api/urgans/activity${query}`, { headers: await authHeaders() });
      if (!res.ok) {
        setError('Could not load what AI did.');
        return;
      }
      setData((await res.json()) as Payload);
    } catch {
      setError('Could not load what AI did. Check your connection.');
    }
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const people = useMemo(() => {
    if (!data) return [];
    const ids = Array.from(new Set(data.rows.map((row) => row.actorUserId).filter((id): id is string => Boolean(id))));
    return ids.map((id) => ({ id, label: id === data.viewerId ? 'You' : data.names[id] || 'Someone' }));
  }, [data]);

  const rolloutPicker = showRolloutPicker ? (
    <select
      aria-label="Rollout"
      value={releaseId}
      onChange={(event) => {
        setData(null);
        setReleaseId(event.target.value);
      }}
      className="motion-focus min-w-0 max-w-full rounded-md border border-stroke-control bg-bg-surface px-2 py-1 text-sm text-content-primary"
    >
      <option value="">All rollouts</option>
      {releases.map((release) => (
        <option key={release.id} value={release.id}>
          {displayReleaseTitle(release.title)}
          {release.artistName ? ` · ${release.artistName}` : ''}
        </option>
      ))}
    </select>
  ) : null;

  if (error) {
    return (
      <div>
        {rolloutPicker ? <div className="mb-3">{rolloutPicker}</div> : null}
        <div className="text-sm text-content-secondary" role="alert">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="motion-focus font-semibold text-brand hover:underline">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true">
        {rolloutPicker}
        <SkeletonBlock className="h-12 w-full" />
        <SkeletonBlock className="h-12 w-full" />
        <SkeletonBlock className="h-12 w-full" />
      </div>
    );
  }

  const rows = person ? data.rows.filter((row) => row.actorUserId === person) : data.rows;

  return (
    <div>
      {rolloutPicker || (showPersonFilter && people.length > 1) ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-content-secondary">
          {rolloutPicker}
          {showPersonFilter && people.length > 1 ? (
          <select
            aria-label="Who asked"
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            className="motion-focus rounded-md border border-stroke-control bg-bg-surface px-2 py-1 text-sm text-content-primary"
          >
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-content-secondary">
          Nothing yet. When AI changes something{releaseId ? ' on this rollout' : ''}, it shows here with who asked
          for it.
        </p>
      ) : (
        <ul className="divide-y divide-stroke-subtle border-y border-stroke-subtle">
          {rows.map((row) => {
            const line = describeActivity(row, data.viewerId, data.names);
            const Icon = ICONS[line.icon];
            const changes = diffSnapshots(row.before, row.after);
            const isOpen = open === row.id;
            return (
              <li key={row.id} className="flex gap-3 py-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${line.failed ? 'text-content-secondary' : 'text-content-primary'}`}>
                    {line.title}
                  </p>
                  <p className="mt-0.5 text-xs text-content-tertiary">{line.meta}</p>
                  {line.failure ? <p className="mt-1 text-xs text-status-error">{line.failure}</p> : null}
                  {isOpen ? (
                    changes.length ? (
                      <dl className="mt-2 space-y-1 text-xs">
                        {changes.map((change) => (
                          <div key={change.field} className="flex flex-wrap gap-x-2">
                            <dt className="text-content-tertiary">{change.field}</dt>
                            <dd className="text-content-secondary">
                              {change.from ? <span className="line-through">{change.from}</span> : null}
                              {change.from ? ' to ' : ''}
                              <span className="text-content-primary">{change.to || 'empty'}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-2 text-xs text-content-secondary">{row.summary || 'No more detail recorded.'}</p>
                    )
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : row.id)}
                  aria-expanded={isOpen}
                  className="motion-focus self-start text-xs font-medium text-brand hover:underline"
                >
                  {isOpen ? 'Hide' : 'Details'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
