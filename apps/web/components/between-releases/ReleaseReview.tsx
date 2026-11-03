'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@urganize/ui';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { REVIEW_ANSWER_MAX_LENGTH, REVIEW_QUESTIONS, type ReleaseReviewView, type ReviewAnswers } from '@/lib/release-review';
import { StartNextSheet } from './StartNextSheet';
import { useReleaseReview } from './useReleaseReview';

/**
 * The post-release review on the rollout page (URG-253; mocks approved by Oyin
 * 2026-10-16). Renders nothing before the review opens (28 days after release
 * day, or every activity done). One idea per block, numbers in a row, one
 * primary action: Start the next one.
 */
export function ReleaseReview({ releaseId, artistId }: { releaseId: string; artistId: string | null }) {
  const { state, reload, saveAnswers, setDismissed, saving, saveError } = useReleaseReview(releaseId);

  if (state.status === 'none') return null;
  if (state.status === 'loading') return <ReviewShell><ReviewSkeleton /></ReviewShell>;
  if (state.status === 'error') {
    return (
      <ReviewShell tone="warning">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-content-secondary">Couldn&apos;t load the review.</p>
          <Button variant="secondary" size="sm" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      </ReviewShell>
    );
  }
  return (
    <ReviewBody
      review={state.review}
      artistId={artistId}
      saving={saving}
      saveError={saveError}
      onSave={saveAnswers}
      onDismiss={() => void setDismissed(true)}
    />
  );
}

function ReviewShell({ tone = 'accent', children }: { tone?: 'accent' | 'warning'; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="relative pt-3.5" data-review-card>
      <h2 className="absolute left-3 top-0 z-20">
        <span
          id={headingId}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-base px-2.5 text-[11px] font-semibold text-content-secondary"
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${tone === 'warning' ? 'bg-status-warning' : 'bg-brand'}`}
          />
          Review
        </span>
      </h2>
      <div className="relative z-10 rounded-2xl border border-stroke-default bg-bg-surface px-4 pb-4 pt-6">{children}</div>
    </section>
  );
}

function ReviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the review" className="animate-pulse">
      <div className="h-6 w-3/5 rounded-md bg-bg-hover" />
      <div className="mt-4 flex gap-6 border-y border-stroke-subtle py-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-10 w-16 rounded-md bg-bg-hover" />
        ))}
      </div>
      <div className="mt-4 h-4 w-11/12 rounded-md bg-bg-hover" />
      <div className="mt-2 h-4 w-2/3 rounded-md bg-bg-hover" />
    </div>
  );
}

function ReviewBody({
  review,
  artistId,
  saving,
  saveError,
  onSave,
  onDismiss,
}: {
  review: ReleaseReviewView;
  artistId: string | null;
  saving: boolean;
  saveError: string;
  onSave: (answers: ReviewAnswers) => Promise<boolean>;
  onDismiss: () => void;
}) {
  const [answers, setAnswers] = useState<ReviewAnswers>(review.answers);
  const [startOpen, setStartOpen] = useState(false);
  useEffect(() => setAnswers(review.answers), [review.answers]);

  useEffect(() => {
    captureAnalyticsEvent({
      name: 'release_review_viewed',
      properties: { thin: review.thin, total: review.numbers.total, done: review.numbers.done },
    });
  }, [review.releaseId, review.thin, review.numbers.total, review.numbers.done]);

  const changed = review.questions.some((key) => (answers[key] ?? '') !== (review.answers[key] ?? ''));
  const thinUnanswered = review.thin && !review.questions.some((key) => review.answers[key]);
  const submit = async () => {
    const ok = await onSave(answers);
    if (ok) captureAnalyticsEvent({ name: 'release_review_answered', properties: { thin: review.thin } });
  };

  return (
    <ReviewShell>
      <h3 className="font-display text-xl leading-tight text-content-primary sm:text-[22px]">
        How did {review.title} go?
      </h3>

      {!review.thin ? (
        <dl className="mt-4 flex gap-7 border-y border-stroke-subtle py-3">
          <ReviewNumber label="Done" value={`${review.numbers.done}/${review.numbers.total}`} />
          <ReviewNumber label="On time" value={String(review.numbers.onTime)} />
          <ReviewNumber label="Late" value={String(review.numbers.late)} warn={review.numbers.late > 0} />
        </dl>
      ) : null}

      <div className="mt-4 flex gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand"
        >
          U
        </span>
        <p className="text-[15px] leading-relaxed text-content-primary">
          <span className="sr-only">AI: </span>
          {review.verdict}
        </p>
      </div>

      {review.worked.length > 0 || review.slipped.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-5">
          <ReviewList title="What worked" items={review.worked} />
          <ReviewList title="What slipped" items={review.slipped} />
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {review.questions.map((key) => (
          <label key={key} className="block">
            <span className="mb-1.5 block text-[13px] text-content-secondary">{REVIEW_QUESTIONS[key]}</span>
            <input
              type="text"
              value={answers[key] ?? ''}
              maxLength={REVIEW_ANSWER_MAX_LENGTH}
              placeholder="Optional"
              onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))}
              className="motion-focus h-11 w-full rounded-[10px] border border-stroke-control bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-stroke-strong focus:outline-none"
            />
          </label>
        ))}
      </div>

      {saveError ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {saveError}
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-2.5">
        {thinUnanswered || changed ? (
          <>
            <Button className="flex-1 sm:flex-none" isLoading={saving} onClick={() => void submit()}>
              {thinUnanswered ? 'Write the review' : 'Save'}
            </Button>
            {!review.dismissed ? (
              <Button variant="ghost" onClick={onDismiss} disabled={saving}>
                {thinUnanswered ? 'Skip' : 'Done'}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button
              className="flex-1 sm:flex-none"
              onClick={() => {
                captureAnalyticsEvent({ name: 'start_next_opened', properties: { source: 'review' } });
                setStartOpen(true);
              }}
            >
              Start the next one
            </Button>
            {!review.dismissed ? (
              <Button variant="ghost" onClick={onDismiss} disabled={saving}>
                Done
              </Button>
            ) : null}
          </>
        )}
      </div>

      {startOpen ? <StartNextSheet defaultArtistId={artistId} onClose={() => setStartOpen(false)} /> : null}
    </ReviewShell>
  );
}

function ReviewNumber({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dd className={`text-[22px] font-semibold tabular-nums ${warn ? 'text-status-warning' : 'text-content-primary'}`}>
        {value}
      </dd>
      <dt className="text-xs text-content-tertiary">{label}</dt>
    </div>
  );
}

function ReviewList({ title, items }: { title: string; items: ReleaseReviewView['worked'] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold text-content-tertiary">{title}</h4>
      <ul>
        {items.map((item) => (
          <li
            key={item.taskId}
            className="flex justify-between gap-3 border-t border-stroke-subtle py-2 text-sm text-content-primary"
          >
            <span className="min-w-0 truncate">{item.title}</span>
            <span className="shrink-0 text-xs text-content-tertiary">{item.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
