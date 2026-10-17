'use client';

// The playlist owner's inbox. The whole design target is: open the app, listen
// to three songs, clear them, close the app. So a card shows everything needed
// to decide (song, artist, who sent it, the note), the link opens in one tap,
// and the four statuses are one tap each. The reply box only appears once a
// decision is made, because that is the only moment a reply means anything.
//
// A PAID pitch (curator pitch payments, 2026-09-25) gets its own card, because
// the artist bought something specific: a listen and a written reply inside the
// window. So it leads with the deadline and what replying earns, and the
// decision is Accept or Pass TOGETHER with the reply, once. Which card a pitch
// gets follows the row, never the feature flag, so a pitch somebody paid for
// keeps asking for its reply even if paid pitching is switched off later.

import { useEffect, useMemo, useState } from 'react';
import { Check, Headphones, ExternalLink, Inbox } from '@/components/icons';
import { CuratorShell } from '@/components/curator/CuratorShell';
import { CuratorInboxSkeleton } from '@/components/loading/CuratorSkeleton';
import { CuratorLoadError } from '@/components/curator/CuratorLoadError';
import { useCuratorStore } from '@/stores/useCuratorStore';
import {
  MAX_PITCH_REPLY_LENGTH,
  PITCH_PLATFORM_LABELS,
  PITCH_STATUS_LABELS,
  acceptsPitchReply,
  pitchStateLabel,
} from '@/lib/pitching';
import {
  MAX_PAID_FEEDBACK_LENGTH,
  MIN_PAID_FEEDBACK_WORDS,
  countWords,
  isReplyWindowClosed,
  validatePaidFeedback,
} from '@/lib/pitch-payments';
import {
  ACCEPT_LABEL,
  FEEDBACK_PROMPT,
  PASS_LABEL,
  WINDOW_CLOSED,
  feedbackWordCount,
  formatPitchDeadline,
  inboxCard,
  replyDueLine,
} from '@/lib/pitch-payment-copy';
import {
  PAID_ON_REPLY,
  curatorDaysLeft,
  daysLeft,
  replyEarningPill,
  wordCounter,
} from '@/lib/pitch-credits';
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
    'inline-flex h-9 min-w-[4.5rem] items-center justify-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-50';
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
  // Listening IS the "Listened" status (2026-10-11): one tap opens the song and
  // records it, so the curator never has to bookkeep. Then two big choices.
  const listen = () => {
    void openExternalUrl(pitch.songUrl);
    if (pitch.status === 'new') void applyStatus('listened');
  };

  return (
    <article className="rounded-2xl bg-bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 break-words font-display text-lg font-semibold leading-snug text-content-primary">
            {pitch.songTitle}
          </h2>
          <p className="truncate text-sm text-content-secondary">
            {pitch.artistName} · {pitch.playlistName}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-content-tertiary">
          {formatRelativeTime(pitch.createdAt)}
        </span>
      </div>

      {pitch.note ? (
        <p className="mt-3 whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-bg-elevated px-3 py-2 text-sm text-content-primary">
          {pitch.note}
        </p>
      ) : null}

      <button
        type="button"
        onClick={listen}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary transition-colors hover:border-stroke-strong"
      >
        <Headphones className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Listen{platformLabel ? ` on ${platformLabel}` : ''}</span>
        {pitch.status !== 'new' ? <Check className="h-4 w-4 shrink-0 text-brand" aria-label="Listened" /> : null}
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(['added', 'passed'] as const).map((status) => {
          const active = pitch.status === status;
          return (
            <button
              key={status}
              type="button"
              disabled={isSaving}
              aria-pressed={active}
              onClick={() => void applyStatus(status)}
              className={`inline-flex h-12 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                active
                  ? status === 'added'
                    ? 'bg-brand text-content-inverse'
                    : 'bg-content-primary text-bg-base'
                  : status === 'added'
                    ? 'bg-brand/10 text-brand hover:bg-brand/20'
                    : 'bg-bg-elevated text-content-secondary hover:text-content-primary'
              }`}
            >
              {active ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              {status === 'added' ? 'Add it' : 'Pass'}
            </button>
          );
        })}
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
              <label htmlFor={`reply-${pitch.id}`} className="sr-only">
                Reply (optional)
              </label>
              <input
                id={`reply-${pitch.id}`}
                type="text"
                value={reply}
                maxLength={MAX_PITCH_REPLY_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Say something back (optional)"
                className="h-11 w-full rounded-xl border border-stroke-control bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
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

/** The two statuses a curator sets on a paid pitch before deciding. */
const PAID_BOOKKEEPING_STATUSES = ['new', 'listened'] as const;

export function PaidPitchCard({ pitch }: { pitch: CuratorPitch }) {
  const setPitchStatus = useCuratorStore((state) => state.setPitchStatus);
  const [feedback, setFeedback] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const decided = pitch.status === 'added' || pitch.status === 'passed';
  // Said before the curator writes, not after: a reply the server would turn
  // away is a reply somebody took the time to write for nothing. The server
  // still decides, so a card left open past the deadline is refused there.
  const closed = !decided && isReplyWindowClosed(pitch.responseDueAt);
  const deadline = formatPitchDeadline(pitch.responseDueAt);
  const words = countWords(feedback);
  const platformLabel = pitch.songPlatform ? PITCH_PLATFORM_LABELS[pitch.songPlatform] : '';

  const mark = async (status: (typeof PAID_BOOKKEEPING_STATUSES)[number]) => {
    if (status === pitch.status) return;
    setError('');
    setIsSaving(true);
    try {
      await setPitchStatus(pitch.id, status);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Could not save that.');
    } finally {
      setIsSaving(false);
    }
  };

  const decide = async (status: 'added' | 'passed') => {
    // The same check the server makes, run first so a short reply is caught
    // without a round trip and without the card flickering to a decision.
    const check = validatePaidFeedback(feedback);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await setPitchStatus(pitch.id, status, check.value);
      setFeedback('');
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Could not save your reply.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="rounded-2xl bg-bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
            {pitch.playlistName}
          </p>
          <h2 className="mt-1 line-clamp-2 break-words text-base font-semibold text-content-primary">
            {pitch.songTitle}
          </h2>
          <p className="line-clamp-2 break-words text-sm text-content-secondary">{pitch.artistName}</p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-content-tertiary">
          {formatRelativeTime(pitch.createdAt)}
        </span>
      </div>

      {!decided && pitch.paidByUrganize && !closed && typeof pitch.shareKobo === 'number' ? (
        // A pitch the artist paid with credits (URG-345): naira only, the
        // reply's worth and the days left, one line (approved v2 mocks).
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="rounded-full bg-brand/15 px-3 py-1 text-[13px] font-semibold text-brand">
            {replyEarningPill(pitch.shareKobo)}
          </span>
          <span className="shrink-0 text-[13px] text-content-primary/55">
            {curatorDaysLeft(daysLeft(pitch.responseDueAt))}
          </span>
        </div>
      ) : !decided ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            closed ? 'bg-bg-elevated text-content-secondary' : 'bg-brand/10 text-content-primary'
          }`}
        >
          {closed
            ? WINDOW_CLOSED
            : typeof pitch.shareKobo === 'number'
              ? inboxCard(pitch.artistName, pitch.songTitle, deadline, pitch.shareKobo)
              : replyDueLine(deadline)}
        </p>
      ) : null}

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

      {decided ? (
        // Final. The artist has been told, so there is nothing to edit.
        <div className="mt-4 space-y-2">
          <span className={statusChipClass(pitch.status, true)}>{pitchStateLabel(pitch.status, 'paid')}</span>
          {pitch.reply ? (
            <p className="whitespace-pre-wrap rounded-xl border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-secondary">
              {pitch.reply}
            </p>
          ) : null}
        </div>
      ) : closed ? null : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {PAID_BOOKKEEPING_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                disabled={isSaving}
                aria-pressed={pitch.status === status}
                onClick={() => void mark(status)}
                className={statusChipClass(status, pitch.status === status)}
              >
                {pitch.status === status ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                {PITCH_STATUS_LABELS[status]}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            <label htmlFor={`feedback-${pitch.id}`} className="block text-sm text-content-secondary">
              {FEEDBACK_PROMPT}
            </label>
            <textarea
              id={`feedback-${pitch.id}`}
              rows={4}
              value={feedback}
              maxLength={MAX_PAID_FEEDBACK_LENGTH}
              onChange={(event) => setFeedback(event.target.value)}
              className="w-full rounded-xl border border-stroke-control bg-bg-base px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
            />
            {pitch.paidByUrganize ? (
              <div className="flex items-center justify-between gap-3 text-xs">
                <p
                  aria-live="polite"
                  className={words >= MIN_PAID_FEEDBACK_WORDS ? 'text-brand' : 'text-content-tertiary'}
                >
                  {wordCounter(words, MIN_PAID_FEEDBACK_WORDS)}
                </p>
                <p className="text-content-tertiary">{PAID_ON_REPLY}</p>
              </div>
            ) : (
              <p
                aria-live="polite"
                className={`text-xs ${words >= MIN_PAID_FEEDBACK_WORDS ? 'text-brand' : 'text-content-tertiary'}`}
              >
                {feedbackWordCount(words)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void decide('added')}
                className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {ACCEPT_LABEL}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void decide('passed')}
                className="inline-flex h-10 items-center rounded-xl border border-stroke-default px-4 text-sm font-semibold text-content-secondary transition-colors hover:border-stroke-strong hover:text-content-primary disabled:opacity-50"
              >
                {PASS_LABEL}
              </button>
            </div>
          </div>
        </>
      )}

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
  const loadError = useCuratorStore((state) => state.pitchesError);
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
      {(
        <div className="space-y-6">
          <header className="space-y-2">
            <h1 className="font-display text-3xl font-semibold text-content-primary">Pitches</h1>
            <p className="text-sm text-content-secondary">
              {waitingCount > 0
                ? `${waitingCount} new ${waitingCount === 1 ? 'song' : 'songs'} for you.`
                : 'All caught up.'}
            </p>
          </header>

          {/* A banner, not a replacement: an empty inbox is a legitimate state
              for a new curator, so the list keeps rendering its own empty state
              and this explains why it may be incomplete. */}
          {loadError ? (
            <CuratorLoadError
              message={loadError}
              variant="banner"
              isRetrying={isLoading}
              onRetry={() => void loadPitches({ force: true })}
            />
          ) : null}

          <div className="flex gap-2">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={filter === entry.key}
                onClick={() => setFilter(entry.key)}
                className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors ${
                  filter === entry.key
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-stroke-default text-content-secondary hover:border-stroke-strong'
                }`}
              >
                {filter === entry.key ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                {entry.label}
              </button>
            ))}
          </div>

          {/* The LIST waits, the page around it does not.
              Header and filters are real content and belong in the server HTML
              so this page is legible before its JavaScript lands (the /auth
              precedent, see CLAUDE.md). The list itself is gated because its
              empty state makes a CLAIM — "No pitches yet" — that we cannot
              honestly make before the load resolves. Do not swap this for a
              page-level skeleton gate; that is what made a curator on weak data
              see nothing at all. */}
          {isLoading && !hydrated ? (
            <CuratorInboxSkeleton />
          ) : visible.length === 0 ? (
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
              {visible.map((pitch) =>
                pitch.paymentKind === 'paid' ? (
                  <PaidPitchCard key={pitch.id} pitch={pitch} />
                ) : (
                  <PitchCard key={pitch.id} pitch={pitch} />
                )
              )}
            </div>
          )}
        </div>
      )}
    </CuratorShell>
  );
}
