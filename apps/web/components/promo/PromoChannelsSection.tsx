'use client';

// The Promo scene: a directory of promo channels (radio, blogs, X communities,
// SoundCloud networks) for ONE rollout, and the way to put one on the plan as a
// dated activity (GitHub #833).
//
// Laid out like the Pitch screen (founder brief, 2026-10-11: faces in a grid
// like a menu, little text): filter chips, a tile grid, and, only once a
// channel is picked, one card with how to submit, the date, and "Add to plan".
// "Good fits" leads when the rollout's genre and the chosen country give any.
//
// Fetches for itself and is never cached (see 'promo' in lib/scene-cache.ts).
// Before the table exists the route answers `ready: false`, and this shows one
// quiet line rather than an error.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ExternalLink, Plus } from '@/components/icons';
import { CuratorFace } from '@/components/pitching/CuratorFace';
import { openExternalUrl } from '@/lib/external-link';
import { supabase } from '@/lib/supabase/client';
import {
  DEFAULT_PROMO_COUNTRY,
  ONLINE_COUNTRY,
  PROMO_CHANNEL_KINDS,
  PROMO_CHANNEL_KIND_LABELS,
  PROMO_COUNTRIES,
  filterPromoChannels,
  promoCountryLabel,
  promoTaskDescription,
  promoTaskDueDate,
  promoTaskTitle,
  suggestPromoChannels,
  type PromoChannel,
  type PromoChannelKind,
} from '@/lib/promo-channels';
import { useTaskStore } from '@/stores/useTaskStore';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';
import { SuggestPromoChannelForm } from './SuggestPromoChannelForm';

type PromoChannelsSectionProps = {
  release: Pick<Release, 'id' | 'title' | 'releaseDate'>;
  /** The rollout's activities, to mark channels already on the plan. */
  tasks: Task[];
  /** An activity was added; re-read the workspace so it shows. */
  onTaskAdded: () => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

type Payload = { ready: boolean; channels: PromoChannel[]; genre: string | null };

const CHIP =
  'h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
const chipClass = (active: boolean) =>
  `${CHIP} ${active ? 'bg-content-primary text-bg-base' : 'bg-bg-elevated text-content-secondary hover:text-content-primary'}`;

const todayYmd = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

export function PromoChannelsSection({ release, tasks, onTaskAdded, onToast }: PromoChannelsSectionProps) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState('');
  const [kind, setKind] = useState<PromoChannelKind | ''>('');
  // Nigeria first (the strategy doc); "All" and the UK are one tap away.
  const [country, setCountry] = useState<string>(DEFAULT_PROMO_COUNTRY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const createTask = useTaskStore((state) => state.createTask);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const headers = await authHeaders();
      if (!headers) {
        setLoadError('Your session expired. Sign in again.');
        return;
      }
      const response = await fetch(`/api/releases/${release.id}/promo-channels`, { headers, cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as Partial<Payload> & { error?: string };
      if (!response.ok) {
        setLoadError(body.error || 'Could not load promo channels.');
        return;
      }
      setPayload({
        ready: body.ready !== false,
        channels: Array.isArray(body.channels) ? body.channels : [],
        genre: typeof body.genre === 'string' ? body.genre : null,
      });
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    }
  }, [release.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const channels = useMemo(() => payload?.channels ?? [], [payload]);
  const visible = useMemo(() => filterPromoChannels(channels, { kind, country }), [channels, kind, country]);
  const fits = useMemo(
    () =>
      kind
        ? []
        : suggestPromoChannels(channels, {
            genre: payload?.genre ?? null,
            country: country && country !== ONLINE_COUNTRY ? country : null,
          }),
    [channels, payload, kind, country]
  );
  // Only the kinds that have a listed channel get a chip, so no chip leads to
  // an empty grid.
  const kinds = useMemo(
    () => PROMO_CHANNEL_KINDS.filter((value) => channels.some((channel) => channel.kind === value)),
    [channels]
  );

  const plannedTitles = useMemo(() => new Set(tasks.map((task) => task.title.trim().toLowerCase())), [tasks]);
  const isPlanned = (channel: PromoChannel) =>
    addedIds.includes(channel.id) || plannedTitles.has(promoTaskTitle(channel).toLowerCase());

  const selected = channels.find((channel) => channel.id === selectedId) ?? null;

  const pick = (channel: PromoChannel) => {
    if (selectedId === channel.id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(channel.id);
    setDueDate(promoTaskDueDate(channel, release.releaseDate, todayYmd()));
    // On a phone the card lands under a long grid: bring it into view.
    window.requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  const addToPlan = async () => {
    if (!selected || isAdding) return;
    setIsAdding(true);
    try {
      const task = await createTask({
        title: promoTaskTitle(selected),
        description: promoTaskDescription(selected) || null,
        releaseId: release.id,
        dueDate: dueDate || null,
      });
      if (!task) {
        onToast(useTaskStore.getState().error || 'Could not add it. Try again.', 'error');
        return;
      }
      setAddedIds((current) => [...current, selected.id]);
      setSelectedId(null);
      onToast('Added to the plan', 'success');
      onTaskAdded();
    } finally {
      setIsAdding(false);
    }
  };

  if (loadError) {
    return (
      <div className="mt-6 rounded-2xl bg-bg-surface p-6 text-center">
        <p className="text-sm text-content-secondary">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="motion-focus mt-3 inline-flex h-11 items-center rounded-xl border border-stroke-control px-4 text-sm font-medium text-content-primary hover:border-brand"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!payload) return <PromoGridSkeleton />;

  if (!payload.ready) {
    return (
      <p className="mt-6 rounded-2xl bg-bg-surface p-6 text-center text-sm text-content-secondary">
        Promo channels are coming soon.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {fits.length > 0 ? (
        <section aria-label="Good fits" className="space-y-3">
          <h3 className="font-display text-xl font-semibold text-content-primary">Good fits</h3>
          <ChannelGrid channels={fits} selectedId={selectedId} isPlanned={isPlanned} onPick={pick} />
        </section>
      ) : null}

      <section aria-label="All channels" className="space-y-4">
        <h3 className="font-display text-xl font-semibold text-content-primary">All channels</h3>

        <div role="radiogroup" aria-label="Country" className="no-scrollbar -mx-1 -my-1 flex gap-2 overflow-x-auto px-1 py-1">
          {[{ code: '', label: 'All' }, ...PROMO_COUNTRIES, { code: ONLINE_COUNTRY, label: 'Online' }].map((entry) => (
            <button
              key={entry.code || 'all'}
              type="button"
              role="radio"
              aria-checked={country === entry.code}
              onClick={() => setCountry(entry.code)}
              className={chipClass(country === entry.code)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {kinds.length > 1 ? (
          <div role="radiogroup" aria-label="Type" className="no-scrollbar -mx-1 -my-1 flex gap-2 overflow-x-auto px-1 py-1">
            {(['', ...kinds] as Array<PromoChannelKind | ''>).map((value) => (
              <button
                key={value || 'all'}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                className={chipClass(kind === value)}
              >
                {value ? PROMO_CHANNEL_KIND_LABELS[value] : 'All types'}
              </button>
            ))}
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p className="rounded-2xl bg-bg-surface p-6 text-center text-sm text-content-secondary">
            No channels here yet.
          </p>
        ) : (
          <ChannelGrid channels={visible} selectedId={selectedId} isPlanned={isPlanned} onPick={pick} />
        )}
      </section>

      {selected ? (
        <div
          ref={cardRef}
          className="animate-enter space-y-3 rounded-2xl border border-stroke-default bg-bg-surface p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <CuratorFace name={selected.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-content-primary">{selected.name}</p>
              <p className="truncate text-xs text-content-secondary">
                {[PROMO_CHANNEL_KIND_LABELS[selected.kind], selected.city || promoCountryLabel(selected.country)].join(' · ')}
              </p>
            </div>
            {selected.url ? (
              <button
                type="button"
                onClick={() => void openExternalUrl(selected.url as string)}
                aria-label={`Open ${selected.name}`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-content-tertiary transition-colors hover:bg-bg-elevated hover:text-content-primary"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <dl className="space-y-2 text-sm">
            {selected.howToSubmit ? <Fact label="How">{selected.howToSubmit}</Fact> : null}
            {selected.contact ? (
              <Fact label="Contact">
                <span className="break-all">{selected.contact}</span>
              </Fact>
            ) : null}
            <Fact label="Lead time">{selected.leadTime || 'Not listed'}</Fact>
            <Fact label="Cost">{selected.cost === 'free' ? 'Free' : selected.cost === 'paid' ? 'Paid' : 'Not listed'}</Fact>
          </dl>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-content-secondary">
              <span className="shrink-0">Due</span>
              <input
                type="date"
                aria-label="Due date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="h-11 rounded-xl border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none"
              />
            </label>
            <button
              type="button"
              disabled={isAdding || isPlanned(selected)}
              onClick={() => void addToPlan()}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {isPlanned(selected) ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {isPlanned(selected) ? 'On the plan' : isAdding ? 'Adding…' : 'Add to plan'}
            </button>
          </div>
        </div>
      ) : null}

      <section aria-label="Suggest a channel" className="border-t border-stroke-subtle pt-6">
        {suggesting ? (
          <SuggestPromoChannelForm
            authHeaders={authHeaders}
            onDone={(sent) => {
              setSuggesting(false);
              if (sent) onToast('Thanks. We check it before it is listed.', 'success');
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setSuggesting(true)}
            className="motion-focus inline-flex h-11 items-center gap-2 rounded-xl border border-stroke-control px-4 text-sm font-medium text-content-primary hover:border-brand"
          >
            <Plus className="h-4 w-4" /> Suggest a channel
          </button>
        )}
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-content-tertiary">{label}</dt>
      <dd className="min-w-0 text-content-primary">{children}</dd>
    </div>
  );
}

function ChannelGrid({
  channels,
  selectedId,
  isPlanned,
  onPick,
}: {
  channels: PromoChannel[];
  selectedId: string | null;
  isPlanned: (channel: PromoChannel) => boolean;
  onPick: (channel: PromoChannel) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {channels.map((channel) => {
        const isSelected = selectedId === channel.id;
        const planned = isPlanned(channel);
        const where = channel.city || promoCountryLabel(channel.country);
        return (
          <li key={channel.id}>
            <button
              type="button"
              aria-pressed={isSelected}
              aria-label={`${channel.name}, ${PROMO_CHANNEL_KIND_LABELS[channel.kind]}, ${where}${planned ? ', on the plan' : ''}`}
              onClick={() => onPick(channel)}
              className={`group relative block aspect-square w-full overflow-hidden rounded-2xl text-left transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98] ${
                isSelected ? 'ring-[3px] ring-brand ring-offset-2 ring-offset-bg-base' : ''
              }`}
            >
              <CuratorFace name={channel.name} className="transition-transform duration-300 group-hover:scale-105" />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-3">
                <span className="block truncate text-sm font-semibold text-white sm:text-base">{channel.name}</span>
                <span className="block truncate text-xs text-white/75">
                  {PROMO_CHANNEL_KIND_LABELS[channel.kind]} · {where}
                </span>
              </span>
              {channel.cost ? (
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                  {channel.cost === 'free' ? 'Free' : 'Paid'}
                </span>
              ) : null}
              {planned || isSelected ? (
                <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-content-inverse shadow">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PromoGridSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="aspect-square animate-pulse rounded-2xl bg-bg-elevated" />
      ))}
    </div>
  );
}
