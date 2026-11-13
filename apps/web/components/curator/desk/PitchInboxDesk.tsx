'use client';

// The playlist owner's inbox on a computer (#1237): the list on the left, the
// open pitch on the right. Same rules and the same endpoint as the phone cards
// in CuratorInboxPageClient (setPitchStatus through useCuratorStore): a paid
// pitch needs Accept or Pass with a 15-word reply, once, inside its window; a
// free pitch takes Add it or Pass with an optional short reply.
//
// Listen opens the song and marks a new pitch listened, for paid pitches too,
// so the New and Listened buttons the phone's paid card carries are not here.

import { useMemo, useState } from 'react';
import { Check, Headphones, Inbox } from '@/components/icons';
import { useCuratorStore } from '@/stores/useCuratorStore';
import { MAX_PITCH_REPLY_LENGTH, PITCH_PLATFORM_LABELS, pitchStateLabel } from '@/lib/pitching';
import {
  MAX_PAID_FEEDBACK_LENGTH,
  MIN_PAID_FEEDBACK_WORDS,
  PITCH_RESPONSE_WINDOW_HOURS,
  countWords,
  validatePaidFeedback,
} from '@/lib/pitch-payments';
import { ACCEPT_LABEL, PASS_LABEL, WINDOW_CLOSED, feedbackWordCount } from '@/lib/pitch-payment-copy';
import {
  curatorInitials,
  isPitchDecided,
  pitchMoneyLabel,
  pitchTimeLeft,
  replyWindowLine,
  waitingCount,
} from '@/lib/curator-desk';
import { formatRelativeTime } from '@/lib/relative-time';
import { openExternalUrl } from '@/lib/external-link';
import type { CuratorPitch } from '@/types/pitching';

type FilterKey = 'waiting' | 'decided' | 'all';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'waiting', label: 'To hear' },
  { key: 'decided', label: 'Answered' },
  { key: 'all', label: 'All' },
];

const darkButton =
  'motion-focus inline-flex h-10 items-center justify-center gap-2 rounded-full bg-content-primary px-5 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-40';
const ghostButton =
  'motion-focus inline-flex h-10 items-center justify-center rounded-full border border-stroke-strong px-5 text-sm font-medium text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-40';
const textareaClass =
  'mt-2 min-h-[112px] w-full resize-y rounded-xl border border-stroke-control bg-bg-base px-3.5 py-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';

function CoverTile({ pitch, size }: { pitch: CuratorPitch; size: 'sm' | 'lg' }) {
  return (
    <div
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-lg bg-bg-active font-semibold text-content-secondary ${
        size === 'lg' ? 'h-[72px] w-[72px] text-base' : 'h-11 w-11 text-xs'
      }`}
    >
      {curatorInitials(pitch.songTitle)}
    </div>
  );
}

function PitchRow({
  pitch,
  selected,
  onSelect,
}: {
  pitch: CuratorPitch;
  selected: boolean;
  onSelect: () => void;
}) {
  const decided = isPitchDecided(pitch);
  const left = decided ? null : pitchTimeLeft(pitch.responseDueAt);
  const money = pitchMoneyLabel(pitch);
  return (
    <li className="border-t border-stroke-default first:border-t-0">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`motion-focus grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left transition-colors ${
          selected ? 'bg-bg-sidebar-active' : 'hover:bg-bg-hover'
        }`}
      >
        <CoverTile pitch={pitch} size="sm" />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-content-primary">{pitch.songTitle}</span>
          <span className="block truncate text-[13px] text-content-secondary">
            {pitch.artistName} · {pitch.playlistName}
          </span>
        </span>
        <span className="text-right">
          {decided ? (
            <span className="block text-xs font-medium text-content-tertiary">
              {pitchStateLabel(pitch.status, pitch.paymentKind ?? 'free')}
            </span>
          ) : left ? (
            <span
              className={`block text-xs ${
                left.urgent ? 'font-semibold text-status-error' : 'font-medium text-content-tertiary'
              }`}
            >
              {left.label}
            </span>
          ) : null}
          <span
            className={`block text-xs font-semibold ${money === 'Free' ? 'text-content-tertiary' : 'text-brand'}`}
          >
            {money}
          </span>
        </span>
      </button>
    </li>
  );
}

function PitchDetail({ pitch }: { pitch: CuratorPitch }) {
  const setPitchStatus = useCuratorStore((state) => state.setPitchStatus);
  const isPaid = pitch.paymentKind === 'paid';
  const decided = isPitchDecided(pitch);
  const left = pitchTimeLeft(pitch.responseDueAt);
  const closed = isPaid && !decided && Boolean(left?.closed);
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // A free pitch's box starts on the saved reply, so it can be changed; a paid
  // pitch's box starts empty, because its reply is final once sent.
  const reply = draft ?? (isPaid ? '' : pitch.reply ?? '');
  const words = countWords(reply);
  const platformLabel = pitch.songPlatform ? PITCH_PLATFORM_LABELS[pitch.songPlatform] : '';
  const money = pitchMoneyLabel(pitch);

  const listen = () => {
    void openExternalUrl(pitch.songUrl);
    if (pitch.status === 'new') {
      void setPitchStatus(pitch.id, 'listened').catch(() => undefined);
    }
  };

  const decidePaid = async (status: 'added' | 'passed') => {
    const check = validatePaidFeedback(reply);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await setPitchStatus(pitch.id, status, check.value);
      setDraft(null);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Could not save your reply.');
    } finally {
      setIsSaving(false);
    }
  };

  const decideFree = async (status: 'added' | 'passed') => {
    setError('');
    setIsSaving(true);
    try {
      await setPitchStatus(pitch.id, status, reply.trim());
      setDraft(null);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Could not save that.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="rounded-2xl border border-stroke-default bg-bg-surface p-5">
      {/* The Listen button drops under the title when the column is narrow
          (1024 to 1279), so the song name never squeezes to a sliver. */}
      <div className="flex flex-wrap items-center gap-4">
        <CoverTile pitch={pitch} size="lg" />
        <div className="min-w-[200px] flex-1">
          <h2 className="break-words font-display text-[26px] leading-8 text-content-primary">
            {pitch.songTitle}
          </h2>
          <p className="mt-0.5 text-[13px] text-content-secondary">
            {pitch.artistName} · for {pitch.playlistName} · sent by {pitch.pitcherName}{' '}
            {formatRelativeTime(pitch.createdAt)}
          </p>
        </div>
        <button type="button" onClick={listen} className={`${darkButton} shrink-0`}>
          <Headphones className="h-4 w-4" aria-hidden="true" />
          Listen{platformLabel && platformLabel !== 'Other' ? ` on ${platformLabel}` : ''}
          {pitch.status !== 'new' ? <Check className="h-4 w-4" aria-label="Listened" /> : null}
        </button>
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-y border-stroke-default py-3.5 text-[13px] text-content-secondary">
        <div>
          <dt className="sr-only">What you get</dt>
          <dd className="text-sm font-semibold text-content-primary">{money}</dd>
          <dd>{money === 'Free' ? 'No payment on this one' : 'You get this when you reply'}</dd>
        </div>
        {isPaid && !decided && left ? (
          <div>
            <dt className="sr-only">Time left</dt>
            <dd
              className={`text-sm font-semibold ${left.urgent || left.closed ? 'text-status-error' : 'text-content-primary'}`}
            >
              {left.label}
            </dd>
            <dd>To reply</dd>
          </div>
        ) : null}
        {decided ? (
          <div>
            <dt className="sr-only">Your answer</dt>
            <dd className="text-sm font-semibold text-content-primary">
              {pitchStateLabel(pitch.status, pitch.paymentKind ?? 'free')}
            </dd>
            <dd>Your answer</dd>
          </div>
        ) : null}
      </dl>

      {pitch.note ? (
        <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-6 text-content-primary">
          &ldquo;{pitch.note}&rdquo;
        </p>
      ) : null}

      {isPaid && decided ? (
        // Final. The artist has been told, so there is nothing to edit.
        pitch.reply ? (
          <div className="mt-5">
            <p className="text-sm font-semibold text-content-primary">Your reply</p>
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-bg-hover px-3.5 py-3 text-sm text-content-secondary">
              {pitch.reply}
            </p>
          </div>
        ) : null
      ) : closed ? (
        <p className="mt-5 rounded-xl bg-bg-hover px-3.5 py-3 text-sm text-content-secondary">{WINDOW_CLOSED}</p>
      ) : (
        <div className="mt-5">
          <label htmlFor={`desk-reply-${pitch.id}`} className="text-sm font-semibold text-content-primary">
            Your reply{isPaid ? '' : ' (optional)'}
          </label>
          <p className="text-[13px] text-content-secondary">Tell them what works and what does not.</p>
          <textarea
            id={`desk-reply-${pitch.id}`}
            value={reply}
            maxLength={isPaid ? MAX_PAID_FEEDBACK_LENGTH : MAX_PITCH_REPLY_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={isPaid ? `Write at least ${MIN_PAID_FEEDBACK_WORDS} words…` : 'Say something back'}
            className={textareaClass}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <p
              aria-live="polite"
              className={`flex-1 text-[13px] ${
                isPaid && words >= MIN_PAID_FEEDBACK_WORDS ? 'text-brand' : 'text-content-secondary'
              }`}
            >
              {isPaid ? feedbackWordCount(words) : `${reply.length} of ${MAX_PITCH_REPLY_LENGTH} characters`}
            </p>
            <button
              type="button"
              disabled={isSaving}
              aria-pressed={!isPaid ? pitch.status === 'passed' : undefined}
              onClick={() => void (isPaid ? decidePaid('passed') : decideFree('passed'))}
              className={ghostButton}
            >
              {!isPaid && pitch.status === 'passed' ? <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> : null}
              {PASS_LABEL}
            </button>
            <button
              type="button"
              disabled={isSaving}
              aria-pressed={!isPaid ? pitch.status === 'added' : undefined}
              onClick={() => void (isPaid ? decidePaid('added') : decideFree('added'))}
              className={darkButton}
            >
              {!isPaid && pitch.status === 'added' ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
              {isSaving ? 'Saving…' : isPaid ? ACCEPT_LABEL : 'Add it'}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export function PitchInboxDesk({
  pitches,
  isLoading,
  skeleton,
  errorBanner,
}: {
  pitches: CuratorPitch[];
  isLoading: boolean;
  skeleton: React.ReactNode;
  errorBanner: React.ReactNode;
}) {
  const [filter, setFilter] = useState<FilterKey>('waiting');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (filter === 'waiting') return pitches.filter((pitch) => !isPitchDecided(pitch));
    if (filter === 'decided') return pitches.filter(isPitchDecided);
    return pitches;
  }, [filter, pitches]);

  const waiting = waitingCount(pitches);
  const hasPaid = pitches.some((pitch) => pitch.paymentKind === 'paid' && !isPitchDecided(pitch));
  const selected = visible.find((pitch) => pitch.id === selectedId) ?? visible[0] ?? null;

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] leading-[38px] text-content-primary">Pitches</h1>
          <p className="mt-1 text-sm text-content-secondary">
            {waiting > 0 ? `${waiting} ${waiting === 1 ? 'song' : 'songs'} waiting for you.` : 'All caught up.'}
            {hasPaid ? ` ${replyWindowLine(PITCH_RESPONSE_WINDOW_HOURS)}` : ''}
          </p>
        </div>
        <div role="group" aria-label="Show" className="inline-flex shrink-0 rounded-full bg-bg-hover p-[3px]">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={filter === entry.key}
              onClick={() => setFilter(entry.key)}
              className={`motion-focus rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                filter === entry.key
                  ? 'bg-bg-surface font-semibold text-content-primary shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {errorBanner}

      {isLoading ? (
        skeleton
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-stroke-default bg-bg-surface p-10 text-center">
          <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg-hover text-content-tertiary">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-content-primary">
            {filter === 'decided' ? 'Nothing answered yet' : 'No pitches yet'}
          </p>
          <p className="mt-1 text-sm text-content-secondary">
            {filter === 'decided'
              ? 'Songs you add or pass show up here.'
              : 'Add a playlist so artist teams can find you.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <ul className="overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
            {visible.map((pitch) => (
              <PitchRow
                key={pitch.id}
                pitch={pitch}
                selected={pitch.id === selected?.id}
                onSelect={() => setSelectedId(pitch.id)}
              />
            ))}
          </ul>
          {selected ? <PitchDetail key={selected.id} pitch={selected} /> : null}
        </div>
      )}
    </div>
  );
}
