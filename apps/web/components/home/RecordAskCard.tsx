'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from '@/components/icons';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { lagosToday, MAX_DATE_HINT, MAX_IDEA } from '@/lib/next-records';
import {
  RECORD_ASK_COPY,
  describeSessionQuestion,
  type RecordAsk,
  type SessionCheckAsk,
  type WhatsNextAsk,
} from '@/lib/home/record-ask';
import { answerSession, snoozeWhatsNext, startRecordWithIdea } from '@/lib/home/record-ask-client';
import { useHomeStore } from '@/stores/useHomeStore';

// Home asks about the next record (2026-10-27, step 3, mock screen 1). One card
// in the One Thing: "What's next for <artist>?" or "Did it happen?". Rules in
// lib/home/record-ask.ts.

const CARD = 'rounded-[20px] border border-brand/40 bg-brand/10 px-5 pb-5 pt-5';
const LABEL = 'font-mono text-[11px] uppercase tracking-[0.14em] text-brand';
const FIELD =
  'h-12 w-full rounded-lg border border-stroke-control bg-bg-surface px-3 text-base text-content-primary placeholder:text-content-tertiary focus:border-stroke-strong focus:outline-none';
const QUIET =
  'motion-focus mt-3 inline-flex min-h-11 items-center text-sm text-content-secondary underline underline-offset-4 hover:text-content-primary disabled:opacity-50';
const CHOICE =
  'motion-focus motion-press min-h-11 rounded-full border border-stroke-default bg-bg-surface px-3 text-sm font-semibold text-content-primary hover:border-stroke-strong disabled:opacity-50';

export function RecordAskCard({ ask }: { ask: RecordAsk }) {
  return ask.kind === 'whats_next' ? <WhatsNext ask={ask} /> : <SessionCheck ask={ask} />;
}

function useReloadHome() {
  const load = useHomeStore((state) => state.load);
  return () => void load({ force: true });
}

function WhatsNext({ ask }: { ask: WhatsNextAsk }) {
  const router = useRouter();
  const reloadHome = useReloadHome();
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    const line = idea.trim();
    if (!line || busy) return;
    setBusy(true);
    setError(null);
    const result = await startRecordWithIdea(ask.artistId, line);
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    captureAnalyticsEvent({ name: 'record_started', properties: { artist_id: ask.artistId, source: 'home_ask' } });
    captureAnalyticsEvent({ name: 'record_ask_answered', properties: { kind: 'whats_next', answer: 'started' } });
    router.push(`/dashboard/artists/${ask.artistId}/records/${result.value.id}`);
  };

  const snooze = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await snoozeWhatsNext(ask.artistId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    captureAnalyticsEvent({ name: 'record_ask_answered', properties: { kind: 'whats_next', answer: 'snoozed' } });
    reloadHome();
  };

  return (
    <section className={CARD} data-home-card="record-ask" data-record-ask="whats_next">
      <p className={LABEL}>{RECORD_ASK_COPY.label}</p>
      <h2 className="mt-2 break-words text-base font-semibold leading-snug text-content-primary">
        {RECORD_ASK_COPY.whatsNextTitle(ask)}
      </h2>
      <p className="mt-1 text-sm text-content-secondary">{RECORD_ASK_COPY.whatsNextLine}</p>
      <form
        className="relative mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        <label className="sr-only" htmlFor={`record-idea-${ask.artistId}`}>
          {`What's next for ${ask.artistName}`}
        </label>
        <input
          id={`record-idea-${ask.artistId}`}
          value={idea}
          maxLength={MAX_IDEA}
          onChange={(event) => setIdea(event.target.value)}
          placeholder={RECORD_ASK_COPY.whatsNextPlaceholder}
          className={`${FIELD} pr-14`}
          disabled={busy}
        />
        <button
          type="submit"
          aria-label={RECORD_ASK_COPY.send}
          disabled={busy || !idea.trim()}
          className="motion-focus motion-press absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full bg-brand text-content-inverse hover:bg-brand-hover disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-status-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" onClick={() => void snooze()} disabled={busy} className={QUIET}>
        {RECORD_ASK_COPY.snooze}
      </button>
    </section>
  );
}

function SessionCheck({ ask }: { ask: SessionCheckAsk }) {
  const reloadHome = useReloadHome();
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = lagosToday();

  const answer = async (
    choice: Parameters<typeof answerSession>[2],
    key: 'happened' | 'moved' | 'cancelled'
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await answerSession(ask.recordId, ask.session, choice);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    captureAnalyticsEvent({ name: 'record_ask_answered', properties: { kind: 'session_check', answer: key } });
    reloadHome();
  };

  return (
    <section className={CARD} data-home-card="record-ask" data-record-ask="session_check">
      <p className={LABEL}>{RECORD_ASK_COPY.label}</p>
      <h2 className="mt-2 break-words text-base font-semibold leading-snug text-content-primary">
        {describeSessionQuestion(ask.session, today)}
      </h2>
      <p className="mt-1 text-sm text-content-secondary">
        {[ask.artistName, ask.recordTitle].filter(Boolean).join(' · ')}
      </p>
      {moving ? (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const words = hint.trim();
            if (!date && !words) return;
            void answer({ status: 'moved', date: date || null, dateHint: date ? '' : words }, 'moved');
          }}
        >
          <label className="block text-sm font-semibold text-content-primary" htmlFor={`moved-day-${ask.session.id}`}>
            {RECORD_ASK_COPY.movedQuestion}
          </label>
          <input
            id={`moved-day-${ask.session.id}`}
            type="date"
            value={date}
            min={today}
            onChange={(event) => setDate(event.target.value)}
            className={`mt-1.5 ${FIELD}`}
            disabled={busy}
          />
          <label className="sr-only" htmlFor={`moved-words-${ask.session.id}`}>
            {RECORD_ASK_COPY.movedHint}
          </label>
          <input
            id={`moved-words-${ask.session.id}`}
            value={hint}
            maxLength={MAX_DATE_HINT}
            onChange={(event) => setHint(event.target.value)}
            placeholder={RECORD_ASK_COPY.movedHint}
            className={`mt-2.5 ${FIELD}`}
            disabled={busy || Boolean(date)}
          />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setMoving(false)}
              disabled={busy}
              className={CHOICE}
            >
              {RECORD_ASK_COPY.back}
            </button>
            <button
              type="submit"
              disabled={busy || (!date && !hint.trim())}
              className="motion-focus motion-press min-h-11 rounded-full bg-brand text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
            >
              {RECORD_ASK_COPY.save}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" disabled={busy} className={CHOICE} onClick={() => void answer({ status: 'happened' }, 'happened')}>
            {RECORD_ASK_COPY.happened}
          </button>
          <button type="button" disabled={busy} className={CHOICE} onClick={() => setMoving(true)}>
            {RECORD_ASK_COPY.moved}
          </button>
          <button type="button" disabled={busy} className={CHOICE} onClick={() => void answer({ status: 'cancelled' }, 'cancelled')}>
            {RECORD_ASK_COPY.cancelled}
          </button>
        </div>
      )}
      {error ? (
        <p className="mt-2 text-sm text-status-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
