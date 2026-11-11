'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, MoreHorizontal, Plus, X } from '@/components/icons';
import { CoverTile, DateBlock, Sheet, StageBars } from '@/components/records/RecordParts';
import { ProjectTasksCard } from '@/components/records/ProjectTasksCard';
import { ProjectChatSheet } from '@/components/records/ProjectChatSheet';
import { fetchProjectTasks } from '@/lib/project-tasks-client';
import { isTaskClosed } from '@/types/tasks';
import { recordStageSteps } from '@/lib/record-page-data';
import { RELEASE_DAY_BUTTON, releaseDayOptions } from '@/lib/release-this-song';
import { PhotoCropDialog } from '@/components/shared/PhotoCropDialog';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import type { AnalyticsEventPropertiesMap } from '@/lib/analytics/shared';
import { artistHref, isArtistPageEnabled } from '@/lib/artist-page';
import { prepareAvatarImage } from '@/lib/downscale-image';
import { uploadThumb } from '@/lib/image-thumb-client';
import { supabase } from '@/lib/supabase/client';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { usePlannerStore } from '@/stores/usePlannerStore';
import {
  RECORD_COVER_COLORS,
  RECORD_KINDS,
  SESSION_STATUSES,
  SESSION_STATUS_LABELS,
  SONG_STAGES,
  SONG_STAGE_LABELS,
  artistCoverColor,
  isOpenRecord,
  lagosToday,
  pickNextSession,
  recordCoverColor,
  recordKindLabel,
  sessionWhen,
  type NextRecord,
  type RecordKind,
  type RecordSession,
  type RecordSong,
  type SessionInput,
  type SessionStatus,
  type SongStage,
} from '@/lib/next-records';
import {
  fromRecordLine,
  planHint,
  recordCredits,
  recordMusicStage,
  recordReleaseType,
  recordStatusLine,
  recordUseNote,
  carryOverLine,
} from '@/lib/next-records-rollout';
import {
  addRecordSong,
  fetchContactOptions,
  fetchRecord,
  patchRecord,
  patchRecordSong,
  recordCoverSignUrl,
  removeRecordSession,
  removeRecordSong,
  saveRecordCover,
  saveRecordSession,
  startRecordRollout,
  type ContactOption,
  type RecordCall,
} from '@/lib/next-records-client';

// A record in the making, v2 (mocks approved 27 Oct 2026,
// docs/mocks/next-record-v2/mock.html): a cover with the rollout button right
// under it, the songs as a numbered tracklist, sessions with a date block, and
// rare actions in the cover's ⋯ menu. Nothing is required. Every write answers
// with the whole record, so the page swaps it in. See
// docs/notes/2026-10-27-next-record.md.

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();

const primaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full bg-content-primary px-5 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-5 text-sm font-medium text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50';
const greenButton =
  'motion-press flex min-h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const outlineButton =
  'motion-press flex min-h-11 w-full items-center justify-center rounded-full border border-stroke-strong px-5 text-sm font-semibold text-content-primary transition-colors duration-fast ease-standard hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50';
const fieldClass =
  'min-h-11 w-full rounded-lg border border-stroke-control bg-bg-surface px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-content-primary focus:outline-none';
const iconButton =
  'motion-focus motion-press grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary';
const coverChip = 'motion-focus motion-press rounded-full bg-black/35 text-white transition-colors hover:bg-black/50';

// Every desktop rule on this page is an `lg:` class (#1190, mock
// docs/mocks/record-page-desktop/mock.html), so a phone draws what it drew before.
const desktopFilled =
  'motion-focus motion-press inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-full bg-brand px-4 text-[13px] font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

function Card({
  title,
  count,
  aside,
  asideClassName = '',
  className = '',
  children,
}: {
  title: string;
  /** Shown beside the title on a computer only ("1 of 3 songs done"). */
  count?: string;
  aside?: React.ReactNode;
  asideClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-[14px] border border-stroke-default bg-bg-surface px-3.5 py-3 lg:rounded-2xl lg:px-5 lg:pb-3 lg:pt-[18px] ${className}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 lg:mb-2">
        <h2 className="font-display text-base text-content-primary lg:text-lg lg:leading-6">
          {title}
          {count ? <span className="hidden font-sans text-[13px] font-medium text-content-secondary lg:inline"> · {count}</span> : null}
        </h2>
        {aside ? <span className={`text-[13px] text-content-secondary ${asideClassName}`}>{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** The dashed "add the first one" card (mock screen 2). */
function AddCard({ title, hint, className = '', onClick }: { title: string; hint: string; className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`motion-focus block w-full rounded-[14px] border border-dashed border-stroke-control px-3.5 py-3 text-left transition-colors hover:bg-bg-hover lg:rounded-2xl lg:px-5 lg:py-4 ${className}`}
    >
      <span className="block text-sm font-semibold text-content-primary">{title}</span>
      <span className="mt-0.5 block text-[13px] text-content-secondary">{hint}</span>
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** One row of the "Here's what I'll use" sheet. */
function UseRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-stroke-default py-2.5 text-sm first:border-t-0">
      <span className="shrink-0 text-content-secondary">{label}</span>
      <span className="text-right text-content-primary">{value}</span>
    </div>
  );
}

type SheetName = 'menu' | 'rename' | 'cover' | 'kind' | 'drop' | 'plan' | 'idea' | null;

/**
 * Where the project stands on a phone (2026-11-11, #1143, mock screen 1.2):
 * one track with Song, Release and Out (recordStageSteps). Idea and Making are
 * both "Song"; the checklist groups below are what used to be those stages.
 * A computer draws StageSteps below instead.
 */
function StageLine({ status }: { status: NextRecord['status'] }) {
  const stops = recordStageSteps(status);
  const filled = stops.findIndex((stop) => stop.state === 'now');
  return (
    <ol aria-label="Where this project is" className="relative flex justify-between px-3 pt-1 lg:hidden">
      <span aria-hidden className="absolute left-[34px] right-[34px] top-[16px] h-0.5 rounded bg-stroke-default">
        <span className="block h-full rounded bg-brand" style={{ width: `${Math.max(0, filled) * 50}%` }} />
      </span>
      {stops.map((stop) => {
        const now = stop.state === 'now';
        const past = stop.state === 'done';
        return (
          <li key={stop.key} aria-current={now ? 'step' : undefined} className="relative z-10 flex flex-col items-center gap-1.5">
            {past ? (
              <span className="grid size-6 place-items-center rounded-full bg-brand text-content-inverse">
                <Check aria-hidden className="size-3.5" />
              </span>
            ) : now ? (
              <span className="grid size-6 place-items-center rounded-full border-2 border-brand bg-bg-base">
                <span className="size-2 rounded-full bg-brand" />
              </span>
            ) : (
              <span className="size-6 rounded-full border-2 border-stroke-control bg-bg-base" />
            )}
            <span className={`text-[13px] font-semibold ${now || past ? 'text-content-primary' : 'text-content-secondary'}`}>
              {stop.label}
            </span>
            <span className={`-mt-1.5 text-[11px] ${now ? 'text-brand' : 'text-content-secondary'}`}>
              {now ? 'Now' : past ? 'Done' : stop.state === 'next' ? 'Next' : 'Later'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The same three stops on a computer (#1190, mock note 4): one line that reads
 * as a path, a tick for done and a ringed dot for now, in place of three boxes
 * that looked like buttons. Not clickable, as before; the state is also said
 * in words for a screen reader.
 */
function StageSteps({ status }: { status: NextRecord['status'] }) {
  const stops = recordStageSteps(status);
  return (
    <ol aria-label="Where this project is" className="hidden items-center gap-2.5 text-[13px] lg:flex">
      {stops.map((stop, index) => {
        const now = stop.state === 'now';
        const done = stop.state === 'done';
        return (
          <li key={stop.key} className="flex items-center gap-2.5">
            <span
              aria-current={now ? 'step' : undefined}
              className={`flex items-center gap-1.5 ${now ? 'font-semibold text-content-primary' : 'text-content-secondary'}`}
            >
              <span
                aria-hidden
                className={`grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] ${
                  done
                    ? 'border-brand bg-brand text-content-inverse'
                    : now
                      ? 'border-brand ring-[3px] ring-brand/15'
                      : 'border-stroke-strong'
                }`}
              >
                {done ? <Check className="size-3" /> : now ? <span className="block size-2 rounded-full bg-brand" /> : null}
              </span>
              {stop.label}
              <span className="sr-only">, {done ? 'done' : now ? 'now' : stop.state}</span>
            </span>
            {index < stops.length - 1 ? <span aria-hidden className="h-[1.5px] w-8 bg-stroke-strong" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

type Draft = {
  id: string | null;
  date: string;
  dateHint: string;
  status: SessionStatus;
  note: string;
  people: { personId: string | null; name: string; role: string }[];
  songIds: string[];
};

const emptyDraft = (): Draft => ({
  id: null,
  date: '',
  dateHint: '',
  status: 'planned',
  note: '',
  people: [{ personId: null, name: '', role: '' }],
  songIds: [],
});

const draftFrom = (session: RecordSession): Draft => ({
  id: session.id,
  date: session.date ?? '',
  dateHint: session.dateHint,
  status: session.status,
  note: session.note,
  people: session.people.length ? session.people.map((p) => ({ ...p })) : [{ personId: null, name: '', role: '' }],
  songIds: [...session.songIds],
});

function SessionForm({
  record,
  draft,
  contacts,
  busy,
  error,
  onChange,
  onSave,
  onCancel,
  onRemove,
}: {
  record: NextRecord;
  draft: Draft;
  contacts: ContactOption[];
  busy: boolean;
  error: string;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: (() => void) | null;
}) {
  const setPerson = (index: number, patch: Partial<Draft['people'][number]>) =>
    onChange({ ...draft, people: draft.people.map((p, i) => (i === index ? { ...p, ...patch } : p)) });

  // Picking a name from the team's contacts links that contact; typing over it unlinks.
  const pickName = (index: number, name: string) => {
    const match = contacts.find((c) => c.label.toLowerCase() === name.trim().toLowerCase());
    const current = draft.people[index];
    setPerson(index, {
      name,
      personId: match ? match.personId : null,
      role: match && !current.role ? match.role : current.role,
    });
  };

  return (
    <form
      className="space-y-4 rounded-lg border border-stroke-strong p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-content-primary">When</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="sr-only">Day</span>
            <input
              type="date"
              value={draft.date}
              onChange={(event) => onChange({ ...draft, date: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="sr-only">Or in words</span>
            <input
              type="text"
              value={draft.date ? '' : draft.dateHint}
              disabled={Boolean(draft.date)}
              maxLength={40}
              placeholder="or in words: next week"
              onChange={(event) => onChange({ ...draft, dateHint: event.target.value })}
              className={`${fieldClass} disabled:opacity-50`}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-content-primary">Who</legend>
        <datalist id="record-contacts">
          {contacts.map((contact) => (
            <option key={contact.personId} value={contact.label}>
              {contact.role}
            </option>
          ))}
        </datalist>
        {draft.people.map((person, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              list="record-contacts"
              value={person.name}
              maxLength={80}
              placeholder="Name"
              aria-label="Name"
              onChange={(event) => pickName(index, event.target.value)}
              className={`${fieldClass} min-w-0 flex-[3]`}
            />
            <input
              type="text"
              value={person.role}
              maxLength={40}
              placeholder="Producer"
              aria-label="Role"
              onChange={(event) => setPerson(index, { role: event.target.value })}
              className={`${fieldClass} min-w-0 flex-[2]`}
            />
            <button
              type="button"
              aria-label="Remove person"
              className={iconButton}
              onClick={() => onChange({ ...draft, people: draft.people.filter((_, i) => i !== index) })}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...draft, people: [...draft.people, { personId: null, name: '', role: '' }] })}
          className="motion-focus inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-content-secondary hover:text-content-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add someone
        </button>
      </fieldset>

      {record.songs.length ? (
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-content-primary">Songs worked on</legend>
          <div className="flex flex-wrap gap-2 pt-1">
            {record.songs.map((song) => {
              const on = draft.songIds.includes(song.id);
              return (
                <button
                  key={song.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      ...draft,
                      songIds: on ? draft.songIds.filter((id) => id !== song.id) : [...draft.songIds, song.id],
                    })
                  }
                  className={`motion-focus min-h-9 rounded-full border px-3 text-sm transition-colors ${
                    on
                      ? 'border-content-primary bg-content-primary text-content-inverse'
                      : 'border-stroke-default text-content-secondary hover:bg-bg-hover'
                  }`}
                >
                  {song.title}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {draft.id ? (
        <label className="block">
          <span className="text-sm font-semibold text-content-primary">What happened</span>
          <select
            value={draft.status}
            onChange={(event) => onChange({ ...draft, status: event.target.value as SessionStatus })}
            className={`${fieldClass} mt-2`}
          >
            {SESSION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SESSION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block">
        <span className="text-sm font-semibold text-content-primary">Note</span>
        <textarea
          value={draft.note}
          maxLength={500}
          rows={2}
          placeholder="Anything to remember"
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
          className={`${fieldClass} mt-2 py-2.5`}
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="motion-focus min-h-11 text-sm text-content-secondary underline underline-offset-4 hover:text-content-primary"
          >
            Remove session
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function RecordPageClient() {
  const router = useRouter();
  const params = useParams<{ artistId: string; recordId: string }>();
  const artistId = typeof params?.artistId === 'string' ? params.artistId : '';
  const recordId = typeof params?.recordId === 'string' ? params.recordId : '';
  const authLoading = useAuthStore((state) => state.isLoading);
  const artists = useArtistRosterStore((state) => state.artists);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const openIntake = usePlannerStore((state) => state.openIntake);

  const [record, setRecord] = useState<NextRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [newSong, setNewSong] = useState('');
  const [addingSong, setAddingSong] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [sheet, setSheet] = useState<SheetName>(null);
  const [sheetError, setSheetError] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [ideaDraft, setIdeaDraft] = useState('');
  /** Open tasks that move into Pre-production, counted when the plan sheet opens. */
  const [openTaskCount, setOpenTaskCount] = useState(0);
  /** The release day picked in the sheet; null means "pick it in the planner". */
  const [releaseDay, setReleaseDay] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<RecordSong | null>(null);
  const [songName, setSongName] = useState('');
  const [cropping, setCropping] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const adopt = useCallback((next: NextRecord) => setRecord(next), []);

  useEffect(() => {
    if (!ARTIST_PAGE_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    if (authLoading || !recordId) return;
    void loadRoster();
    void fetchContactOptions().then(setContacts);
    void fetchRecord(recordId).then((result) => {
      if (result.ok) adopt(result.record);
      else setMissing(true);
    });
  }, [authLoading, recordId, loadRoster, router, adopt]);

  const artist = artists.find((entry) => entry.id === artistId) ?? null;
  const today = useMemo(() => lagosToday(), []);
  const dayOptions = useMemo(() => releaseDayOptions(today), [today]);

  const run = async (
    work: () => Promise<RecordCall>,
    event?: AnalyticsEventPropertiesMap['record_edited']
  ): Promise<boolean> => {
    setBusy(true);
    setError('');
    setSheetError('');
    const result = await work();
    setBusy(false);
    if (!result.ok) {
      if (sheet) setSheetError(result.error);
      else setError(result.error);
      return false;
    }
    adopt(result.record);
    if (event) captureAnalyticsEvent({ name: 'record_edited', properties: event });
    return true;
  };

  if (!ARTIST_PAGE_ENABLED) return null;

  const back = (
    <div className="mb-3 flex items-center gap-2.5">
      <Link
        href={artistHref(artistId)}
        aria-label={artist ? artist.name : 'Artist'}
        className="motion-focus motion-press grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-stroke-control text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Link>
      <span className="min-w-0 truncate text-[13px] text-content-secondary">{artist?.name ?? 'Artist'}</span>
    </div>
  );

  if (!record) {
    return (
      <div className="mx-auto w-full max-w-xl lg:max-w-[1120px]">
        {back}
        {missing ? (
          <p className="text-sm text-content-secondary">We could not find that project on your team.</p>
        ) : (
          <>
            <div className="h-[190px] animate-pulse rounded-2xl bg-bg-surface lg:hidden" aria-busy="true" />
            {/* lg: the page's own shape, a square cover beside the name, then two columns. */}
            <div className="hidden lg:block" aria-busy="true">
              <div className="flex items-center gap-6">
                <div className="h-[136px] w-[136px] shrink-0 animate-pulse rounded-xl bg-bg-surface" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="h-4 w-32 animate-pulse rounded bg-bg-surface" />
                  <div className="h-10 w-72 animate-pulse rounded-lg bg-bg-surface" />
                  <div className="h-4 w-56 animate-pulse rounded bg-bg-surface" />
                </div>
                <div className="h-9 w-36 animate-pulse rounded-full bg-bg-surface" />
              </div>
              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_400px] items-start gap-6">
                <div className="space-y-4">
                  <div className="h-24 animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
                  <div className="h-40 animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
                </div>
                <div className="h-52 animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  const songTitle = (id: string) => record.songs.find((song) => song.id === id)?.title;
  const nextId = pickNextSession(record.sessions, today)?.id ?? null;
  const status = recordStatusLine(record, today);
  const coverColor = recordCoverColor(record);
  const artistName = artist?.name ?? '';
  const planned = record.status === 'planned' && record.releaseId;
  const isIdea = record.status === 'idea';
  const sessionPeople = recordCredits(record);
  const closeSheet = () => {
    if (busy) return;
    setSheet(null);
    setSheetError('');
  };

  const addSong = async () => {
    const name = newSong.trim();
    if (!name) return;
    const ok = await run(() => addRecordSong(record.id, name), {
      record_id: record.id,
      action: 'song_added',
      songs: record.songs.length + 1,
    });
    if (ok) setNewSong('');
  };

  const moveStage = (song: RecordSong, stage: SongStage) => {
    if (stage === song.stage) return;
    void run(() => patchRecordSong(record.id, song.id, { stage }), { record_id: record.id, action: 'song_stage', stage });
  };

  const saveDraft = async () => {
    if (!draft) return;
    const input: SessionInput = {
      date: draft.date || null,
      dateHint: draft.date ? '' : draft.dateHint.trim(),
      status: draft.status,
      note: draft.note.trim(),
      people: draft.people.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim(), role: p.role.trim() })),
      songIds: draft.songIds,
    };
    if (!input.date && !input.dateHint) {
      setFormError('Say when, even roughly: a day, or words like "next week".');
      return;
    }
    setBusy(true);
    setFormError('');
    const result = await saveRecordSession(record.id, draft.id, input);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    adopt(result.record);
    captureAnalyticsEvent({
      name: 'record_edited',
      properties: { record_id: record.id, action: draft.id ? 'session_edited' : 'session_added' },
    });
    setDraft(null);
  };

  const removeDraft = async () => {
    if (!draft?.id) return;
    setBusy(true);
    const result = await removeRecordSession(record.id, draft.id);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    adopt(result.record);
    captureAnalyticsEvent({ name: 'record_edited', properties: { record_id: record.id, action: 'session_removed' } });
    setDraft(null);
  };

  const startSession = () => {
    setFormError('');
    setDraft(emptyDraft());
  };

  // ── the cover picture: sign, PUT the bytes, save the path (the artist photo flow)
  const chooseCover = async (file: File) => {
    setSheetError('');
    setBusy(true);
    try {
      const prepared = await prepareAvatarImage(file, 2048);
      if (!prepared) {
        setSheetError('Could not read that image. Try a JPEG.');
        return;
      }
      setCropping(prepared.file);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const uploadCover = async (body: File) => {
    setCropping(null);
    setBusy(true);
    setSheetError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to change the cover.');
      const signed = await fetch(recordCoverSignUrl(record.id), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: body.name, mime_type: body.type, file_size: body.size }),
      });
      const target = (await signed.json().catch(() => null)) as {
        upload_url?: string;
        storage_path?: string;
        thumb_upload_url?: string | null;
        error?: string;
      } | null;
      if (!signed.ok || !target?.upload_url || !target.storage_path) throw new Error(target?.error || 'Could not start the upload.');
      const thumbDone = uploadThumb(target.thumb_upload_url, body);
      const put = await fetch(target.upload_url, { method: 'PUT', headers: { 'Content-Type': body.type }, body });
      if (!put.ok) throw new Error('The upload did not finish.');
      await thumbDone;
      setBusy(false);
      const ok = await run(() => saveRecordCover(record.id, { photoPath: target.storage_path as string }), {
        record_id: record.id,
        action: 'cover',
      });
      if (ok) setSheet(null);
    } catch (uploadError) {
      setSheetError(uploadError instanceof Error ? uploadError.message : 'Could not save the cover.');
    } finally {
      setBusy(false);
    }
  };

  // ── Plan the rollout (step 4): make the rollout, link it, open planner v2
  const openPlanSheet = () => {
    setSheetError('');
    setReleaseDay(dayOptions[1]?.date ?? null);
    setSheet('plan');
    setOpenTaskCount(0);
    void fetchProjectTasks(record.id).then((tasks) => {
      if (tasks) setOpenTaskCount(tasks.filter((task) => !isTaskClosed(task.status)).length);
    });
    captureAnalyticsEvent({
      name: 'record_rollout',
      properties: {
        record_id: record.id,
        step: 'sheet_opened',
        songs: record.songs.length,
        songs_not_done: record.songs.filter((song) => song.stage !== 'done').length,
      },
    });
  };

  const continueToPlanner = async () => {
    const releaseType = recordReleaseType(record);
    setBusy(true);
    setSheetError('');
    const started = await startRecordRollout(record, releaseType);
    setBusy(false);
    if (!started.ok) {
      setSheetError(started.error);
      return;
    }
    if (started.record) adopt(started.record);
    captureAnalyticsEvent({
      name: 'record_rollout',
      properties: {
        record_id: record.id,
        step: 'continued',
        songs: record.songs.length,
        songs_not_done: record.songs.filter((song) => song.stage !== 'done').length,
      },
    });
    setSheet(null);
    openIntake({
      source: 'record',
      releaseId: started.releaseId,
      discardIfAbandoned: true,
      createdTitle: record.title,
      prefill: {
        releaseType,
        ...(artistName ? { artistName } : {}),
        ...(releaseDay ? { releaseDate: releaseDay } : {}),
        musicStage: recordMusicStage(record),
        fromRecord: fromRecordLine(record),
        ...(record.coverUrl ? { readyToday: ['artwork' as const] } : {}),
        ...(record.idea ? { extraNotes: record.idea } : {}),
      },
    });
  };

  const useNote = recordUseNote(record.songs);
  const tasksNote = carryOverLine(openTaskCount);
  const openIdea = () => {
    setIdeaDraft(record.idea);
    setSheetError('');
    setSheet('idea');
  };
  const hasTasks = isOpenRecord(record.status);
  const eyebrow = [artistName, record.kind ? recordKindLabel(record.kind) : null].filter(Boolean).join(' · ');

  // The ⋯ menu, drawn once for the phone's cover and once for the desktop
  // header; whichever the screen hides is display:none, backdrop included.
  const moreMenu = (buttonClass: string, bubbleClass: string) => (
    <>
      {sheet === 'menu' ? (
        <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-[200] cursor-default bg-black/45" onClick={() => setSheet(null)} />
      ) : null}
      <div className={`relative ${sheet === 'menu' ? 'z-[210]' : ''}`}>
        <button
          type="button"
          aria-label="More for this project"
          aria-haspopup="menu"
          aria-expanded={sheet === 'menu'}
          onClick={() => setSheet(sheet === 'menu' ? null : 'menu')}
          className={buttonClass}
        >
          <span className={`${bubbleClass} ${sheet === 'menu' ? 'bg-content-primary text-content-inverse' : ''}`}>
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </span>
        </button>
          {sheet === 'menu' ? (
            <div
              role="menu"
              aria-label="More for this project"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSheet(null);
              }}
              className="absolute right-0 top-full mt-1 w-[220px] overflow-hidden rounded-[14px] border border-stroke-strong bg-bg-elevated py-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
            >
              {[
                {
                  label: 'Rename',
                  open: () => {
                    setRenameTo(record.title);
                    setSheet('rename');
                  },
                },
                { label: 'Change cover or colour', open: () => setSheet('cover') },
                { label: 'Single, EP or album', open: () => setSheet('kind') },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={item.open}
                  className="motion-focus block min-h-11 w-full px-3.5 text-left text-sm text-content-primary hover:bg-bg-hover"
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => setSheet('drop')}
                className="motion-focus block min-h-11 w-full border-t border-stroke-strong px-3.5 text-left text-sm text-status-error hover:bg-bg-hover"
              >
                Drop this project
              </button>
            </div>
          ) : null}
      </div>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-xl space-y-3 pb-10 lg:max-w-[1120px] lg:space-y-4">
      {back}

      {/* lg (#1190, mock notes 2 to 4): a square cover, the name and the steps,
          and the one filled button at the top right with its reason under it.
          With no picture the square is a plain tile that says so. */}
      <header className="hidden items-center gap-6 lg:flex">
        <div
          className="relative grid h-[136px] w-[136px] shrink-0 place-items-center overflow-hidden rounded-xl bg-bg-active bg-cover bg-center"
          style={record.coverUrl ? { backgroundImage: `url("${record.coverUrl}")` } : undefined}
        >
          {record.coverUrl ? null : <span className="text-xs font-semibold text-content-secondary">No cover yet</span>}
          <button
            type="button"
            onClick={() => setSheet('cover')}
            className="motion-focus motion-press absolute bottom-2 left-2 inline-flex min-h-7 items-center rounded-full border border-stroke-strong bg-bg-surface px-2.5 text-xs font-medium text-content-primary transition-colors hover:bg-bg-hover"
          >
            {record.coverUrl ? 'Change cover' : 'Add cover'}
          </button>
        </div>
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="truncate text-sm font-medium text-content-secondary">{eyebrow}</p> : null}
          <h1 className="mb-3 mt-0.5 line-clamp-2 font-display text-4xl font-normal leading-[44px] text-content-primary">{record.title}</h1>
          {record.status !== 'dropped' ? <StageSteps status={record.status} /> : null}
          {/* The song count sits on the tracklist here, so only the next session is said. */}
          {status.next ? <p className="mt-2 text-[13px] text-status-warning first-letter:uppercase">{status.next}</p> : null}
        </div>
        {/* The ⋯ menu sits right beside the button; the reason line runs under both. */}
        <div className="flex max-w-[300px] shrink-0 flex-col items-end text-right">
          <div className="flex items-center gap-2">
            {moreMenu(
              'motion-focus motion-press grid h-9 w-9 place-items-center rounded-full border border-stroke-strong text-content-primary transition-colors hover:bg-bg-hover',
              'grid h-full w-full place-items-center rounded-full'
            )}
            {planned ? (
              <Link href={`/dashboard?release=${record.releaseId}`} className={desktopFilled}>
                Open the rollout
              </Link>
            ) : record.status === 'dropped' ? null : (
              <button type="button" onClick={openPlanSheet} disabled={busy} className={desktopFilled}>
                {RELEASE_DAY_BUTTON}
              </button>
            )}
          </div>
          {planned ? (
            <p className="mt-1.5 text-xs text-content-secondary">This project is now its rollout</p>
          ) : record.status === 'dropped' ? null : (
            <p className="mt-1.5 text-xs text-content-secondary">{planHint(record.songs)}</p>
          )}
        </div>
      </header>

      {/* The cover (mock screens 2 and 3), on a phone */}
      <section
        className="relative flex h-[190px] flex-col justify-between rounded-2xl bg-cover bg-center px-3.5 py-3 lg:hidden"
        style={{ backgroundColor: coverColor, backgroundImage: record.coverUrl ? `url("${record.coverUrl}")` : undefined }}
        aria-label={`${record.title} cover`}
      >
        {/* A scrim only over a real picture, so the words stay readable. */}
        {record.coverUrl ? <div aria-hidden className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/60 via-black/10 to-black/30" /> : null}
        <div className="relative flex items-start justify-between">
          <button type="button" onClick={() => setSheet('cover')} className={`${coverChip} min-h-8 px-3 text-xs`}>
            {record.coverUrl ? 'Change cover' : 'Add cover'}
          </button>
          {moreMenu(`${coverChip} -mr-1.5 -mt-1.5 grid h-11 w-11 place-items-center`, 'grid h-8 w-8 place-items-center rounded-full')}
        </div>
        <div className="relative min-w-0">
          <p className="truncate text-[13px] text-white/80">
            {eyebrow}
          </p>
          <h1 className="line-clamp-2 font-display text-[28px] font-normal leading-[1.1] text-white">{record.title}</h1>
        </div>
      </section>

      <p className="pt-1 text-sm text-content-primary lg:hidden">
        {status.main}
        {status.next ? (
          <>
            {' · '}
            <span className="text-status-warning">{status.next}</span>
          </>
        ) : null}
      </p>

      {record.status !== 'dropped' ? <StageLine status={record.status} /> : null}

      {/* lg (#1190, mock note 1): two columns. The cards stay in the phone's
          order in the page; on a computer the idea, the songs and the sessions
          take the left column and tasks the right, which spans every row. The
          last row is the stretchy one, so a long tasks card never spreads the
          left cards apart. */}
      <div
        className={`space-y-3 lg:grid lg:items-start lg:gap-x-6 lg:gap-y-4 lg:space-y-0 ${
          hasTasks ? 'lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_auto_auto_auto_1fr]' : 'lg:max-w-[696px] lg:grid-cols-1'
        }`}
      >
      {/* The idea (2026-11-04): back on the page, because an Idea stage with
          nowhere to write the idea is empty. In the making it shows only once written. */}
      {isIdea || record.idea ? (
        <Card
          title="The idea"
          className="lg:col-start-1"
          aside={
            <button
              type="button"
              onClick={openIdea}
              className="motion-focus -my-2 inline-flex min-h-11 items-center px-1 text-[13px] font-semibold text-content-primary hover:underline lg:text-brand lg:underline lg:underline-offset-[3px] lg:hover:no-underline"
            >
              {record.idea ? 'Edit' : 'Write it'}
            </button>
          }
        >
          <p className={`whitespace-pre-line text-sm lg:text-[15px] lg:leading-6 ${record.idea ? 'text-content-primary' : 'text-content-secondary'}`}>
            {record.idea || 'What is this one about? A line is enough.'}
          </p>
        </Card>
      ) : null}

      {planned ? (
        <div className="lg:hidden">
          <Link href={`/dashboard?release=${record.releaseId}`} className={greenButton}>
            Open the rollout
          </Link>
          <p className="mt-1.5 text-center text-xs text-content-secondary">This project is now its rollout</p>
        </div>
      ) : (
        <div className="lg:hidden">
          <button type="button" onClick={openPlanSheet} disabled={busy} className={greenButton}>
            {RELEASE_DAY_BUTTON}
          </button>
          <p className="mt-1.5 text-center text-xs text-content-secondary">{planHint(record.songs)}</p>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-status-error lg:col-start-1">
          {error}
        </p>
      ) : null}

      {/* Songs: a numbered tracklist with four stage bars (mock screen 3) */}
      {record.songs.length ? (
        <Card title="Tracklist" count={status.main} aside="Idea · Rec · Mix · Done" asideClassName="lg:hidden" className="lg:col-start-1">
          {/* lg (mock note 5): each bar sits under its name. The names are the
              app's own stage names; the bars say them to a screen reader. */}
          <div aria-hidden className="hidden justify-end pb-1 text-xs font-semibold text-content-secondary lg:flex">
            {SONG_STAGES.map((stage) => (
              <span key={stage} className="w-[68px] text-center">
                {SONG_STAGE_LABELS[stage]}
              </span>
            ))}
          </div>
          <ol>
            {record.songs.map((song, index) => (
              <li key={song.id} className="flex items-center justify-between gap-2 border-t border-stroke-default py-1 first:border-t-0 lg:first:border-t">
                <button
                  type="button"
                  onClick={() => {
                    setSongName(song.title);
                    setSheetError('');
                    setEditingSong(song);
                  }}
                  className="motion-focus flex min-h-11 min-w-0 flex-1 items-center text-left text-sm text-content-primary"
                >
                  <span className="w-[18px] shrink-0 tabular-nums text-content-tertiary lg:w-6 lg:text-content-secondary">{index + 1}</span>
                  <span className="truncate lg:font-semibold">{song.title}</span>
                </button>
                <StageBars title={song.title} stage={song.stage} disabled={busy} onPick={(stage) => moveStage(song, stage)} />
              </li>
            ))}
          </ol>
          {addingSong ? (
            <form
              className="flex gap-2 border-t border-stroke-default pt-2.5"
              onSubmit={(event) => {
                event.preventDefault();
                void addSong();
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">Song name</span>
                <input
                  autoFocus
                  value={newSong}
                  maxLength={120}
                  placeholder="A working title is fine"
                  onChange={(event) => setNewSong(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <button type="submit" disabled={busy || !newSong.trim()} className={secondaryButton}>
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingSong(true)}
              className="motion-focus flex min-h-11 w-full items-center gap-1.5 border-t border-stroke-default text-[13px] text-content-secondary hover:text-content-primary"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add a song
            </button>
          )}
        </Card>
      ) : addingSong ? (
        <form
          className="flex gap-2 rounded-[14px] border border-dashed border-stroke-control p-3 lg:col-start-1"
          onSubmit={(event) => {
            event.preventDefault();
            void addSong();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Song name</span>
            <input
              autoFocus
              value={newSong}
              maxLength={120}
              placeholder="A working title is fine"
              onChange={(event) => setNewSong(event.target.value)}
              className={fieldClass}
            />
          </label>
          <button type="submit" disabled={busy || !newSong.trim()} className={secondaryButton}>
            Add
          </button>
        </form>
      ) : (
        <AddCard title="Add a song" hint="A working title is fine. Rename it later." className="lg:col-start-1" onClick={() => setAddingSong(true)} />
      )}

      {/* Tasks (2026-11-04, mock screens 2 and 3): real tasks on the project,
          under the songs because the songs are why the tasks exist. */}
      {hasTasks ? (
        <div className="min-w-0 lg:col-start-2 lg:row-span-5 lg:row-start-1">
          <ProjectTasksCard recordId={record.id} />
        </div>
      ) : null}

      {/* Sessions with a little date block (mock screen 3) */}
      {record.sessions.length || (draft && draft.id === null) ? (
        <Card
          title="Sessions"
          className="lg:col-start-1"
          aside={
            sessionPeople.length ? (
              <span className="flex" aria-label={sessionPeople.map((person) => person.name).join(', ')}>
                {sessionPeople.slice(0, 3).map((person, index) => (
                  <span
                    key={`${person.name}-${index}`}
                    className={`grid h-8 w-8 place-items-center rounded-full border-2 border-bg-surface bg-bg-elevated text-[11px] font-bold text-content-secondary ${index ? '-ml-2' : ''}`}
                  >
                    {initials(person.name)}
                  </span>
                ))}
              </span>
            ) : undefined
          }
        >
          <ul>
            {record.sessions.map((session) =>
              draft?.id === session.id ? (
                <li key={session.id} className="border-t border-stroke-default py-2 first:border-t-0">
                  <SessionForm
                    record={record}
                    draft={draft}
                    contacts={contacts}
                    busy={busy}
                    error={formError}
                    onChange={setDraft}
                    onSave={() => void saveDraft()}
                    onCancel={() => setDraft(null)}
                    onRemove={() => void removeDraft()}
                  />
                </li>
              ) : (
                <li key={session.id} className="border-t border-stroke-default first:border-t-0">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError('');
                      setDraft(draftFrom(session));
                    }}
                    className="motion-focus flex w-full items-center gap-3 py-2.5 text-left"
                  >
                    <DateBlock date={session.date} soon={session.id === nextId} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-content-primary">
                        {[
                          session.people[0]
                            ? [session.people[0].name, session.people[0].role].filter(Boolean).join(' · ')
                            : sessionWhen(session),
                          session.people.length > 1 ? `+${session.people.length - 1}` : null,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                      <p className="truncate text-[13px] text-content-secondary">
                        {[
                          session.date ? null : session.people[0] ? session.dateHint : null,
                          session.songIds.map(songTitle).filter(Boolean).join(', ') || session.note,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Tap to add who and which songs'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        session.id === nextId
                          ? 'border-status-warning/50 text-status-warning'
                          : 'border-stroke-control text-content-secondary'
                      }`}
                    >
                      {session.id === nextId
                        ? 'Next'
                        : session.status === 'planned' && session.date !== null && session.date < today
                          ? 'Did it happen?'
                          : session.status === 'happened'
                            ? 'Done'
                            : SESSION_STATUS_LABELS[session.status]}
                    </span>
                  </button>
                </li>
              )
            )}
          </ul>
          {draft && draft.id === null ? (
            <div className="mt-2">
              <SessionForm
                record={record}
                draft={draft}
                contacts={contacts}
                busy={busy}
                error={formError}
                onChange={setDraft}
                onSave={() => void saveDraft()}
                onCancel={() => setDraft(null)}
                onRemove={null}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={startSession}
              className="motion-focus flex min-h-11 w-full items-center gap-1.5 border-t border-stroke-default text-[13px] text-content-secondary hover:text-content-primary"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add a session
            </button>
          )}
        </Card>
      ) : (
        <AddCard title="Add a session" hint={'A day, or words like "next week".'} className="lg:col-start-1" onClick={startSession} />
      )}
      </div>

      {/* ── Sheets ─────────────────────────────────────────────────────────── */}

      {/* The AI on this project, on a phone (2026-11-04, #1074): the box sends here. */}
      <ProjectChatSheet recordId={record.id} title={record.title} />

      {sheet === 'plan' ? (
        <Sheet label={`A release day for ${record.title}`} onClose={closeSheet}>
          {/* #1143 slice 2 (mock 1.3): pick the day here; the planner then skips its date question. */}
          <h2 className="font-sans text-lg font-semibold text-content-primary">A release day for {record.title}</h2>
          <p className="mt-0.5 text-[13px] text-content-secondary">We build the plan back from this day.</p>
          <p className="mt-4 text-sm font-medium text-content-primary">Release day</p>
          <div role="radiogroup" aria-label="Release day" className="mt-2 grid grid-cols-3 gap-2">
            {dayOptions.map((option) => {
              const on = releaseDay === option.date;
              return (
                <button
                  key={option.date}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setReleaseDay(option.date)}
                  className={`motion-focus min-h-11 rounded-lg border p-2 text-center ${
                    on ? 'border-brand bg-brand/[.07] ring-1 ring-brand' : 'border-stroke-control'
                  }`}
                >
                  <span className="block text-[11px] text-content-secondary">{option.weekday}</span>
                  <span className="block text-[15px] font-semibold text-content-primary">{option.day}</span>
                  <span className={`block text-[11px] ${on ? 'text-brand' : 'text-content-secondary'}`}>{option.weeks} wks</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            role="radio"
            aria-checked={releaseDay === null}
            onClick={() => setReleaseDay(null)}
            className={`motion-focus mt-1 inline-flex min-h-11 items-center text-[13px] font-medium ${
              releaseDay === null ? 'text-content-primary underline underline-offset-[3px]' : 'text-brand'
            }`}
          >
            Another day: pick it in the next step
          </button>
          {tasksNote ? (
            <p className="mt-2 rounded-lg border border-brand/30 bg-brand/[.07] px-3.5 py-2.5 text-[13px] text-content-primary">{tasksNote}</p>
          ) : null}
          <details className="mt-3">
            <summary className="motion-focus min-h-11 cursor-pointer py-2 text-[13px] font-medium text-content-secondary">What the plan will use</summary>
            <UseRow label="Kind" value={recordKindLabel(recordReleaseType(record))} />
            <UseRow label="Songs" value={record.songs.map((song) => song.title).join(', ') || 'None yet'} />
            <UseRow
              label="Credits"
              value={
                sessionPeople.map((person) => (person.role ? `${person.name} (${person.role})` : person.name)).join(', ') ||
                'None yet'
              }
            />
            {record.idea ? <UseRow label="The idea" value={record.idea} /> : null}
            <UseRow label="Cover" value={record.coverUrl ? 'Your cover' : 'Your mood colour, until there\'s art'} />
          </details>
          {useNote ? <p className="mt-2 text-[13px] text-content-secondary">{useNote}</p> : null}
          {sheetError ? (
            <p role="alert" className="mt-2 text-sm text-status-error">
              {sheetError}
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            <button type="button" onClick={() => void continueToPlanner()} disabled={busy} className={greenButton}>
              {busy ? 'One moment…' : 'Make the plan'}
            </button>
            <button type="button" onClick={closeSheet} disabled={busy} className={outlineButton}>
              Not yet
            </button>
          </div>
        </Sheet>
      ) : null}

      {sheet === 'idea' ? (
        <Sheet label="The idea" onClose={closeSheet}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const next = ideaDraft.trim();
              if (next === record.idea) {
                closeSheet();
                return;
              }
              void run(() => patchRecord(record.id, { idea: next }), { record_id: record.id, action: 'idea' }).then((ok) => {
                if (ok) setSheet(null);
              });
            }}
          >
            <h2 className="font-display text-xl text-content-primary">The idea</h2>
            <p className="mt-1 text-[13px] text-content-secondary">What it is about, the sound, who is on it. The AI reads it too.</p>
            <label className="mt-3 block">
              <span className="sr-only">The idea</span>
              <textarea
                autoFocus
                value={ideaDraft}
                maxLength={2000}
                rows={5}
                onChange={(event) => setIdeaDraft(event.target.value)}
                className={`${fieldClass} min-h-[120px] py-2.5 leading-relaxed`}
              />
            </label>
            {sheetError ? (
              <p role="alert" className="mt-2 text-sm text-status-error">
                {sheetError}
              </p>
            ) : null}
            <div className="mt-3 space-y-2">
              <button type="submit" disabled={busy} className={greenButton}>
                Save
              </button>
              <button type="button" onClick={closeSheet} disabled={busy} className={outlineButton}>
                Cancel
              </button>
            </div>
          </form>
        </Sheet>
      ) : null}

      {sheet === 'rename' ? (
        <Sheet label="Rename" onClose={closeSheet}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const next = renameTo.trim();
              if (!next || next === record.title) {
                closeSheet();
                return;
              }
              void run(() => patchRecord(record.id, { title: next }), { record_id: record.id, action: 'details' }).then((ok) => {
                if (ok) setSheet(null);
              });
            }}
          >
            <h2 className="font-display text-xl text-content-primary">Rename</h2>
            <label className="mt-3 block">
              <span className="sr-only">Project name</span>
              <input autoFocus value={renameTo} maxLength={120} onChange={(event) => setRenameTo(event.target.value)} className={fieldClass} />
            </label>
            {sheetError ? (
              <p role="alert" className="mt-2 text-sm text-status-error">
                {sheetError}
              </p>
            ) : null}
            <div className="mt-3 space-y-2">
              <button type="submit" disabled={busy || !renameTo.trim()} className={greenButton}>
                Save
              </button>
              <button type="button" onClick={closeSheet} disabled={busy} className={outlineButton}>
                Cancel
              </button>
            </div>
          </form>
        </Sheet>
      ) : null}

      {sheet === 'kind' ? (
        <Sheet label="Single, EP or album" onClose={closeSheet}>
          <h2 className="font-display text-xl text-content-primary">Single, EP or album</h2>
          <div className="mt-2" role="radiogroup" aria-label="Single, EP or album">
            {[...RECORD_KINDS, null].map((kind: RecordKind | null) => {
              const on = record.kind === kind;
              return (
                <button
                  key={kind ?? 'unsure'}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={busy}
                  onClick={() =>
                    void run(() => patchRecord(record.id, { kind }), { record_id: record.id, action: 'details' }).then((ok) => {
                      if (ok) setSheet(null);
                    })
                  }
                  className={`motion-focus mt-2 flex min-h-12 w-full items-center justify-between rounded-[14px] border px-3.5 text-left text-sm transition-colors ${
                    on ? 'border-brand bg-brand/10 text-content-primary' : 'border-stroke-control text-content-primary hover:bg-bg-hover'
                  }`}
                >
                  {kind ? recordKindLabel(kind) : 'Not sure yet'}
                  {on ? <Check className="h-4 w-4 text-brand" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
          {sheetError ? (
            <p role="alert" className="mt-2 text-sm text-status-error">
              {sheetError}
            </p>
          ) : null}
        </Sheet>
      ) : null}

      {sheet === 'cover' ? (
        <Sheet label="Change cover or colour" onClose={closeSheet}>
          <h2 className="font-display text-xl text-content-primary">Cover</h2>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void chooseCover(file);
            }}
          />
          <div className="mt-3 flex items-center gap-3">
            <CoverTile color={coverColor} url={record.coverUrl} size={64} className="rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={outlineButton}>
                {busy ? 'Saving…' : record.coverUrl ? 'Change picture' : 'Add a picture'}
              </button>
            </div>
          </div>
          {record.coverUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() => saveRecordCover(record.id, { photoPath: null }), { record_id: record.id, action: 'cover' })
              }
              className="motion-focus mt-1 min-h-11 text-sm text-content-secondary underline underline-offset-4 hover:text-content-primary"
            >
              Remove the picture
            </button>
          ) : null}
          <p className="mt-3 text-[13px] text-content-secondary">Colour{record.coverUrl ? ', behind the picture' : ''}</p>
          <div className="mt-2 grid grid-cols-8 gap-2" role="radiogroup" aria-label="Cover colour">
            {RECORD_COVER_COLORS.map((colour) => {
              const on = coverColor === colour;
              const isArtist = colour === artistCoverColor(record.artistId);
              return (
                <button
                  key={colour}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={isArtist ? 'The artist colour' : `Colour ${colour}`}
                  disabled={busy}
                  onClick={() =>
                    void run(() => saveRecordCover(record.id, { coverColor: isArtist ? null : colour }), {
                      record_id: record.id,
                      action: 'cover',
                    })
                  }
                  className={`motion-focus grid aspect-square place-items-center rounded-full ${on ? 'ring-2 ring-content-primary ring-offset-2 ring-offset-bg-elevated' : ''}`}
                  style={{ backgroundColor: colour }}
                >
                  {on ? <Check className="h-3.5 w-3.5 text-white" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
          {sheetError ? (
            <p role="alert" className="mt-2 text-sm text-status-error">
              {sheetError}
            </p>
          ) : null}
          <button type="button" onClick={closeSheet} disabled={busy} className={`${outlineButton} mt-4`}>
            Done
          </button>
        </Sheet>
      ) : null}

      {cropping ? (
        <PhotoCropDialog file={cropping} name={record.title} onCancel={() => setCropping(null)} onConfirm={(file) => void uploadCover(file)} />
      ) : null}

      {sheet === 'drop' ? (
        <Sheet label={`Drop ${record.title}?`} onClose={closeSheet}>
          <h2 className="font-display text-xl text-content-primary">Drop {record.title}?</h2>
          <p className="mt-1.5 text-sm text-content-secondary">
            It leaves In the making. The people stay in Relationships. Nothing else changes.
          </p>
          {sheetError ? (
            <p role="alert" className="mt-2 text-sm text-status-error">
              {sheetError}
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() => patchRecord(record.id, { status: 'dropped' }), { record_id: record.id, action: 'dropped' }).then(
                  (ok) => {
                    if (ok) router.push(artistHref(artistId));
                  }
                )
              }
              className="motion-press flex min-h-11 w-full items-center justify-center rounded-full bg-status-error px-5 text-sm font-semibold text-content-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Drop it
            </button>
            <button type="button" onClick={closeSheet} disabled={busy} className={outlineButton}>
              Keep it
            </button>
          </div>
        </Sheet>
      ) : null}

      {editingSong ? (
        <Sheet label={editingSong.title} onClose={() => !busy && setEditingSong(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = songName.trim();
              if (!name || name === editingSong.title) {
                setEditingSong(null);
                return;
              }
              void run(() => patchRecordSong(record.id, editingSong.id, { title: name }), {
                record_id: record.id,
                action: 'details',
              }).then((ok) => {
                if (ok) setEditingSong(null);
              });
            }}
          >
            <h2 className="font-display text-xl text-content-primary">Song</h2>
            <label className="mt-3 block">
              <span className="sr-only">Song name</span>
              <input autoFocus value={songName} maxLength={120} onChange={(event) => setSongName(event.target.value)} className={fieldClass} />
            </label>
            {error ? (
              <p role="alert" className="mt-2 text-sm text-status-error">
                {error}
              </p>
            ) : null}
            <div className="mt-3 space-y-2">
              <button type="submit" disabled={busy || !songName.trim()} className={greenButton}>
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() => removeRecordSong(record.id, editingSong.id), {
                    record_id: record.id,
                    action: 'song_removed',
                    songs: record.songs.length - 1,
                  }).then((ok) => {
                    if (ok) setEditingSong(null);
                  })
                }
                className="motion-focus flex min-h-11 w-full items-center justify-center text-sm text-status-error"
              >
                Take it off the project
              </button>
            </div>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}
