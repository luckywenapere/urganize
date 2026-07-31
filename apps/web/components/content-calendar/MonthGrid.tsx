'use client';

import { Fragment, useMemo, useRef, useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import {
  buildMonthGrid,
  bucketPostsByDay,
  canQuickTogglePosted,
  getWeekLabel,
  isPostOverdue,
  type MonthGridDay,
} from '@/lib/content-calendar';
import type { ContentPost } from '@/types/content-calendar';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { PostChip } from './PostChip';
import { StatusMark } from './StatusMark';

/**
 * Desktop month grid for the content calendar (URG-157, Phase A). Hidden
 * below `lg` (AgendaList takes over there). 8-column CSS grid (a fixed-width
 * mono week-label gutter + 7 day columns) so the label column never jitters
 * whether a given week's label is suppressed or not.
 *
 * Keyboard: roving tabindex across every day cell, arrows move by day/week,
 * Enter opens create (empty day) or the day list (occupied day). Empty days
 * are real <button>s (nothing else lives inside them); occupied days are
 * plain <div>s containing sibling chip buttons, because a cell with chips
 * can't itself be a <button> without illegally nesting interactive content.
 */

const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function formatMonthDay(dateIso: string): string {
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric' }).format(parsed);
}

// Spelled out rather than React.MutableRefObject/RefObject: the exact
// exported ref-object type name has moved between React type-package
// versions, and this shape is trivial to state directly.
type CellRefMap = { current: Map<string, HTMLElement> };

type DayCellProps = {
  day: MonthGridDay;
  dayPosts: ContentPost[];
  isToday: boolean;
  isReleaseDay: boolean;
  today: string;
  isFocused: boolean;
  cellRefs: CellRefMap;
  setFocusedDate: (date: string) => void;
  onCreatePost: (date: string) => void;
  onOpenPost: (post: ContentPost) => void;
  onToggleStatus: (post: ContentPost) => void;
  onOpenDayList: (date: string) => void;
};

function DayCell({
  day,
  dayPosts,
  isToday,
  isReleaseDay,
  today,
  isFocused,
  cellRefs,
  setFocusedDate,
  onCreatePost,
  onOpenPost,
  onToggleStatus,
  onOpenDayList,
}: DayCellProps) {
  const dayNumber = Number(day.date.slice(8, 10));
  const monthDayLabel = formatMonthDay(day.date);
  const setRef = (el: HTMLElement | null) => {
    if (el) cellRefs.current.set(day.date, el);
    else cellRefs.current.delete(day.date);
  };
  const dayNumberClass = !day.inMonth
    ? 'text-[var(--cc-text-faint)]/50'
    : isToday
      ? 'text-[var(--cc-accent)]'
      : 'text-[var(--cc-text-faint)]';
  const borderClass = day.inMonth ? 'border-[var(--cc-border)]' : 'border-[var(--cc-border)]/50';

  if (dayPosts.length === 0) {
    return (
      <button
        type="button"
        ref={setRef}
        tabIndex={isFocused ? 0 : -1}
        onFocus={() => setFocusedDate(day.date)}
        onClick={() => onCreatePost(day.date)}
        aria-label={`Plan a post on ${monthDayLabel}`}
        className={`group relative flex min-h-[72px] flex-col items-start gap-1 border-b border-r p-1.5 text-left transition-colors hover:bg-[var(--cc-text)]/[0.03] ${borderClass} ${
          isReleaseDay ? 'border-[var(--cc-accent)]' : ''
        }`}
      >
        <span className={`font-[family-name:var(--font-cc-mono)] text-xs ${dayNumberClass}`}>{dayNumber}</span>
        {isReleaseDay ? (
          <span className="font-[family-name:var(--font-cc-mono)] text-[9px] font-bold tracking-wide text-[var(--cc-accent)]">
            OUT
          </span>
        ) : null}
        <Plus
          aria-hidden="true"
          className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 text-[var(--cc-text-faint)] opacity-0 transition-opacity group-hover:opacity-100"
        />
      </button>
    );
  }

  const overflowCount = Math.max(0, dayPosts.length - 2);
  const visiblePosts = dayPosts.slice(0, 2);

  return (
    <div
      ref={setRef}
      role="gridcell"
      tabIndex={isFocused ? 0 : -1}
      onFocus={() => setFocusedDate(day.date)}
      onClick={() => onOpenDayList(day.date)}
      aria-label={`${dayPosts.length} post${dayPosts.length === 1 ? '' : 's'} on ${monthDayLabel}`}
      className={`flex min-h-[72px] flex-col gap-1 border-b border-r p-1.5 text-left transition-colors hover:bg-[var(--cc-text)]/[0.03] ${borderClass} ${
        isReleaseDay ? 'border-[var(--cc-accent)]' : ''
      }`}
    >
      <span className={`font-[family-name:var(--font-cc-mono)] text-xs ${dayNumberClass}`}>{dayNumber}</span>
      {isReleaseDay ? (
        <span className="font-[family-name:var(--font-cc-mono)] text-[9px] font-bold tracking-wide text-[var(--cc-accent)]">
          OUT
        </span>
      ) : null}
      <div className="flex flex-1 flex-col gap-1">
        {visiblePosts.map((post) => (
          <PostChip key={post.id} post={post} today={today} onOpen={onOpenPost} onToggleStatus={onToggleStatus} />
        ))}
        {overflowCount > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDayList(day.date);
            }}
            aria-label={`${overflowCount} more post${overflowCount === 1 ? '' : 's'} on ${monthDayLabel}`}
            className="text-left font-[family-name:var(--font-cc-mono)] text-[10px] text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
          >
            +{overflowCount}
          </button>
        ) : null}
      </div>
    </div>
  );
}

type MonthGridProps = {
  month: string;
  releaseDate: string | null;
  posts: ContentPost[];
  today: string;
  onCreatePost: (date: string) => void;
  onOpenPost: (post: ContentPost) => void;
  onToggleStatus: (post: ContentPost) => void;
};

export function MonthGrid({ month, releaseDate, posts, today, onCreatePost, onOpenPost, onToggleStatus }: MonthGridProps) {
  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const byDay = useMemo(() => bucketPostsByDay(posts, month, today), [posts, month, today]);
  const flatDates = useMemo(() => grid.weeks.flatMap((week) => week.days.map((day) => day.date)), [grid]);
  const inMonthDates = useMemo(
    () => grid.weeks.flatMap((week) => week.days.filter((day) => day.inMonth).map((day) => day.date)),
    [grid]
  );
  const releaseDay = releaseDate && releaseDate.slice(0, 7) === month ? releaseDate : null;

  const cellRefs = useRef(new Map<string, HTMLElement>());

  // Render-time adjustment instead of an effect (the DeleteReleaseDialog
  // "prev guard" convention) so switching months resets the roving-focus
  // target without a set-state-in-effect pass.
  const [prevMonth, setPrevMonth] = useState(month);
  const [focusedDate, setFocusedDate] = useState<string>(
    () => (inMonthDates.includes(today) ? today : inMonthDates[0])
  );
  if (month !== prevMonth) {
    setPrevMonth(month);
    setFocusedDate(inMonthDates.includes(today) ? today : inMonthDates[0]);
  }

  const [dayListDate, setDayListDate] = useState<string | null>(null);

  useEffect(() => {
    if (!dayListDate) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDayListDate(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dayListDate]);

  useEffect(() => {
    if (!dayListDate) return;
    return lockBodyScroll();
  }, [dayListDate]);

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = flatDates.indexOf(focusedDate);
    if (currentIndex === -1) return;

    if (event.key === 'Enter') {
      const dayPosts = byDay.get(focusedDate) ?? [];
      if (dayPosts.length === 0) {
        // Empty cells are real <button>s: native Enter/Space activation
        // already fires onCreatePost via onClick. Handling it again here
        // would double-fire (harmless but wasteful), so this is a no-op.
        return;
      }
      event.preventDefault();
      setDayListDate(focusedDate);
      return;
    }

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = Math.min(currentIndex + 1, flatDates.length - 1);
    else if (event.key === 'ArrowLeft') nextIndex = Math.max(currentIndex - 1, 0);
    else if (event.key === 'ArrowDown') nextIndex = Math.min(currentIndex + 7, flatDates.length - 1);
    else if (event.key === 'ArrowUp') nextIndex = Math.max(currentIndex - 7, 0);
    else return;

    event.preventDefault();
    const nextDate = flatDates[nextIndex];
    setFocusedDate(nextDate);
    cellRefs.current.get(nextDate)?.focus();
  };

  const dayListPosts = dayListDate ? byDay.get(dayListDate) ?? [] : [];

  return (
    <div className="hidden lg:block">
      <div
        role="grid"
        aria-label="Post calendar grid"
        onKeyDown={handleGridKeyDown}
        className="grid grid-cols-[56px_repeat(7,1fr)] border-l border-t border-[var(--cc-border)]"
      >
        <div aria-hidden="true" className="border-b border-r border-[var(--cc-border)]" />
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="border-b border-r border-[var(--cc-border)] px-2 py-2 text-center font-[family-name:var(--font-cc-mono)] text-[10px] font-bold tracking-wide text-[var(--cc-text-faint)]"
          >
            {label}
          </div>
        ))}

        {grid.weeks.map((week) => {
          const label = getWeekLabel(week.weekStart, releaseDate);
          return (
            <Fragment key={week.weekStart}>
              <div className="flex items-start justify-end border-b border-r border-[var(--cc-border)] px-1.5 py-1.5 font-[family-name:var(--font-cc-mono)] text-[9px] font-bold uppercase tracking-wide text-[var(--cc-text-faint)]">
                {label ?? ''}
              </div>
              {week.days.map((day) => (
                <DayCell
                  key={day.date}
                  day={day}
                  dayPosts={byDay.get(day.date) ?? []}
                  isToday={day.date === today}
                  isReleaseDay={day.date === releaseDay}
                  today={today}
                  isFocused={day.date === focusedDate}
                  cellRefs={cellRefs}
                  setFocusedDate={setFocusedDate}
                  onCreatePost={onCreatePost}
                  onOpenPost={onOpenPost}
                  onToggleStatus={onToggleStatus}
                  onOpenDayList={setDayListDate}
                />
              ))}
            </Fragment>
          );
        })}
      </div>

      {posts.length === 0 ? (
        <p className="mt-4 text-center text-sm text-[var(--cc-text-muted)]">Tap a day to plan your first post.</p>
      ) : null}

      {dayListDate ? (
        <div
          className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close day list"
            className="absolute inset-0"
            onClick={() => setDayListDate(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-list-title"
            className="relative w-full max-w-sm border border-[var(--cc-border)] bg-[var(--cc-ground)] p-4 text-[var(--cc-text)] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id="day-list-title"
                className="font-[family-name:var(--font-cc-mono)] text-sm text-[var(--cc-text-muted)]"
              >
                {formatMonthDay(dayListDate)}
              </h2>
              <button
                type="button"
                onClick={() => setDayListDate(null)}
                aria-label="Close"
                className="text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-1.5">
              {dayListPosts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center gap-2 border border-[var(--cc-border)] bg-[var(--cc-fill)] px-2 py-1.5"
                >
                  <StatusMark
                    status={post.status}
                    overdue={isPostOverdue(post, today)}
                    canToggle={canQuickTogglePosted(post, today)}
                    onToggle={() => onToggleStatus(post)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setDayListDate(null);
                      onOpenPost(post);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-sm text-[var(--cc-on-fill)] hover:underline"
                  >
                    {post.title}
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                const date = dayListDate;
                setDayListDate(null);
                onCreatePost(date);
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 border border-[var(--cc-accent)]/40 bg-[var(--cc-accent)]/10 py-2 text-sm font-medium text-[var(--cc-accent)] hover:bg-[var(--cc-accent)]/15"
            >
              <Plus className="h-3.5 w-3.5" /> Add post
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
