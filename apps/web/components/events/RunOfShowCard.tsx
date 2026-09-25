'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import {
  MAX_RUN_OF_SHOW_LABEL_LENGTH,
  MAX_RUN_OF_SHOW_STEPS,
  describeDayOffset,
  describeRunOfShowTime,
  formatDayOffset,
  formatShowDateTime,
  orderRunOfShow,
  runOfShowInstant,
  shortTimezoneLabel,
} from '@/lib/events';
import type { RunOfShowItem, ShowEvent } from '@/types/events';

type RunOfShowCardProps = {
  event: ShowEvent;
  items: RunOfShowItem[];
  canEdit: boolean;
  onItemsChange: (items: RunOfShowItem[]) => void;
  /** Opens the show's own editor, where the set time lives. */
  onEditShowTime: () => void;
};

type Draft = { label: string; time: string; dayOffset: number };

const DAY_CHOICES: { value: number; label: string }[] = [
  { value: -1, label: 'Day before' },
  { value: 0, label: 'Show day' },
  { value: 1, label: 'Day after' },
];

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    /* non-JSON */
  }
  return fallback;
}

/**
 * The night, in the order it happens: call time, soundcheck, doors, the set,
 * load out.
 *
 * Seeded on every show and read-only for its whole life until 2026-09-25, so
 * six rows said "to confirm" forever. Now a tap opens a step: its name, a time
 * of day, and which day it falls on relative to the show (a call time the day
 * before reads "-1", like an airline itinerary). Timed steps sort themselves by
 * time; untimed ones stay where they are (orderRunOfShow).
 *
 * "Set start" and "Set end" show the show's own times when left untimed, so
 * there is one set time to keep right, not two that can disagree.
 */
export function RunOfShowCard({ event, items, canEdit, onItemsChange, onEditShowTime }: RunOfShowCardProps) {
  const rows = useMemo(() => orderRunOfShow(items, event), [items, event]);
  const [openId, setOpenId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>({ label: '', time: '', dayOffset: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const hasDate = Boolean(event.setStartAt);
  const zone = shortTimezoneLabel(event.timezone);

  const open = (row: (typeof rows)[number] | null) => {
    setError('');
    if (!row) {
      setDraft({ label: '', time: '', dayOffset: 0 });
      setOpenId('new');
      return;
    }
    const own = row.followsShow ? null : describeRunOfShowTime(row.shownAt, event.setStartAt, event.timezone);
    setDraft({ label: row.label, time: own?.time ?? '', dayOffset: own?.dayOffset ?? 0 });
    setOpenId(row.id);
  };

  const close = () => {
    setOpenId(null);
    setError('');
  };

  /** The instant a draft names, or null for "no time". Undefined when the time
   *  cannot be anchored (the show has no date). */
  const draftInstant = (value: Draft): string | null | undefined => {
    if (!value.time) return null;
    if (!hasDate) return undefined;
    return runOfShowInstant({
      showStartIso: event.setStartAt,
      time: value.time,
      dayOffset: value.dayOffset,
      timezone: event.timezone,
    });
  };

  const save = async (row: (typeof rows)[number] | null) => {
    const label = draft.label.trim();
    if (!label) {
      setError('Give the step a name.');
      return;
    }
    const at = draftInstant(draft);
    if (at === undefined) {
      setError('Add the show’s date first, so this time has a day.');
      return;
    }

    const headers = await authHeaders();
    if (!headers) {
      setError('You’re signed out. Sign in and try again.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (!row) {
        const response = await fetch(`/api/events/${event.id}/run-of-show`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ label, at }),
        });
        if (!response.ok) {
          setError(await readError(response, 'Couldn’t add the step.'));
          return;
        }
        const body = await response.json();
        onItemsChange([...items, body.item as RunOfShowItem]);
        close();
        return;
      }

      const patch: { label?: string; at?: string | null } = {};
      if (label !== row.label) patch.label = label;
      // An untimed Set start / Set end that still has no time keeps following
      // the show; only an actual time typed here gives it one of its own.
      const currentOwn = row.followsShow ? null : row.at;
      if (!(row.followsShow && at === null)) {
        const sameMoment =
          (currentOwn === null && at === null) ||
          (currentOwn !== null && at !== null && Date.parse(currentOwn) === Date.parse(at));
        if (!sameMoment) patch.at = at;
      }
      if (Object.keys(patch).length === 0) {
        close();
        return;
      }

      const response = await fetch(`/api/events/${event.id}/run-of-show/${row.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setError(await readError(response, 'Couldn’t save the step.'));
        return;
      }
      const body = await response.json();
      const saved = body.item as RunOfShowItem;
      onItemsChange(items.map((item) => (item.id === saved.id ? saved : item)));
      close();
    } catch {
      setError('Couldn’t reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: (typeof rows)[number]) => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/events/${event.id}/run-of-show/${row.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok && response.status !== 404) {
        setError(await readError(response, 'Couldn’t remove the step.'));
        return;
      }
      onItemsChange(items.filter((item) => item.id !== row.id));
      close();
    } catch {
      setError('Couldn’t reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const fieldClass =
    'w-full rounded-lg border border-stroke-default bg-bg-base px-3 py-2 text-sm text-content-primary outline-none focus:border-brand disabled:opacity-50';

  const editor = (row: (typeof rows)[number] | null) => {
    const followsShow = Boolean(row?.followsShow);
    return (
      <div className="mt-2 space-y-3 rounded-lg border border-stroke-default bg-bg-base p-3">
        <label className="block">
          <span className="block text-xs font-semibold text-content-secondary">Step</span>
          <input
            value={draft.label}
            maxLength={MAX_RUN_OF_SHOW_LABEL_LENGTH}
            autoFocus
            placeholder="Soundcheck"
            onChange={(changeEvent) => setDraft((current) => ({ ...current, label: changeEvent.target.value }))}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === 'Enter') {
                keyEvent.preventDefault();
                void save(row);
              } else if (keyEvent.key === 'Escape') {
                keyEvent.preventDefault();
                close();
              }
            }}
            className={`${fieldClass} mt-1`}
          />
        </label>

        {followsShow ? (
          <p className="text-xs text-content-secondary">
            This follows the show’s set time.{' '}
            <button
              type="button"
              onClick={onEditShowTime}
              className="motion-focus font-semibold text-brand hover:underline"
            >
              Change the set time
            </button>
          </p>
        ) : hasDate ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-content-secondary">
                Time{zone ? ` (${zone})` : ''}
              </span>
              <input
                type="time"
                value={draft.time}
                onChange={(changeEvent) => setDraft((current) => ({ ...current, time: changeEvent.target.value }))}
                className={`${fieldClass} mt-1 w-32`}
              />
            </label>
            <div role="radiogroup" aria-label="Which day" className="flex gap-1 rounded-lg border border-stroke-default p-1">
              {DAY_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.dayOffset === choice.value}
                  onClick={() => setDraft((current) => ({ ...current, dayOffset: choice.value }))}
                  className={`motion-focus rounded-md px-2.5 py-1 text-xs font-semibold ${
                    draft.dayOffset === choice.value
                      ? 'bg-bg-surface text-content-primary shadow-sm'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            {draft.time ? (
              <button
                type="button"
                onClick={() => setDraft((current) => ({ ...current, time: '' }))}
                className="motion-focus pb-2 text-xs font-semibold text-content-secondary hover:text-content-primary"
              >
                Clear time
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-content-secondary">
            Add the show’s date to give this a time.{' '}
            <button type="button" onClick={onEditShowTime} className="motion-focus font-semibold text-brand hover:underline">
              Add the date
            </button>
          </p>
        )}

        {error ? (
          <p role="alert" className="text-xs text-status-error">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          {row ? (
            <button
              type="button"
              onClick={() => void remove(row)}
              disabled={busy}
              className="motion-focus inline-flex items-center gap-1.5 text-xs font-semibold text-status-error hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove step
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="motion-focus h-8 rounded-lg px-3 text-xs font-semibold text-content-secondary hover:text-content-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save(row)}
              disabled={busy}
              className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {row ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-content-primary">Run of show</h2>
        {zone && hasDate ? <span className="text-xs text-content-tertiary">{zone} time</span> : null}
      </div>

      {rows.length === 0 && openId !== 'new' ? (
        <p className="mt-3 text-sm text-content-secondary">No steps yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-stroke-subtle">
          {rows.map((row) => {
            const when = describeRunOfShowTime(row.shownAt, event.setStartAt, event.timezone);
            const isOpen = openId === row.id;
            // A time with no show date to measure from reads as a full date,
            // so nothing is shown on the wrong day.
            const timeText = when
              ? when.dayOffset === null
                ? formatShowDateTime(row.shownAt, event.timezone)
                : when.time
              : '';
            const offset = when ? formatDayOffset(when.dayOffset) : '';

            const content = (
              <>
                <span className="w-16 shrink-0 font-mono text-sm tabular-nums text-content-primary">
                  {timeText ? (
                    <span className={row.followsShow ? 'text-content-secondary' : undefined}>
                      {timeText}
                      {offset ? (
                        <sup className="ml-0.5 text-[10px] font-semibold text-content-tertiary">
                          {offset}
                          <span className="sr-only"> ({describeDayOffset(when?.dayOffset)})</span>
                        </sup>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-xs text-content-tertiary">{canEdit ? 'Add time' : 'TBC'}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-content-primary">{row.label}</span>
              </>
            );

            return (
              <li key={row.id} className="py-1">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => (isOpen ? close() : open(row))}
                    aria-expanded={isOpen}
                    className="motion-focus flex w-full items-baseline gap-3 rounded-md px-1 py-1.5 text-left hover:bg-bg-base"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-baseline gap-3 px-1 py-1.5">{content}</div>
                )}
                {isOpen ? editor(row) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        openId === 'new' ? (
          editor(null)
        ) : items.length < MAX_RUN_OF_SHOW_STEPS ? (
          <button
            type="button"
            onClick={() => open(null)}
            className="motion-focus mt-2 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add a step
          </button>
        ) : null
      ) : null}
    </section>
  );
}
