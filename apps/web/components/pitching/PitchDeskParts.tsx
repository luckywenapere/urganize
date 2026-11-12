'use client';

// The desktop Pitch tab's own pieces (#1215, part of #1175; approved mock
// docs/mocks/pitch-desktop). Presentational only: CreditPitchPicker keeps
// every bit of state and every payment path, and hands these what to show.
//
// - CuratorRows: one card with the platform chips and the curator rows (tick
//   box, face, name, playlist, price or "Free"); ticked rows go light green.
// - SummaryCard: the dark card on the right that adds up the credits as rows
//   are ticked, shows what the team holds, and holds the one send button.
// - SentCard: this rollout's real sent pitches and what came back.
//
// Phones never mount these: PitchScene picks the desktop layout from `lg` up.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Loader2 } from '@/components/icons';
import type { BrowsablePlaylist, PitchPlatform, SentPitch } from '@/types/pitching';
import { PITCH_PLATFORM_LABELS } from '@/lib/pitching';
import {
  ANSWERED,
  CREDITS_BACK,
  EMPTY_PLATFORM_LINE,
  PITCH_MORE,
  SENT_NOTE,
  SENT_NOTE_FREE,
  TOP_UP_AND_SEND,
  WAITING,
  daysLeft,
  daysLeftLabel,
  emptyPlatform,
  normalizeCreditPrice,
  refundedLine,
  sentReceipt,
  sentTitle,
} from '@/lib/pitch-credits';
import {
  FREE_PICKS_LINE,
  NOTHING_PICKED_LINE,
  PICK_PROMISE,
  creditsAmount,
  curatorsPicked,
  sendToCurators,
  sentDayLabel,
  shortLine,
  type PitchSummary,
} from '@/lib/pitch-summary';
import { CuratorFace } from './CuratorFace';

const INK = 'bg-[#1d2a21] text-[#f5f0e6]';
const ON_INK_SOFT = 'text-[#f5f0e6]/70';

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function CuratorRows({
  platforms,
  platform,
  onPlatform,
  playlists,
  visible,
  selected,
  onToggle,
  loadError,
  onRetry,
  loadErrorText,
}: {
  platforms: readonly PitchPlatform[];
  platform: PitchPlatform | '';
  onPlatform: (platform: PitchPlatform) => void;
  playlists: BrowsablePlaylist[] | null;
  visible: BrowsablePlaylist[];
  selected: string[];
  onToggle: (playlistId: string) => void;
  loadError: boolean;
  onRetry: () => void;
  loadErrorText: string;
}) {
  const platformLabel = platform ? PITCH_PLATFORM_LABELS[platform] : '';
  return (
    <div className="rounded-2xl border border-stroke-default bg-bg-surface px-5 pb-2 pt-4">
      <div role="radiogroup" aria-label="Platform" className="flex flex-wrap gap-2 pb-3">
        {platforms.map((entry) => {
          const active = entry === platform;
          return (
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPlatform(entry)}
              className={`motion-focus inline-flex h-8 items-center rounded-full px-3 text-[13px] transition-colors ${
                active
                  ? 'bg-content-primary font-semibold text-bg-base'
                  : 'border border-stroke-control font-medium text-content-secondary hover:text-content-primary'
              }`}
            >
              {PITCH_PLATFORM_LABELS[entry]}
            </button>
          );
        })}
      </div>

      {loadError ? (
        <div className="border-t border-stroke-subtle py-6">
          <p className="text-sm font-semibold text-content-primary" role="alert">
            {loadErrorText}
          </p>
          <button type="button" onClick={onRetry} className="motion-focus mt-1 min-h-10 text-sm font-semibold text-brand hover:underline">
            Try again
          </button>
        </div>
      ) : !playlists ? (
        <ul aria-busy="true" aria-label="Loading curators">
          {Array.from({ length: 4 }).map((_, index) => (
            <li key={index} className="grid grid-cols-[22px_40px_minmax(0,1fr)_90px] items-center gap-3 border-t border-stroke-subtle py-3">
              <span className="h-5 w-5 animate-pulse rounded-md bg-bg-elevated" />
              <span className="h-10 w-10 animate-pulse rounded-full bg-bg-elevated" />
              <span className="space-y-2">
                <span className="block h-3 w-2/5 animate-pulse rounded bg-bg-elevated" />
                <span className="block h-2.5 w-1/4 animate-pulse rounded bg-bg-elevated" />
              </span>
              <span className="ml-auto h-3 w-14 animate-pulse rounded bg-bg-elevated" />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="border-t border-stroke-subtle py-8 text-center">
          <p className="text-[15px] font-semibold text-content-primary">{emptyPlatform(platformLabel)}</p>
          <p className="mt-0.5 text-[13px] text-content-secondary">{EMPTY_PLATFORM_LINE}</p>
        </div>
      ) : (
        <ul aria-label={`${platformLabel} curators`}>
          {visible.map((playlist) => {
            const isOn = selected.includes(playlist.id);
            const price = normalizeCreditPrice(playlist.creditPrice);
            return (
              <li key={playlist.id} className={isOn ? '-mx-5 bg-brand/10' : 'border-t border-stroke-subtle'}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isOn}
                  onClick={() => onToggle(playlist.id)}
                  className={`motion-focus grid w-full grid-cols-[22px_40px_minmax(0,1fr)_90px] items-center gap-3 py-3 text-left transition-colors ${
                    isOn ? 'px-5' : 'hover:bg-bg-hover/40'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-5 w-5 place-items-center rounded-md text-content-inverse transition-colors ${
                      isOn ? 'bg-brand' : 'border-[1.5px] border-stroke-control'
                    }`}
                  >
                    {isOn ? <Tick /> : null}
                  </span>
                  <CuratorFace name={playlist.curatorName} photoUrl={playlist.curatorPhotoUrl} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-content-primary">{playlist.curatorName}</span>
                    <span className="block truncate text-xs text-content-secondary">{playlist.name}</span>
                  </span>
                  <span className={`text-right text-sm font-semibold tabular-nums ${price > 0 ? 'text-content-primary' : 'text-brand'}`}>
                    {creditsAmount(price)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export type DeskSent = { count: number; charged: number; balance: number | null };

export function SummaryCard({
  summary,
  sending,
  status,
  atLimit,
  sent,
  onSend,
  onMore,
}: {
  summary: PitchSummary;
  sending: boolean;
  status: string;
  atLimit: boolean;
  sent: DeskSent | null;
  onSend: () => void;
  onMore: () => void;
}) {
  if (sent && summary.count === 0) {
    return (
      <div className={`rounded-2xl p-5 ${INK}`} role="status">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${ON_INK_SOFT}`}>Your pitch</p>
        <h3 className="mt-1.5 font-display text-[22px] leading-7">{sentTitle(sent.count)}</h3>
        {sent.balance !== null ? <p className={`mt-1 text-sm ${ON_INK_SOFT}`}>{sentReceipt(sent.charged, sent.balance)}</p> : null}
        <p className={`mt-3 text-xs leading-4 ${ON_INK_SOFT}`}>{sent.charged > 0 ? SENT_NOTE : SENT_NOTE_FREE}</p>
        <button
          type="button"
          onClick={onMore}
          className="motion-focus motion-press mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#f5f0e6] text-sm font-semibold text-[#1d2a21]"
        >
          {PITCH_MORE}
        </button>
      </div>
    );
  }

  const { count, lines, total, balance, short } = summary;
  const label = short > 0 ? TOP_UP_AND_SEND : sendToCurators(count);
  const promise = count === 0 || total > 0 ? PICK_PROMISE : FREE_PICKS_LINE;
  const row = 'flex items-baseline justify-between gap-3 border-t border-[#f5f0e6]/[0.14] py-2 first:border-t-0';

  return (
    <div className={`rounded-2xl p-5 ${INK}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${ON_INK_SOFT}`}>Your pitch</p>
      <h3 className="mt-1.5 font-display text-[22px] leading-7" aria-live="polite">
        {curatorsPicked(count)}
      </h3>
      {count === 0 ? <p className={`mt-1 text-sm ${ON_INK_SOFT}`}>{NOTHING_PICKED_LINE}</p> : null}

      <dl className="mt-3 text-sm">
        {lines.map((line) => (
          <div key={line.id} className={row}>
            <dt className={`min-w-0 truncate ${ON_INK_SOFT}`}>{line.name}</dt>
            <dd className="shrink-0 font-semibold tabular-nums">{line.credits > 0 ? line.credits.toLocaleString('en') : 'Free'}</dd>
          </div>
        ))}
        {count > 0 ? (
          <div className={row}>
            <dt className={ON_INK_SOFT}>Total</dt>
            <dd className="font-semibold tabular-nums">{creditsAmount(total)}</dd>
          </div>
        ) : null}
        {balance !== null ? (
          <div className={row}>
            <dt className={ON_INK_SOFT}>You have</dt>
            <dd className="font-semibold tabular-nums">
              {balance.toLocaleString('en')} {balance === 1 ? 'credit' : 'credits'}
            </dd>
          </div>
        ) : null}
      </dl>

      {short > 0 ? (
        <p className="mt-2 text-sm font-semibold text-[#ffcf8a]" role="status">
          {shortLine(short)} Top up and your pitches send once you pay.
        </p>
      ) : null}
      {atLimit ? <p className="mt-2 text-sm font-semibold text-[#ffcf8a]">10 pitches are waiting. Wait for a reply first.</p> : null}
      {status ? (
        <p className={`mt-2 text-sm ${ON_INK_SOFT}`} aria-live="polite">
          {status}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onSend}
        disabled={count === 0 || atLimit || sending}
        className="motion-focus motion-press mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#f5f0e6] text-sm font-semibold text-[#1d2a21] transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {label}
      </button>
      <p className={`mt-3 text-xs leading-4 ${ON_INK_SOFT}`}>{promise}</p>
    </div>
  );
}

const isAnswered = (pitch: SentPitch): boolean => pitch.status === 'added' || pitch.status === 'passed';

function outcome(pitch: SentPitch): string {
  if (pitch.status === 'added') return 'Added';
  if (pitch.status === 'passed') return 'Not added';
  if (pitch.status === 'listened') return 'Listened';
  return '';
}

/** One sent pitch: who, which playlist and when, then what came back. */
function SentRow({ pitch }: { pitch: SentPitch }) {
  const answered = isAnswered(pitch);
  const expired = pitch.status === 'expired';
  const charged = pitch.creditsCharged ?? 0;
  const waitingPaid = !answered && !expired && charged > 0 && Boolean(pitch.responseDueAt);
  const sub = expired
    ? refundedLine(charged)
    : [pitch.playlistName, sentDayLabel(pitch.createdAt)].filter(Boolean).join(' · ');
  const pill = answered
    ? { text: `${ANSWERED}${outcome(pitch) ? `, ${outcome(pitch).toLowerCase()}` : ''}`, tone: 'bg-brand/10 text-brand' }
    : expired
      ? { text: CREDITS_BACK, tone: 'bg-status-warning/15 text-status-warning' }
      : {
          text: waitingPaid ? `${WAITING}, ${daysLeftLabel(daysLeft(pitch.responseDueAt)).toLowerCase()}` : outcome(pitch) || WAITING,
          tone: 'bg-bg-elevated text-content-secondary',
        };

  return (
    <li className="flex gap-3 border-t border-stroke-subtle py-3 first:border-t-0">
      <CuratorFace name={pitch.curatorName} photoUrl={pitch.curatorPhotoUrl ?? null} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-content-primary">{pitch.curatorName}</p>
            <p className="truncate text-xs text-content-secondary">{sub}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 text-xs font-semibold leading-5 ${pill.tone}`}>{pill.text}</span>
        </div>
        {answered && pitch.reply ? (
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-content-primary/80">{pitch.reply}</p>
        ) : null}
      </div>
    </li>
  );
}

export function SentCard({
  pitches,
  loading,
  showInbox,
}: {
  pitches: SentPitch[];
  loading: boolean;
  /** Dual accounts only (the person is also a curator). */
  showInbox: boolean;
}) {
  const answered = pitches.filter(isAnswered).length;
  return (
    <section aria-label="Sent" className="rounded-2xl border border-stroke-default bg-bg-surface px-5 pb-2 pt-3">
      <div className="flex items-baseline justify-between gap-3 pb-2 pt-1">
        <h3 className="font-display text-lg leading-6 text-content-primary">
          Sent{' '}
          <span className="font-sans text-[13px] font-medium text-content-secondary">
            {pitches.length > 0 ? `· ${answered} of ${pitches.length} answered` : '· answers come back here'}
          </span>
        </h3>
        {showInbox ? (
          <Link href="/curator" className="motion-focus text-[13px] font-semibold text-brand hover:underline">
            Curator inbox
          </Link>
        ) : null}
      </div>
      {loading ? (
        <div className="space-y-2 py-3" aria-busy="true" aria-label="Loading sent pitches">
          <span className="block h-3 w-1/2 animate-pulse rounded bg-bg-elevated" />
          <span className="block h-2.5 w-1/3 animate-pulse rounded bg-bg-elevated" />
        </div>
      ) : pitches.length === 0 ? (
        <p className="border-t border-stroke-subtle py-4 text-sm text-content-secondary">
          Nothing sent yet. Who you pitch and what they say shows up here.
        </p>
      ) : (
        <ul>
          {pitches.map((pitch) => (
            <SentRow key={pitch.id} pitch={pitch} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Left and right columns, 360 on the right, one content width of 1120. */
export function PitchDeskGrid({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="mx-auto mt-6 grid w-full max-w-[1120px] grid-cols-[minmax(0,1fr)_340px] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">{left}</div>
      <div className="sticky top-4 space-y-4">{right}</div>
    </div>
  );
}

/** The whole page while it first loads; mirrored in WorkspaceSkeleton. */
export function PitchDeskSkeleton() {
  return (
    <div className="mx-auto mt-6 grid w-full max-w-[1120px] grid-cols-[minmax(0,1fr)_340px] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]" aria-hidden="true">
      <div className="space-y-4">
        <span className="block h-10 w-72 animate-pulse rounded-lg bg-bg-elevated" />
        <span className="block h-4 w-96 animate-pulse rounded-md bg-bg-elevated" />
        <span className="block h-[280px] w-full animate-pulse rounded-2xl bg-bg-elevated" />
        <span className="block h-[120px] w-full animate-pulse rounded-2xl bg-bg-elevated" />
      </div>
      <div className="space-y-4">
        <span className="block h-[220px] w-full animate-pulse rounded-2xl bg-bg-elevated" />
        <span className="block h-[180px] w-full animate-pulse rounded-2xl bg-bg-elevated" />
      </div>
    </div>
  );
}
