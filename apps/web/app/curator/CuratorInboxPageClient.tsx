'use client';

// The playlist owner's inbox. The whole design target is: open the app, listen
// to three songs, clear them, close the app. So a card shows everything needed
// to decide (song, artist, who sent it, the note), the link opens in one tap,
// and the four statuses are one tap each. The reply box only appears once a
// decision is made, because that is the only moment a reply means anything.

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Inbox } from 'lucide-react';
import { CuratorShell } from '@/components/curator/CuratorShell';
import { CuratorInboxSkeleton } from '@/components/loading/CuratorSkeleton';
import { useCuratorStore } from '@/stores/useCuratorStore';
import {
  MAX_PITCH_REPLY_LENGTH,
  PITCH_PLATFORM_LABELS,
  PITCH_STATUSES,
  PITCH_STATUS_LABELS,
  acceptsPitchReply,
} from '@/lib/pitching';
import type { CuratorPitch, PitchStatus } from '@/types/pitching';
import { formatRelativeTime } from '@/lib/relative-time';
import { openExternalUrl } from '@/lib/external-link';

type FilterKey = 'waiting' | 'decided' | 'all';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'waiting', label: 'To hear' },
  { key: 'decided', label: 'Answered' },
  { key: 'all', label: 'All' },
];

const statusChipClass = (status: PitchStatus, isActive: boolean): string => {
  const base =
    'inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-50';
  if (!isActive) {
    return `${base} border-stroke-default text-content-secondary hover:border-stroke-strong hover:text-content-primary`;
  }
  if (status === 'added') return `${base} border-brand bg-brand/15 text-brand`;
  if (status === 'passed') return `${base} border-stroke-strong bg-bg-elevated text-content-primary`;
  if (status === 'listened')
    return `${base} border-status-info/40 bg-status-info/10 text-status-info`;
  return `${base} border-status-warning/40 bg-status-warning/10 text-status-warning`;
};

function PitchCard({ pitch }: { pitch: CuratorPitch }) {
  const setPitchStatus = useCuratorStore((state) => state.setPitchStatus);
  // null means "no local edit yet", so the box always shows the saved reply
  // until the curator types. Derived rather than synced in an effect, which
  // keeps a background reload from ever clobbering what is being typed.
  const [draft, setDraft] = useState<string | null>(null);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const reply = draft ?? pitch.reply ?? '';

  const applyStatus = async (status: PitchStatus, nextReply?: string) => {
    setError('');
    setIsSaving(true);
    try {
      await setPitchStatus(pitch.id, status, nextReply);
      // A saved reply drops the local draft so the card shows server truth.
      if (nextReply !== undefined) setDraft(null);
      setIsReplyOpen(acceptsPitchReply(status) && nextReply === undefined);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Could not save that.');
    } finally {
      setIsSaving(false);
    }
  };

  const platformLabel = pitch.songPlatform ? PITCH_PLATFORM_LABELS[pitch.songPlatform] : '';

  return (
    <article className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
            {pitch.playlistName}
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-content-primary">
            {pitch.songTitle}
          </h2>
          <p className="truncate text-sm text-content-secondary">{pitch.artistName}</p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-content-tertiary">
          {formatRelativeTime(pitch.createdAt)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => void openExternalUrl(pitch.songUrl)}
        className="mt-3 inline-flex h-10 max-w-full items-center gap-2 rounded-xl border border-stroke-default bg-bg-elevated px-3 text-sm font-semibold text-content-primary transition-colors hover:border-stroke-strong"
      >
        <ExternalLink className="h-4 w-4 shrink-0 text-content-tertiary" />
        <span className="truncate">Listen{platformLabel ? ` on ${platformLabel}` : ''}</span>
      </button>

      {pitch.note ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-content-secondary">{pitch.note}</p>
      ) : null}

      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
        Sent by {pitch.pitcherName}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {PITCH_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            disabled={isSaving}
            aria-pressed={pitch.status === status}
            onClick={() => void applyStatus(status)}
            className={statusChipClass(status, pitch.status === status)}
          >
            {PITCH_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {acceptsPitchReply(pitch.status) ? (
        <div className="mt-3">
          {pitch.reply && !isReplyOpen ? (
            <div className="rounded-xl border border-stroke-default bg-bg-elevated px-3 py-2">
              <p className="text-sm text-content-secondary">{pitch.reply}</p>
              <button
                type="button"
                onClick={() => setIsReplyOpen(true)}
                className="mt-1 text-xs font-semibold text-brand hover:underline"
              >
                Edit reply
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor={`reply-${pitch.id}`}
                className="block text-[11px] uppercase tracking-[0.16em] text-content-tertiary"
              >
                Reply (optional)
              </label>
              <input
                id={`reply-${pitch.id}`}
                type="text"
                value={reply}
                maxLength={MAX_PITCH_REPLY_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Add a short reply"
                className="h-11 w-full rounded-xl border border-stroke-default bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void applyStatus(pitch.status, reply)}
                  className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save reply'}
                </button>
                {pitch.reply ? (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      setDraft(null);
                      setIsReplyOpen(false);
                    }}
                    className="inline-flex h-10 items-center rounded-xl border border-stroke-default px-4 text-sm font-semibold text-content-secondary"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export function CuratorInboxPageClient() {
  const pitches = useCuratorStore((state) => state.pitches);
  const isLoading = useCuratorStore((state) => state.isLoadingPitches);
  const hydrated = useCuratorStore((state) => state.hydrated);
  const loadPitches = useCuratorStore((state) => state.loadPitches);
  const [filter, setFilter] = useState<FilterKey>('waiting');

  useEffect(() => {
    void loadPitches();
  }, [loadPitches]);

  const waitingCount = useMemo(
    () => pitches.filter((pitch) => pitch.status === 'new').length,
    [pitches]
  );

  const visible = useMemo(() => {
    if (filter === 'waiting') return pitches.filter((pitch) => pitch.status !== 'added' && pitch.status !== 'passed');
    if (filter === 'decided')
      return pitches.filter((pitch) => pitch.status === 'added' || pitch.status === 'passed');
    return pitches;
  }, [filter, pitches]);

  return (
    <CuratorShell>
      {isLoading && !hydrated ? (
        <CuratorInboxSkeleton />
      ) : (
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-content-tertiary">Inbox</p>
            <h1 className="font-display text-2xl text-content-primary">Pitches</h1>
            <p className="text-sm text-content-secondary">
              {waitingCount > 0
                ? `${waitingCount} waiting on you.`
                : 'Nothing waiting on you right now.'}
            </p>
          </header>

          <div className="flex gap-2">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={filter === entry.key}
                onClick={() => setFilter(entry.key)}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
                  filter === entry.key
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-stroke-default text-content-secondary hover:border-stroke-strong'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="rounded-xl border border-stroke-default bg-bg-surface p-8 text-center">
              <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated text-content-tertiary">
                <Inbox className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-content-primary">
                {filter === 'decided' ? 'Nothing answered yet' : 'No pitches yet'}
              </p>
              <p className="mt-1 text-sm text-content-secondary">
                {filter === 'decided'
                  ? 'Songs you mark added or passed show up here.'
                  : 'Add a playlist so artist teams can find you.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((pitch) => (
                <PitchCard key={pitch.id} pitch={pitch} />
              ))}
            </div>
          )}
        </div>
      )}
    </CuratorShell>
  );
}
