'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import type { AnalyticsEventPropertiesMap } from '@/lib/analytics/shared';
import { artistHref, isArtistPageEnabled } from '@/lib/artist-page';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import {
  RECORD_KINDS,
  SESSION_STATUSES,
  SESSION_STATUS_LABELS,
  SONG_STAGES,
  SONG_STAGE_LABELS,
  isRecordDone,
  lagosToday,
  pickNextSession,
  recordKindLabel,
  sessionWhen,
  type NextRecord,
  type RecordSession,
  type SessionInput,
  type SessionStatus,
  type SongStage,
} from '@/lib/next-records';
import {
  addRecordSong,
  fetchContactOptions,
  fetchRecord,
  patchRecord,
  patchRecordSong,
  removeRecordSession,
  removeRecordSong,
  saveRecordSession,
  type ContactOption,
  type RecordCall,
} from '@/lib/next-records-client';

// A record in the making (2026-10-27, mock screen 3): songs, sessions and the
// people in them, nothing else. Every write answers with the whole record, so
// the page swaps it in. See docs/notes/2026-10-27-next-record.md.

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();

const primaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full bg-content-primary px-5 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-5 text-sm font-medium text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50';
const fieldClass =
  'min-h-11 w-full rounded-lg border border-stroke-control bg-bg-surface px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-content-primary focus:outline-none';
const chipSelect =
  // Phones get form fields at 16px (no zoom on focus), so the stage reads in
  // normal case at a fixed width rather than as a small uppercase chip.
  'motion-focus h-9 w-28 shrink-0 cursor-pointer appearance-none rounded-full border px-3 text-center text-sm font-medium focus:outline-none';
const iconButton =
  'motion-focus motion-press grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary';

const stageTone = (stage: SongStage) =>
  stage === 'done'
    ? 'border-status-success text-status-success bg-bg-surface'
    : 'border-stroke-control text-content-secondary bg-bg-surface';

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-content-primary">{title}</h2>
        {aside ? <span className="text-sm text-content-secondary">{aside}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
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

  const [record, setRecord] = useState<NextRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [newSong, setNewSong] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  const adopt = useCallback((next: NextRecord) => {
    setRecord(next);
    setTitle(next.title);
    setIdea(next.idea);
  }, []);

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

  const run = async (
    work: () => Promise<RecordCall>,
    event?: AnalyticsEventPropertiesMap['record_edited']
  ): Promise<boolean> => {
    setBusy(true);
    setError('');
    const result = await work();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    adopt(result.record);
    if (event) captureAnalyticsEvent({ name: 'record_edited', properties: event });
    return true;
  };

  if (!ARTIST_PAGE_ENABLED) return null;

  const back = (
    <Link
      href={artistHref(artistId)}
      aria-label={artist ? artist.name : 'Artist'}
      title={artist ? artist.name : 'Artist'}
      className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
    </Link>
  );

  if (!record) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {back}
        {missing ? (
          <p className="mt-6 text-sm text-content-secondary">We could not find that record on your team.</p>
        ) : (
          <div className="mt-6 h-40 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" aria-busy="true" />
        )}
      </div>
    );
  }

  const doneCount = record.songs.filter((song) => song.stage === 'done').length;
  const songTitle = (id: string) => record.songs.find((song) => song.id === id)?.title;
  const nextId = pickNextSession(record.sessions, today)?.id ?? null;

  const saveTitle = () => {
    const next = title.trim();
    if (!next || next === record.title) {
      setTitle(record.title);
      return;
    }
    void run(() => patchRecord(record.id, { title: next }), { record_id: record.id, action: 'details' });
  };

  const saveIdea = () => {
    if (idea.trim() === record.idea) return;
    void run(() => patchRecord(record.id, { idea: idea.trim() }), { record_id: record.id, action: 'details' });
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

  const drop = async () => {
    if (!window.confirm('Drop this record? It leaves "In the making". Nothing else changes.')) return;
    const ok = await run(() => patchRecord(record.id, { status: 'dropped' }), { record_id: record.id, action: 'dropped' });
    if (ok) router.push(artistHref(artistId));
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-10">
      <div className="flex items-center gap-3">
        {back}
        <p className="min-w-0 truncate text-sm text-content-secondary">
          <Link href="/dashboard/artists" className="hover:text-content-primary">
            Catalogue
          </Link>
          {' › '}
          <Link href={artistHref(artistId)} className="hover:text-content-primary">
            {artist?.name ?? 'Artist'}
          </Link>
        </p>
      </div>

      <header>
        <label className="block">
          <span className="sr-only">Record name</span>
          <input
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
            className="w-full rounded-lg border border-transparent bg-transparent px-1 -mx-1 font-display text-3xl font-semibold leading-tight text-content-primary hover:border-stroke-control focus:border-content-primary focus:outline-none"
          />
        </label>
        <p className="mt-1 text-sm text-content-secondary">In the making · no release date yet</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="What kind of record">
          {RECORD_KINDS.map((kind) => {
            const on = record.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() =>
                  void run(() => patchRecord(record.id, { kind: on ? null : kind }), {
                    record_id: record.id,
                    action: 'details',
                  })
                }
                className={`motion-focus min-h-9 rounded-full border px-3.5 text-sm transition-colors ${
                  on
                    ? 'border-content-primary bg-content-primary text-content-inverse'
                    : 'border-stroke-default text-content-secondary hover:bg-bg-hover'
                }`}
              >
                {recordKindLabel(kind)}
              </button>
            );
          })}
        </div>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <Card title="The idea">
        <textarea
          value={idea}
          maxLength={2000}
          rows={2}
          placeholder="What is this record about? A line is enough."
          onChange={(event) => setIdea(event.target.value)}
          onBlur={saveIdea}
          className={`${fieldClass} py-2.5`}
        />
      </Card>

      <Card title="Songs" aside={record.songs.length ? `${doneCount} of ${record.songs.length} done` : undefined}>
        {record.songs.length ? (
          <ul className="divide-y divide-stroke-default">
            {record.songs.map((song) => (
              <li key={song.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-content-primary">{song.title}</span>
                <label className="shrink-0">
                  <span className="sr-only">Stage for {song.title}</span>
                  <select
                    value={song.stage}
                    disabled={busy}
                    onChange={(event) => {
                      const stage = event.target.value as SongStage;
                      void run(() => patchRecordSong(record.id, song.id, { stage }), {
                        record_id: record.id,
                        action: 'song_stage',
                        stage,
                      });
                    }}
                    className={`${chipSelect} ${stageTone(song.stage)}`}
                  >
                    {SONG_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {SONG_STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-label={`Remove ${song.title}`}
                  disabled={busy}
                  className={iconButton}
                  onClick={() => {
                    if (!window.confirm(`Take "${song.title}" off this record?`)) return;
                    void run(() => removeRecordSong(record.id, song.id), {
                      record_id: record.id,
                      action: 'song_removed',
                      songs: record.songs.length - 1,
                    });
                  }}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-content-tertiary">No songs yet. Add the first one, even with a working title.</p>
        )}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void addSong();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Song name</span>
            <input
              value={newSong}
              maxLength={120}
              placeholder="Add a song"
              onChange={(event) => setNewSong(event.target.value)}
              className={fieldClass}
            />
          </label>
          <button type="submit" disabled={busy || !newSong.trim()} className={secondaryButton}>
            Add
          </button>
        </form>
      </Card>

      <Card title="Sessions">
        {record.sessions.length ? (
          <ul className="divide-y divide-stroke-default">
            {record.sessions.map((session) =>
              draft?.id === session.id ? (
                <li key={session.id} className="py-2">
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
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError('');
                      setDraft(draftFrom(session));
                    }}
                    className="motion-focus flex w-full items-center gap-3 py-2.5 text-left"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-elevated text-xs font-semibold text-content-secondary">
                      {initials(session.people[0]?.name ?? '?')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-content-primary">
                        {sessionWhen(session)}
                        {session.people.length ? ` · ${session.people.map((p) => p.name).join(', ')}` : ''}
                      </p>
                      <p className="truncate text-xs text-content-secondary">
                        {[
                          session.people[0]?.role,
                          session.songIds.map(songTitle).filter(Boolean).join(', '),
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Tap to add who and which songs'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                        session.id === nextId
                          ? 'border-status-warning text-status-warning'
                          : 'border-stroke-default text-content-secondary'
                      }`}
                    >
                      {session.id === nextId
                        ? 'Next'
                        : session.status === 'planned' && session.date !== null && session.date < today
                          ? 'Did it happen?'
                          : SESSION_STATUS_LABELS[session.status]}
                    </span>
                  </button>
                </li>
              )
            )}
          </ul>
        ) : draft?.id === null ? null : (
          <p className="text-sm text-content-tertiary">No sessions yet. Add the next one, even if the day is not set.</p>
        )}
        {draft && draft.id === null ? (
          <div className="mt-3">
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
            onClick={() => {
              setFormError('');
              setDraft(emptyDraft());
            }}
            className={`${secondaryButton} mt-3 gap-1.5`}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add a session
          </button>
        )}
      </Card>

      {isRecordDone(record) ? (
        <p className="rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
          Every song is done. When you are ready, start its rollout from the artist page.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void drop()}
        disabled={busy}
        className="motion-focus min-h-11 text-sm text-content-tertiary underline underline-offset-4 hover:text-content-primary"
      >
        Drop this record
      </button>
    </div>
  );
}
