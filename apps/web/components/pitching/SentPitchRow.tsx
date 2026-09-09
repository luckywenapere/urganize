'use client';

// One sent pitch, with the curator's answer on it.
//
// Extracted from PitchScene 2026-09-09 so the team-wide Pitching page renders
// the same row: a pitch has to look identical whether it is read inside its
// release or in a list spanning all of them.

import type { PitchStatus, SentPitch } from '@/types/pitching';
import { PITCH_STATUS_LABELS } from '@/lib/pitching';
import { formatRelativeTime } from '@/lib/relative-time';

const statusPillClass = (status: PitchStatus): string => {
  const base =
    'inline-flex h-6 shrink-0 items-center rounded-full px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]';
  if (status === 'added') return `${base} bg-brand/15 text-brand`;
  if (status === 'passed') return `${base} bg-bg-elevated text-content-secondary`;
  if (status === 'listened') return `${base} bg-status-info/15 text-status-info`;
  return `${base} bg-status-warning/15 text-status-warning`;
};

export function SentPitchRow({ pitch }: { pitch: SentPitch }) {
  return (
    <li className="rounded-xl border border-stroke-default bg-bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-content-primary">
            {pitch.playlistName}
          </p>
          <p className="truncate text-xs text-content-secondary">
            {pitch.curatorName} · {pitch.songTitle}
          </p>
        </div>
        <span className={statusPillClass(pitch.status)}>{PITCH_STATUS_LABELS[pitch.status]}</span>
      </div>
      {pitch.reply ? (
        <p className="mt-2 rounded-lg bg-bg-elevated px-2 py-1.5 text-sm text-content-secondary">
          {pitch.reply}
        </p>
      ) : null}
      <p className="mt-2 font-mono text-[11px] text-content-tertiary">
        Sent {formatRelativeTime(pitch.createdAt)} by {pitch.pitcherName}
      </p>
    </li>
  );
}
