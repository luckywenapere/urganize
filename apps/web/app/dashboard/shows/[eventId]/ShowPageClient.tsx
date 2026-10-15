'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Phone,
  Plus,
} from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/shared/ToastProvider';
import { useEventsStore } from '@/stores/useEventsStore';
import {
  EVENT_STATUS_COPY,
  SELECTABLE_EVENT_STATUSES,
  formatShowDateTime,
  relativeShowDay,
  shortTimezoneLabel,
  type EventStatus,
} from '@/lib/events';
import { MAX_SETLIST_NAME_LENGTH } from '@/lib/setlist';
import { describePackReadiness } from '@/lib/dj-pack';
import { SetlistBuilder } from '@/components/events/SetlistBuilder';
import { DjPackPanel } from '@/components/events/DjPackPanel';
import { RunOfShowCard } from '@/components/events/RunOfShowCard';
import { EditShowSheet } from '@/components/events/EditShowSheet';
import { ConfirmDialog } from '@/components/events/ConfirmDialog';
import type { BuilderItem } from '@/components/events/SetRowEditor';
import type { RunOfShowItem, Setlist, ShowEvent } from '@/types/events';
import { useKeepInViewport } from '@/lib/use-keep-in-viewport';

const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';
const ARTIST_PAGE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_ARTIST_PAGE === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

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

type Permissions = { canEdit: boolean; canDelete: boolean };

/** A small popover menu. Closes on an outside press or Escape. */
function Menu({
  label,
  trigger,
  children,
  align = 'right',
}: {
  label: string;
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // The header wraps on a phone, so a right-aligned menu can land at the left
  // of the screen and run off it; this pulls it back (lib/menu-position.ts).
  useKeepInViewport(panelRef, open);

  useEffect(() => {
    if (!open) return;
    const onPointer = (pointerEvent: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(pointerEvent.target as Node)) setOpen(false);
    };
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {/* A disclosure, not a role="menu": a menu promises arrow-key movement
          between items, and these are buttons reached with Tab. */}
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="motion-focus inline-flex h-10 items-center gap-1.5 rounded-lg border border-stroke-default px-3 text-sm font-semibold text-content-secondary hover:border-stroke-strong hover:text-content-primary sm:h-9"
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={label}
          className={`absolute top-full z-50 mt-1 min-w-[12rem] rounded-xl border border-stroke-default bg-bg-surface p-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  children,
  onSelect,
  tone = 'default',
  disabled,
  hint,
  checked,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  hint?: string;
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      // The tick is the visible cue; `aria-current` is the spoken one, for the
      // item that is the present choice in a set of choices.
      aria-current={checked ? 'true' : undefined}
      disabled={disabled}
      onClick={onSelect}
      className={`motion-focus flex min-h-10 w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed ${
        tone === 'danger' ? 'text-status-error hover:bg-status-error/10' : 'text-content-primary hover:bg-bg-hover'
      } disabled:opacity-60 disabled:hover:bg-transparent`}
    >
      <span className="w-4 shrink-0 pt-0.5">{checked ? <Check className="h-4 w-4 text-brand" aria-hidden /> : null}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{children}</span>
        {hint ? <span className="mt-0.5 block text-xs font-normal text-content-tertiary">{hint}</span> : null}
      </span>
    </button>
  );
}

export default function ShowPageClient() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const eventId = typeof params?.eventId === 'string' ? params.eventId : '';
  const { pushToast } = useToast();
  const allEvents = useEventsStore((state) => state.events);
  const loadEvents = useEventsStore((state) => state.load);
  const updateShow = useEventsStore((state) => state.update);
  const removeShow = useEventsStore((state) => state.remove);
  const removeSeries = useEventsStore((state) => state.removeSeries);
  const upsertLocal = useEventsStore((state) => state.upsertLocal);

  const [event, setEvent] = useState<ShowEvent | null>(null);
  const [permissions, setPermissions] = useState<Permissions>({ canEdit: false, canDelete: false });
  const [runOfShow, setRunOfShow] = useState<RunOfShowItem[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [confirm, setConfirm] = useState<'show' | 'festival' | 'set' | null>(null);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [builderItems, setBuilderItems] = useState<BuilderItem[]>([]);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const loadShow = useCallback(async () => {
    if (!eventId) return;
    const headers = await authHeaders();
    if (!headers) {
      setIsLoading(false);
      return;
    }
    try {
      const [showResponse, setlistResponse] = await Promise.all([
        fetch(`/api/events/${eventId}`, { headers }),
        fetch(`/api/events/${eventId}/setlists`, { headers }),
      ]);
      if (!showResponse.ok) {
        setError(await readError(showResponse, 'Couldn’t load this show.'));
        return;
      }
      const showBody = await showResponse.json();
      setEvent(showBody.event);
      setRunOfShow(Array.isArray(showBody.runOfShow) ? showBody.runOfShow : []);
      setPermissions({
        canEdit: Boolean(showBody.permissions?.canEdit),
        canDelete: Boolean(showBody.permissions?.canDelete),
      });
      if (setlistResponse.ok) {
        const setlistBody = await setlistResponse.json();
        const loaded: Setlist[] = Array.isArray(setlistBody.setlists) ? setlistBody.setlists : [];
        setSetlists(loaded);
        // Resolved inside the setter, so a slow load cannot clobber a choice
        // already made.
        setActiveSetlistId((current) =>
          current && loaded.some((setlist) => setlist.id === current) ? current : loaded[0]?.id ?? null
        );
      }
      setError('');
    } catch {
      setError('Couldn’t reach the server. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!EVENTS_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void loadShow();
    // The list gives a festival's other days for the switcher.
    void loadEvents();
  }, [loadEvents, loadShow, router]);

  // Select-all ONCE, when renaming begins (keyed on the boolean, not the
  // string, or every keystroke re-selects the field — founder report 2026-09-02).
  const isRenaming = renameDraft !== null;
  useEffect(() => {
    if (isRenaming) renameInputRef.current?.select();
  }, [isRenaming]);

  const seriesId = event?.seriesId ?? null;
  const siblings = useMemo(() => {
    if (!seriesId) return [];
    return allEvents
      .filter((entry) => entry.seriesId === seriesId)
      .sort(
        (a, b) =>
          (a.seriesDay ?? 0) - (b.seriesDay ?? 0) || a.artistName.localeCompare(b.artistName)
      );
  }, [allEvents, seriesId]);

  const readiness = useMemo(() => describePackReadiness(builderItems), [builderItems]);

  if (!EVENTS_ENABLED) return null;

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4" aria-hidden>
        <div className="h-5 w-16 animate-pulse rounded bg-bg-surface" />
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-bg-surface" />
          <div className="h-7 w-64 max-w-full animate-pulse rounded bg-bg-surface" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-bg-surface" />
        </div>
        <div className="h-48 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
        <div className="h-64 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href={ARTIST_PAGE_ENABLED ? '/dashboard/artists' : '/dashboard/shows'}
          className="motion-focus inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {ARTIST_PAGE_ENABLED ? 'Artists' : 'Shows'}
        </Link>
        <p className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-6 text-sm text-content-secondary">
          {error || 'This show isn’t here. It may have been deleted.'}
        </p>
      </div>
    );
  }

  const place = [event.venueName, event.city, event.country].filter(Boolean).join(', ');
  const activeSetlist = setlists.find((setlist) => setlist.id === activeSetlistId) || null;
  const relative = relativeShowDay(event.setStartAt, event.timezone);
  const cancelled = event.status === 'cancelled';
  const siblingIndex = siblings.findIndex((entry) => entry.id === event.id);
  const previousSibling = siblingIndex > 0 ? siblings[siblingIndex - 1] : null;
  const nextSibling = siblingIndex >= 0 && siblingIndex < siblings.length - 1 ? siblings[siblingIndex + 1] : null;
  const totalDays = siblings.length > 0 ? new Set(siblings.map((entry) => entry.seriesDay ?? 0)).size : 0;
  const sentTo = activeSetlist?.sentTo ?? 0;

  const setStatus = async (status: EventStatus) => {
    if (status === event.status) return;
    const previous = event;
    setEvent({ ...event, status });
    const result = await updateShow(event.id, { status });
    if ('error' in result) {
      setEvent(previous);
      pushToast(result.error, 'error');
      return;
    }
    setEvent({ ...result.event, artistName: result.event.artistName || previous.artistName });
  };

  const createSetlist = async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const name = setlists.length === 0 ? 'Main set' : `Set ${setlists.length + 1}`;
    try {
      const response = await fetch(`/api/events/${event.id}/setlists`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        pushToast(await readError(response, 'Couldn’t start a set.'), 'error');
        return;
      }
      const body = await response.json();
      setSetlists((current) => [...current, { ...body.setlist, sentTo: 0 }]);
      setActiveSetlistId(body.setlist.id);
    } catch {
      pushToast('Couldn’t reach the server. Check your connection.', 'error');
    }
  };

  const commitRename = async () => {
    const draft = renameDraft;
    setRenameDraft(null);
    if (draft === null || !activeSetlist) return;
    const name = draft.trim();
    if (!name || name === activeSetlist.name) return;
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const response = await fetch(`/api/setlists/${activeSetlist.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        pushToast(await readError(response, 'Couldn’t rename the set.'), 'error');
        return;
      }
      const body = await response.json();
      const renamed: Setlist = body.setlist;
      setSetlists((current) =>
        current.map((setlist) =>
          setlist.id === renamed.id ? { ...renamed, sentTo: setlist.sentTo } : setlist
        )
      );
    } catch {
      pushToast('Couldn’t reach the server. Check your connection.', 'error');
    }
  };

  const chipClass = (active: boolean) =>
    `motion-focus inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
      active
        ? 'border-brand bg-brand/10 text-brand'
        : 'border-stroke-default text-content-secondary hover:text-content-primary'
    }`;

  // Back goes to the artist's page, where their shows live (URG-303).
  const backHref = ARTIST_PAGE_ENABLED
    ? `/dashboard/artists/${encodeURIComponent(event.artistId)}`
    : '/dashboard/shows';
  const backLabel = ARTIST_PAGE_ENABLED ? event.artistName || 'Artist' : 'Shows';

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="motion-focus inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>

        {/* One show in a festival: step through the others without going back
            to the list. */}
        {siblings.length > 1 && siblingIndex >= 0 ? (
          <nav aria-label="Other shows in this festival" className="flex items-center gap-1">
            {previousSibling ? (
              <Link
                href={`/dashboard/shows/${previousSibling.id}`}
                aria-label={`Previous: ${[previousSibling.seriesDay ? `Day ${previousSibling.seriesDay}` : previousSibling.title, previousSibling.artistName].filter(Boolean).join(', ')}`}
                className="motion-focus grid h-8 w-8 place-items-center rounded-md text-content-secondary hover:bg-bg-surface hover:text-content-primary"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <span className="grid h-8 w-8 place-items-center text-content-tertiary opacity-40" aria-hidden>
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
            <span className="text-xs font-semibold tabular-nums text-content-secondary">
              {event.seriesDay && totalDays > 1 ? `Day ${event.seriesDay} of ${totalDays}` : `${siblingIndex + 1} of ${siblings.length}`}
            </span>
            {nextSibling ? (
              <Link
                href={`/dashboard/shows/${nextSibling.id}`}
                aria-label={`Next: ${[nextSibling.seriesDay ? `Day ${nextSibling.seriesDay}` : nextSibling.title, nextSibling.artistName].filter(Boolean).join(', ')}`}
                className="motion-focus grid h-8 w-8 place-items-center rounded-md text-content-secondary hover:bg-bg-surface hover:text-content-primary"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <span className="grid h-8 w-8 place-items-center text-content-tertiary opacity-40" aria-hidden>
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </nav>
        ) : null}
      </div>

      <header className="mt-6">
        {event.artistName || event.seriesTitle ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            {[event.artistName, event.seriesTitle].filter(Boolean).join(' · ')}
          </p>
        ) : null}

        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1
            className={`min-w-0 font-display text-3xl font-semibold leading-tight tracking-tight text-content-primary sm:text-4xl ${
              cancelled ? 'line-through decoration-content-tertiary' : ''
            }`}
          >
            {event.title}
          </h1>
          {permissions.canEdit ? (
            <div className="flex shrink-0 items-center gap-2">
              <Menu
                label={`Status: ${EVENT_STATUS_COPY[event.status]}`}
                align="right"
                trigger={
                  <>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        event.status === 'confirmed'
                          ? 'bg-brand'
                          : event.status === 'cancelled'
                            ? 'bg-status-error'
                            : 'bg-content-tertiary'
                      }`}
                      aria-hidden
                    />
                    {EVENT_STATUS_COPY[event.status]}
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  </>
                }
              >
                {(close) =>
                  SELECTABLE_EVENT_STATUSES.map((status) => (
                    <MenuItem
                      key={status}
                      checked={status === event.status}
                      onSelect={() => {
                        close();
                        void setStatus(status);
                      }}
                      hint={
                        status === 'draft'
                          ? 'Not confirmed yet'
                          : status === 'cancelled'
                            ? 'The DJ’s link stops handing over files'
                            : undefined
                      }
                    >
                      {EVENT_STATUS_COPY[status]}
                    </MenuItem>
                  ))
                }
              </Menu>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="motion-focus motion-press inline-flex h-10 items-center rounded-full bg-content-primary px-5 text-sm font-semibold text-content-inverse hover:opacity-90"
              >
                Edit
              </button>
              {permissions.canDelete ? (
                <Menu label="More" trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}>
                  {(close) => (
                    <>
                      <MenuItem
                        tone="danger"
                        onSelect={() => {
                          close();
                          setConfirm('show');
                        }}
                      >
                        Delete show
                      </MenuItem>
                      {event.seriesId && siblings.length > 1 ? (
                        <MenuItem
                          tone="danger"
                          onSelect={() => {
                            close();
                            setConfirm('festival');
                          }}
                        >
                          Delete all {siblings.length} shows in this festival
                        </MenuItem>
                      ) : null}
                    </>
                  )}
                </Menu>
              ) : null}
            </div>
          ) : event.status === 'draft' || cancelled ? (
            <span className="rounded-full border border-stroke-strong px-2 py-0.5 text-[11px] font-semibold text-content-secondary">
              {EVENT_STATUS_COPY[event.status]}
            </span>
          ) : null}
        </div>

        <div className="mt-2 space-y-1 text-sm text-content-secondary">
          <p>
            {relative ? <span className="font-semibold text-content-primary">{relative} · </span> : null}
            {formatShowDateTime(event.setStartAt, event.timezone)}
            {event.setStartAt ? (
              <span className="text-content-tertiary"> ({shortTimezoneLabel(event.timezone)} time)</span>
            ) : null}
            <span className="text-content-tertiary"> · {event.setLengthMinutes} min set</span>
          </p>
          {place || event.stage ? <p>{[place, event.stage].filter(Boolean).join(' · ')}</p> : null}
          {event.promoterName || event.promoterPhone ? (
            <p className="flex flex-wrap items-center gap-x-2">
              <span>Promoter: {event.promoterName || 'no name yet'}</span>
              {event.promoterPhone ? (
                <a
                  href={`tel:${event.promoterPhone.replace(/[^\d+]/g, '')}`}
                  className="motion-focus inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {event.promoterPhone}
                </a>
              ) : null}
            </p>
          ) : null}
          {event.notes ? (
            <p className="whitespace-pre-wrap rounded-lg bg-bg-surface p-3 text-sm text-content-secondary">
              {event.notes}
            </p>
          ) : null}
        </div>
      </header>

      {cancelled ? (
        <p className="mt-4 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          This show is cancelled. Anyone you sent the tracks to sees that it’s off, and no files are handed over.
        </p>
      ) : null}

      <div className="mt-6">
        <RunOfShowCard
          event={event}
          items={runOfShow}
          canEdit={permissions.canEdit}
          onItemsChange={setRunOfShow}
          onEditShowTime={() => setIsEditing(true)}
        />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-content-primary">
            {setlists.length > 1 ? 'Sets' : 'The set'}
          </h2>
          {activeSetlist && permissions.canEdit ? (
            <Menu label={`Options for ${activeSetlist.name}`} trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}>
              {(close) => (
                <>
                  <MenuItem
                    onSelect={() => {
                      close();
                      setRenameDraft(activeSetlist.name);
                    }}
                  >
                    Rename set
                  </MenuItem>
                  <MenuItem
                    tone="danger"
                    disabled={sentTo > 0}
                    hint={
                      sentTo > 0
                        ? `It went to ${sentTo} ${sentTo === 1 ? 'person' : 'people'}, so it’s kept as the record of who downloaded it.`
                        : undefined
                    }
                    onSelect={() => {
                      close();
                      setConfirm('set');
                    }}
                  >
                    Delete set
                  </MenuItem>
                </>
              )}
            </Menu>
          ) : null}
        </div>

        {/* More than one set is normal: you build a 25 and a 40 in case the
            slot moves. */}
        {setlists.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {setlists.map((setlist) =>
              setlist.id === activeSetlistId && renameDraft !== null ? (
                <input
                  key={setlist.id}
                  ref={renameInputRef}
                  value={renameDraft}
                  maxLength={MAX_SETLIST_NAME_LENGTH}
                  aria-label="Set name"
                  onChange={(changeEvent) => setRenameDraft(changeEvent.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === 'Enter') {
                      keyEvent.preventDefault();
                      void commitRename();
                    } else if (keyEvent.key === 'Escape') {
                      keyEvent.preventDefault();
                      setRenameDraft(null);
                    }
                  }}
                  className="rounded-full border border-brand bg-bg-base px-3 py-1 text-xs font-semibold text-content-primary outline-none"
                />
              ) : (
                <button
                  key={setlist.id}
                  type="button"
                  onClick={() => setActiveSetlistId(setlist.id)}
                  aria-pressed={setlist.id === activeSetlistId}
                  className={chipClass(setlist.id === activeSetlistId)}
                >
                  {setlist.id === activeSetlistId ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                  {setlist.name}
                </button>
              )
            )}
            {permissions.canEdit ? (
              <button
                type="button"
                onClick={() => void createSetlist()}
                className="motion-focus inline-flex items-center gap-1 rounded-full border border-dashed border-stroke-default px-3 py-1 text-xs font-semibold text-content-secondary hover:border-brand hover:text-content-primary"
              >
                <Plus className="h-3 w-3" aria-hidden />
                New set
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4">
          {activeSetlist ? (
            <>
              <SetlistBuilder
                key={activeSetlist.id}
                setlistId={activeSetlist.id}
                artistId={event.artistId}
                artistName={event.artistName}
                setLengthMinutes={event.setLengthMinutes}
                canEdit={permissions.canEdit}
                onItemsChange={setBuilderItems}
              />
              <div className="mt-6">
                <DjPackPanel
                  key={`pack-${activeSetlist.id}`}
                  setlistId={activeSetlist.id}
                  showTitle={event.title}
                  timezone={event.timezone}
                  cancelled={cancelled}
                  canEdit={permissions.canEdit}
                  readiness={readiness}
                  onSentCountChange={(count) =>
                    setSetlists((current) =>
                      current.map((setlist) =>
                        setlist.id === activeSetlist.id && setlist.sentTo !== count
                          ? { ...setlist, sentTo: count }
                          : setlist
                      )
                    )
                  }
                />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-stroke-default p-6 text-center">
              <p className="text-sm text-content-secondary">
                No set yet. Build one and the running total tells you whether it fits the{' '}
                {event.setLengthMinutes} minutes you were given.
              </p>
              {permissions.canEdit ? (
                <button
                  type="button"
                  onClick={() => void createSetlist()}
                  className="motion-focus motion-press mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Start the set
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {isEditing ? (
        <EditShowSheet
          event={event}
          onClose={() => setIsEditing(false)}
          onSaved={(saved) => {
            setIsEditing(false);
            setEvent(saved);
            upsertLocal(saved);
            // A new time moved the run of show on the server; read it back.
            void loadShow();
          }}
          onRequestDelete={
            permissions.canDelete
              ? () => {
                  setIsEditing(false);
                  setConfirm('show');
                }
              : undefined
          }
        />
      ) : null}

      <ConfirmDialog
        open={confirm === 'show'}
        title={`Delete ${event.title}?`}
        body="Its run of show and sets go with it. Anyone you sent a link to won’t be able to open it."
        confirmLabel="Delete show"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const result = await removeShow(event.id);
          if (result && 'error' in result) throw new Error(result.error);
          setConfirm(null);
          pushToast(`${event.title} is deleted.`, 'success');
          router.push(backHref);
        }}
      />

      <ConfirmDialog
        open={confirm === 'festival'}
        title={`Delete all ${siblings.length} shows in ${event.seriesTitle || 'this festival'}?`}
        body="Their sets and packs go with them. Anyone you sent a link to won’t be able to open it."
        confirmLabel={`Delete ${siblings.length} shows`}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!event.seriesId) return;
          const result = await removeSeries(event.seriesId);
          if ('error' in result) throw new Error(result.error);
          setConfirm(null);
          pushToast(`${event.seriesTitle || 'The festival'} is deleted.`, 'success');
          router.push(backHref);
        }}
      />

      <ConfirmDialog
        open={confirm === 'set' && activeSetlist !== null}
        title={`Delete ${activeSetlist?.name ?? 'this set'}?`}
        body="Its songs and running order go with it. The songs stay in the catalog."
        confirmLabel="Delete set"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const target = activeSetlist;
          if (!target) return;
          const headers = await authHeaders();
          if (!headers) throw new Error('You’re signed out. Sign in and try again.');
          let response: Response;
          try {
            response = await fetch(`/api/setlists/${target.id}`, { method: 'DELETE', headers });
          } catch {
            throw new Error('Couldn’t reach the server. Check your connection.');
          }
          if (!response.ok) throw new Error(await readError(response, 'Couldn’t delete the set.'));
          const index = setlists.findIndex((setlist) => setlist.id === target.id);
          const remaining = setlists.filter((setlist) => setlist.id !== target.id);
          setSetlists(remaining);
          setActiveSetlistId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
          setConfirm(null);
        }}
      />
    </div>
  );
}
