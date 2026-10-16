'use client';

// Promo in a rollout's Pitch this! scene (2026-10-16, founder approved mocks).
// The old Promo tab's grid, filters and pick-then-card flow became one plain
// list: name, what it is and where, and a + that puts it on the plan as a
// dated activity. A check means it is already on the plan. Five first, then
// "All N channels". Data, route and task shape are the old scene's.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus } from '@/components/icons';
import { openExternalUrl } from '@/lib/external-link';
import { supabase } from '@/lib/supabase/client';
import {
  PROMO_CHANNEL_KIND_LABELS,
  promoCountryLabel,
  promoTaskDescription,
  promoTaskDueDate,
  promoTaskTitle,
  type PromoChannel,
} from '@/lib/promo-channels';
import { promoListHead, promoListRest } from '@/lib/promo-list';
import { useTaskStore } from '@/stores/useTaskStore';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';

type PromoListProps = {
  release: Pick<Release, 'id' | 'releaseDate'>;
  tasks: Task[];
  onTaskAdded: () => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

type Payload = { ready: boolean; channels: PromoChannel[]; genre: string | null };

const todayYmd = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export function PromoList({ release, tasks, onTaskAdded, onToast }: PromoListProps) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const createTask = useTaskStore((state) => state.createTask);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) {
        setLoadError(true);
        return;
      }
      const response = await fetch(`/api/releases/${release.id}/promo-channels`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const body = (await response.json().catch(() => ({}))) as Partial<Payload>;
      if (!response.ok) {
        setLoadError(true);
        return;
      }
      setPayload({
        ready: body.ready !== false,
        channels: Array.isArray(body.channels) ? body.channels : [],
        genre: typeof body.genre === 'string' ? body.genre : null,
      });
    } catch {
      setLoadError(true);
    }
  }, [release.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const channels = useMemo(() => payload?.channels ?? [], [payload]);
  const head = useMemo(() => promoListHead(channels, payload?.genre ?? null), [channels, payload]);
  const rest = useMemo(() => promoListRest(channels, head), [channels, head]);
  const plannedTitles = useMemo(() => new Set(tasks.map((task) => task.title.trim().toLowerCase())), [tasks]);
  const isPlanned = (channel: PromoChannel) =>
    addedIds.includes(channel.id) || plannedTitles.has(promoTaskTitle(channel).toLowerCase());

  const add = async (channel: PromoChannel) => {
    if (adding || isPlanned(channel)) return;
    setAdding(channel.id);
    try {
      const task = await createTask({
        title: promoTaskTitle(channel),
        description: promoTaskDescription(channel) || null,
        releaseId: release.id,
        dueDate: promoTaskDueDate(channel, release.releaseDate, todayYmd()) || null,
      });
      if (!task) {
        onToast(useTaskStore.getState().error || 'Could not add it. Try again.', 'error');
        return;
      }
      setAddedIds((current) => [...current, channel.id]);
      onToast('Added to the plan', 'success');
      onTaskAdded();
    } finally {
      setAdding(null);
    }
  };

  if (loadError) {
    return (
      <div className="rounded-2xl border border-status-error/30 bg-status-error/5 p-4">
        <p className="text-sm font-semibold text-content-primary" role="alert">
          Couldn’t load promo.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="motion-focus mt-2 min-h-11 text-sm font-semibold text-brand hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!payload) {
    return (
      <ul aria-busy="true" aria-label="Loading promo">
        {Array.from({ length: 3 }).map((_, index) => (
          <li key={index} className="flex items-center gap-3 border-b border-stroke-subtle py-3.5 last:border-b-0">
            <span className="flex-1 space-y-2">
              <span className="block h-3.5 w-1/2 animate-pulse rounded bg-bg-elevated" />
              <span className="block h-3 w-1/3 animate-pulse rounded bg-bg-elevated" />
            </span>
            <span className="h-9 w-9 animate-pulse rounded-[10px] bg-bg-elevated" />
          </li>
        ))}
      </ul>
    );
  }

  // Nothing to list (the table is not there yet, or it is empty): the block
  // does not render at all, so there is no heading over nothing.
  if (!payload.ready || channels.length === 0) return null;

  const shown = showAll ? [...head, ...rest] : head;

  return (
    <section aria-label="Promo" className="space-y-1">
      <h3 className="mb-2 font-display text-xl text-content-primary">Promo</h3>
      <ul>
        {shown.map((channel) => {
          const planned = isPlanned(channel);
          const where = channel.city || promoCountryLabel(channel.country);
          return (
            <li key={channel.id} className="flex items-center gap-3 border-b border-stroke-subtle py-1 last:border-b-0">
              <button
                type="button"
                disabled={!channel.url}
                onClick={() => channel.url && void openExternalUrl(channel.url)}
                className="motion-focus min-h-[52px] min-w-0 flex-1 py-2 text-left disabled:cursor-default"
              >
                <span className="block truncate text-sm font-medium text-content-primary">{channel.name}</span>
                <span className="block truncate text-[13px] text-content-primary/55">
                  {PROMO_CHANNEL_KIND_LABELS[channel.kind]} · {where}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void add(channel)}
                disabled={planned || adding !== null}
                aria-label={planned ? `${channel.name} is on the plan` : `Add ${channel.name} to the plan`}
                className={`motion-focus motion-press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] ${
                  planned ? 'text-brand' : 'border border-stroke-default text-content-primary hover:border-brand'
                } disabled:cursor-default`}
              >
                {adding === channel.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : planned ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!showAll && rest.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="motion-focus min-h-11 text-sm font-semibold text-content-primary/55 hover:text-content-primary"
        >
          All {channels.length} channels
        </button>
      ) : null}
    </section>
  );
}
