'use client';

import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { buildMonthGrid, bucketPostsByDay, getWeekLabel } from '@/lib/content-calendar';
import type { ContentPost } from '@/types/content-calendar';
import { PostChip } from './PostChip';

/**
 * Agenda list for the content calendar (URG-157, Phase A). Shown when the
 * scene's column is too narrow for the month grid (`cc-agenda-view` — a
 * container-width gate since 2026-08-10, not the old viewport `lg:` one).
 * Vertical list of the month's days that have posts, plus today (even when
 * today is empty, so there is always a touch-creation anchor), with
 * week-relative labels as section dividers. No 2-chip cap here: a list row
 * can grow to fit content, unlike a fixed grid cell.
 *
 * Because only occupied days (and today) render as rows, a standalone
 * "Plan a post" affordance is REQUIRED here: an empty future month — the
 * default view for any future-dated release — used to show "Tap a day"
 * with zero tappable days, a hard dead end on touch (fixed 2026-08-10).
 * The date field in the post form is editable, so any day of the month is
 * reachable from that one button.
 */

function formatWeekday(dateIso: string): string {
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en', { weekday: 'short' }).format(parsed).toUpperCase();
}

function formatMonthDay(dateIso: string): string {
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric' }).format(parsed);
}

type AgendaListProps = {
  month: string;
  releaseDate: string | null;
  posts: ContentPost[];
  today: string;
  onCreatePost: (date: string) => void;
  onOpenPost: (post: ContentPost) => void;
  onToggleStatus: (post: ContentPost) => void;
};

export function AgendaList({ month, releaseDate, posts, today, onCreatePost, onOpenPost, onToggleStatus }: AgendaListProps) {
  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const byDay = useMemo(() => bucketPostsByDay(posts, month, today), [posts, month, today]);

  const weekSections = useMemo(() => {
    return grid.weeks
      .map((week) => ({
        weekStart: week.weekStart,
        label: getWeekLabel(week.weekStart, releaseDate),
        days: week.days.filter((day) => day.inMonth && (byDay.has(day.date) || day.date === today)),
      }))
      .filter((section) => section.days.length > 0);
  }, [grid, byDay, releaseDate, today]);

  // The seed date for the standalone create button: today when the viewed
  // month contains it, otherwise the 1st — the form's date field is editable,
  // so this only has to be a sensible starting point, not the final answer.
  const createSeedDate = today.slice(0, 7) === month ? today : `${month}-01`;

  const planPostButton = (label: string) => (
    <button
      type="button"
      onClick={() => onCreatePost(createSeedDate)}
      className="inline-flex h-11 items-center justify-center gap-2 bg-[var(--cc-accent)] px-4 text-sm font-semibold text-[var(--cc-ground)] hover:opacity-90"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </button>
  );

  if (weekSections.length === 0) {
    return (
      <div className="cc-agenda-view">
        <div className="mt-4 flex flex-col items-center gap-4 border border-[var(--cc-border)] bg-[var(--cc-text)]/[0.03] p-6 text-center">
          <p className="text-sm text-[var(--cc-text-muted)]">Nothing planned this month yet.</p>
          {planPostButton('Plan a post')}
        </div>
      </div>
    );
  }

  return (
    <div className="cc-agenda-view">
      <div className="space-y-4">
        {weekSections.map((section) => (
          <div key={section.weekStart}>
            <div className="border-b border-[var(--cc-border)] pb-1 font-[family-name:var(--font-cc-mono)] text-[10px] font-bold uppercase tracking-wide text-[var(--cc-text-faint)]">
              {section.label ?? ' '}
            </div>
            <div className="mt-2 space-y-2">
              {section.days.map((day) => {
                const dayPosts = byDay.get(day.date) ?? [];
                const isToday = day.date === today;
                const isReleaseDay = day.date === releaseDate;
                return (
                  <div
                    key={day.date}
                    className={`border p-2 ${isReleaseDay ? 'border-[var(--cc-accent)]' : 'border-[var(--cc-border)]'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`font-[family-name:var(--font-cc-mono)] text-sm ${
                            isToday ? 'text-[var(--cc-accent)]' : 'text-[var(--cc-text)]'
                          }`}
                        >
                          {Number(day.date.slice(8, 10))}
                        </span>
                        <span className="font-[family-name:var(--font-cc-mono)] text-[10px] uppercase text-[var(--cc-text-faint)]">
                          {formatWeekday(day.date)}
                        </span>
                        {isReleaseDay ? (
                          <span className="font-[family-name:var(--font-cc-mono)] text-[9px] font-bold text-[var(--cc-accent)]">
                            OUT
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onCreatePost(day.date)}
                        aria-label={`Add a post on ${formatMonthDay(day.date)}`}
                        className="flex h-11 min-w-11 items-center justify-center gap-1 px-2 text-[11px] font-medium text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    </div>
                    {dayPosts.length > 0 ? (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {dayPosts.map((post) => (
                          <PostChip key={post.id} post={post} today={today} onOpen={onOpenPost} onToggleStatus={onToggleStatus} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {/* Only occupied days (and today) render rows above, so this is the
            one path to any OTHER day of the month on touch — the form's date
            field does the actual picking. */}
        <div className="flex justify-center pt-1">{planPostButton('Add a post')}</div>
      </div>
    </div>
  );
}
