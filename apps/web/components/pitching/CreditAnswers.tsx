'use client';

// Answers, on credits (URG-345; approved v2 mocks, Oct 17, 2026). One row per
// curator: the face, who and which playlist, then what happened. Answered (with
// the reply), days left while a paid-tier pitch waits, or "Credits back" when
// the curator missed the 7 days and the credits came home.

import type { SentPitch } from '@/types/pitching';
import {
  ANSWERED,
  CREDITS_BACK,
  WAITING,
  answersCount,
  daysLeft,
  daysLeftLabel,
  refundedLine,
} from '@/lib/pitch-credits';
import { CuratorFace } from './CuratorFace';

const isAnswered = (pitch: SentPitch): boolean => pitch.status === 'added' || pitch.status === 'passed';

function outcomeLine(pitch: SentPitch): string {
  if (pitch.status === 'added') return 'Added';
  if (pitch.status === 'passed') return 'Not added';
  if (pitch.status === 'listened') return 'Listened';
  return '';
}

export function CreditAnswers({ pitches }: { pitches: SentPitch[] }) {
  const answered = pitches.filter(isAnswered).length;
  return (
    <section aria-label="Answers" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-xl text-content-primary">Answers</h3>
        <p className="text-[13px] text-content-primary/55">{answersCount(answered, pitches.length)}</p>
      </div>
      <ul className="overflow-hidden rounded-2xl bg-bg-surface">
        {pitches.map((pitch, index) => (
          <AnswerRow key={pitch.id} pitch={pitch} first={index === 0} />
        ))}
      </ul>
    </section>
  );
}

function AnswerRow({ pitch, first }: { pitch: SentPitch; first: boolean }) {
  const answered = isAnswered(pitch);
  const expired = pitch.status === 'expired';
  const charged = pitch.creditsCharged ?? 0;
  const waitingPaid = !answered && !expired && charged > 0 && Boolean(pitch.responseDueAt);
  const outcome = outcomeLine(pitch);
  const sub = expired
    ? refundedLine(charged)
    : [pitch.playlistName, answered ? outcome : ''].filter(Boolean).join(' · ');

  return (
    <li className="flex gap-3 pl-4">
      <span className="mt-3 shrink-0">
        <CuratorFace name={pitch.curatorName} photoUrl={pitch.curatorPhotoUrl ?? null} size={40} />
      </span>
      <div className={`min-w-0 flex-1 py-3 pr-4 ${first ? '' : 'border-t border-content-primary/10'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] text-content-primary">{pitch.curatorName}</p>
            <p className="truncate text-[13px] text-content-primary/55">{sub}</p>
          </div>
          {answered ? (
            <span className="shrink-0 rounded-full bg-brand/15 px-2.5 py-0.5 text-[12px] font-semibold text-brand">
              {ANSWERED}
            </span>
          ) : expired ? (
            <span className="shrink-0 rounded-full bg-status-warning/15 px-2.5 py-0.5 text-[12px] font-semibold text-status-warning">
              {CREDITS_BACK}
            </span>
          ) : (
            <span className="shrink-0 text-[13px] text-content-primary/55">
              {waitingPaid ? daysLeftLabel(daysLeft(pitch.responseDueAt)) : outcome || WAITING}
            </span>
          )}
        </div>
        {answered && pitch.reply ? (
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] text-content-primary/80">{pitch.reply}</p>
        ) : null}
      </div>
    </li>
  );
}
