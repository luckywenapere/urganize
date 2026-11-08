'use client';

import { useState } from 'react';
import type { TrmSongView, TrmTrackRow } from '@/lib/trm/release';
import { List, MONO, PRIMARY, QUIET_LINK, Row, SectionLabel, Tick, Todo } from './TrmParts';
import { TrmShell } from './TrmSendSheet';
import type { TrmPost } from './useTrm';

// The songs on a rollout (#1115, mocks "eps-and-albums" 1 and 2). The list
// sits above everything else once a rollout has 2 or more songs (or was
// planned as an EP or album); tapping a song opens its sheet. The count sets
// single / EP / album, so nobody picks a type.

const FIELD =
  'h-[46px] w-full border border-stroke-control bg-transparent px-3.5 text-[15px] text-content-primary placeholder:text-content-tertiary focus:border-content-secondary focus:outline-none';

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'songwriter', label: 'Writer' },
  { value: 'producer', label: 'Producer' },
  { value: 'composer', label: 'Composer' },
  { value: 'lyricist', label: 'Lyricist' },
  { value: 'vocalist', label: 'Vocalist' },
  { value: 'musician', label: 'Musician' },
  { value: 'mixing_engineer', label: 'Mixing engineer' },
  { value: 'mastering_engineer', label: 'Mastering engineer' },
];

/** "Add a song" on a rollout that is still a plain single. */
export function AddSongRow({ onAdd, busy }: { onAdd: () => void; busy: boolean }) {
  return (
    <Row
      mark={<Tick />}
      title="Songs"
      detail="1 song · add more to make it an EP"
      right={
        <button type="button" disabled={busy} onClick={onAdd} className={QUIET_LINK}>
          Add a song
        </button>
      }
    />
  );
}

export function SongsSection({
  songs,
  locked,
  busy,
  onOpen,
  onAdd,
  onReorder,
}: {
  songs: TrmSongView[];
  /** With TRM or out: the songs can't change. */
  locked: boolean;
  busy: boolean;
  onOpen: (trackId: string | null) => void;
  onAdd: () => void;
  onReorder: (ids: string[]) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const ids = songs.map((s) => s.id).filter((id): id is string => Boolean(id));
  const canDrag = !locked && ids.length === songs.length && songs.length > 1;
  const drop = (target: string) => {
    if (!dragging || dragging === target) return;
    const next = ids.filter((id) => id !== dragging);
    next.splice(next.indexOf(target) + (ids.indexOf(dragging) < ids.indexOf(target) ? 1 : 0), 0, dragging);
    setDragging(null);
    onReorder(next);
  };
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <SectionLabel>Songs</SectionLabel>
        {canDrag ? <span className={`hidden sm:inline ${MONO} text-content-tertiary`}>Drag to reorder</span> : null}
      </div>
      <List>
        {songs.map((song) => (
            <Row
              key={song.id ?? 'rollout'}
              itemProps={{
                draggable: canDrag,
                onDragStart: () => song.id && setDragging(song.id),
                onDragOver: (e) => canDrag && e.preventDefault(),
                onDrop: () => song.id && drop(song.id),
                onDragEnd: () => setDragging(null),
                style: dragging === song.id ? { opacity: 0.5 } : undefined,
              }}
              mark={song.problem ? <Todo /> : <Tick />}
              title={
                <span>
                  <span className="mr-2 font-mono text-[12px] text-content-tertiary">{song.sequence}</span>
                  {song.title || `Song ${song.sequence}`}
                  {song.featuredArtists ? <span className="font-normal text-content-secondary"> feat. {song.featuredArtists}</span> : null}
                </span>
              }
              detail={song.problem ? <span className="text-status-error">{song.problem}</span> : song.detail}
              right={
                locked || !song.id ? null : (
                  <button type="button" onClick={() => onOpen(song.id)} className={QUIET_LINK}>
                    {song.problem ? 'Fix' : 'Edit'}
                  </button>
                )
              }
            />
        ))}
        {locked ? null : (
          <li className="border-b border-stroke-default last:border-b-0">
          <button
            type="button"
            disabled={busy}
            onClick={onAdd}
            className="motion-focus flex min-h-[48px] w-full items-center gap-2 px-4 text-left text-[14.5px] font-semibold text-brand hover:bg-bg-hover disabled:opacity-50"
          >
            + Add a song
          </button>
          </li>
        )}
      </List>
    </section>
  );
}

type Credit = { name: string; roles: string[]; masterSplit: number | null };

export function SongSheet({
  track,
  sequence,
  count,
  rolloutCredits,
  post,
  onClose,
  onSaved,
  onMove,
}: {
  track: TrmTrackRow;
  sequence: number;
  count: number;
  /** What the rollout's credits say, e.g. "2 writers · 1 producer · 100% to Ada". */
  rolloutCredits: string;
  post: TrmPost;
  onClose: () => void;
  onSaved: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [featured, setFeatured] = useState(track.featuredArtists ?? '');
  const [explicit, setExplicit] = useState<boolean | null>(track.explicit);
  const [isrc, setIsrc] = useState(track.isrc ?? '');
  const [lyrics, setLyrics] = useState(track.lyrics ?? '');
  const [mode, setMode] = useState<'rollout' | 'own'>(track.creditsMode);
  const [credits, setCredits] = useState<Credit[]>(
    track.credits.length ? track.credits.map((c) => ({ name: c.name, roles: [...c.roles], masterSplit: c.masterSplit })) : [{ name: '', roles: ['songwriter'], masterSplit: null }]
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError('');
    const result = await post('track_save', {
      trackId: track.id,
      title,
      featuredArtists: featured,
      explicit,
      isrc,
      lyrics,
      creditsMode: mode,
      ...(mode === 'own' ? { credits } : {}),
    });
    setSaving(false);
    if (!result.ok) return setError(String(result.data.error || 'Could not save the song.'));
    onSaved();
    onClose();
  };
  const remove = async () => {
    setSaving(true);
    const result = await post('track_remove', { trackId: track.id });
    setSaving(false);
    if (!result.ok) return setError(String(result.data.error || 'Could not remove the song.'));
    onSaved();
    onClose();
  };
  const setCredit = (index: number, patch: Partial<Credit>) => setCredits((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const segment = (on: boolean) =>
    `motion-focus flex-1 py-2 text-[14px] ${on ? 'bg-bg-elevated font-semibold text-content-primary shadow-sm' : 'text-content-secondary'}`;

  return (
    <TrmShell label={`Song ${sequence}`} onClose={onClose} locked={false}>
      <div className="flex items-baseline justify-between pr-8">
        <h3 className="font-display text-[26px] leading-tight tracking-[-0.02em] text-content-primary">Song {sequence}</h3>
      </div>
      <div className="mt-5 space-y-4">
        <label className="block">
          <span className={`mb-1.5 block ${MONO}`}>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
        </label>
        <label className="block">
          <span className={`mb-1.5 block ${MONO}`}>Featured artists</span>
          <input value={featured} onChange={(e) => setFeatured(e.target.value)} placeholder="Optional, e.g. Kemi, Tobi" className={FIELD} />
        </label>
        <div>
          <span className={`mb-1.5 block ${MONO}`}>Explicit lyrics?</span>
          <div className="flex gap-1 bg-bg-hover p-1" role="radiogroup" aria-label="Explicit lyrics">
            <button type="button" role="radio" aria-checked={explicit === true} onClick={() => setExplicit(true)} className={segment(explicit === true)}>
              Yes
            </button>
            <button type="button" role="radio" aria-checked={explicit === false} onClick={() => setExplicit(false)} className={segment(explicit === false)}>
              No
            </button>
          </div>
        </div>
        <label className="block">
          <span className={`mb-1.5 block ${MONO}`}>ISRC</span>
          <input value={isrc} onChange={(e) => setIsrc(e.target.value)} placeholder="Leave empty and TRM gives one" className={FIELD} />
        </label>
        <div>
          <span className={`mb-1.5 block ${MONO}`}>Credits</span>
          <div className="flex gap-1 bg-bg-hover p-1" role="radiogroup" aria-label="Credits">
            <button type="button" role="radio" aria-checked={mode === 'rollout'} onClick={() => setMode('rollout')} className={segment(mode === 'rollout')}>
              Same as the rollout
            </button>
            <button type="button" role="radio" aria-checked={mode === 'own'} onClick={() => setMode('own')} className={segment(mode === 'own')}>
              Its own
            </button>
          </div>
          {mode === 'rollout' ? (
            <p className="mt-1.5 font-mono text-[11px] text-content-secondary">{rolloutCredits}</p>
          ) : (
            <div className="mt-2 space-y-2">
              {credits.map((credit, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={credit.name}
                    onChange={(e) => setCredit(i, { name: e.target.value })}
                    placeholder="Name"
                    aria-label="Name"
                    className={`${FIELD} min-w-0 flex-[2]`}
                  />
                  <select
                    value={credit.roles[0] ?? 'songwriter'}
                    onChange={(e) => setCredit(i, { roles: [e.target.value] })}
                    aria-label="Role"
                    className={`${FIELD} min-w-0 flex-[1.4] bg-bg-elevated px-2`}
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={credit.masterSplit ?? ''}
                    onChange={(e) => setCredit(i, { masterSplit: e.target.value === '' ? null : Number(e.target.value) })}
                    inputMode="decimal"
                    placeholder="%"
                    aria-label="Master split, percent"
                    className={`${FIELD} w-16 flex-none px-2 text-right`}
                  />
                  <button
                    type="button"
                    aria-label="Remove this credit"
                    onClick={() => setCredits((list) => list.filter((_, j) => j !== i))}
                    className="motion-focus px-1 text-content-tertiary hover:text-status-error"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCredits((list) => [...list, { name: '', roles: ['producer'], masterSplit: null }])}
                className={QUIET_LINK}
              >
                + Add a person
              </button>
              <p className="font-mono text-[11px] text-content-tertiary">Needs a writer and a producer. Splits empty = 100% to the artist.</p>
            </div>
          )}
        </div>
        <label className="block">
          <span className={`mb-1.5 block ${MONO}`}>Lyrics</span>
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Optional"
            rows={3}
            className="w-full border border-stroke-control bg-transparent px-3.5 py-2.5 text-[15px] text-content-primary placeholder:text-content-tertiary focus:border-content-secondary focus:outline-none"
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      <button type="button" disabled={saving} onClick={() => void save()} className={`mt-5 ${PRIMARY} sm:w-full`}>
        Save song
      </button>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex gap-3">
          <button type="button" disabled={saving || sequence === 1} onClick={() => onMove(-1)} className={`${QUIET_LINK} disabled:opacity-40`}>
            Move up
          </button>
          <button type="button" disabled={saving || sequence === count} onClick={() => onMove(1)} className={`${QUIET_LINK} disabled:opacity-40`}>
            Move down
          </button>
        </div>
        <button type="button" disabled={saving} onClick={() => void remove()} className="motion-focus text-[13px] font-semibold text-status-error hover:underline">
          Remove song
        </button>
      </div>
      {count === 2 ? <p className="mt-3 font-mono text-[11px] text-content-tertiary">Removing it makes this a single again.</p> : null}
    </TrmShell>
  );
}
