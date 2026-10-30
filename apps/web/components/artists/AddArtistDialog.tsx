'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Loader2 } from '@/components/icons';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { saveArtistImport } from '@/lib/artist-import/client';
import { describeImportedMusic } from '@/lib/artist-import/summary';
import { artistHref } from '@/lib/artist-page';
import { findRosterMatches } from '@/lib/artist-merge';
import type { ImportArtistCandidate, ImportRelease } from '@/lib/artist-import/providers';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { useArtistRosterStore, type RosterArtist } from '@/stores/useArtistRosterStore';
import { useShellStore } from '@/stores/useShellStore';
import { ProfileFace } from '@/components/shared/ProfileFace';
import { Cover, formatFans, initials } from './ImportParts';

type Phase = 'search' | 'check';
type Lookup = { ok: boolean; body: { releases?: ImportRelease[]; error?: string } };

const DIALOG_Z = 'z-[220]';
const COVERS_IN_STRIP = 4;

const primaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-5 text-sm font-medium text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary';

async function lookupReleases(candidate: ImportArtistCandidate): Promise<Lookup> {
  try {
    const response = await fetch(
      `/api/artist-import/releases?provider=${candidate.provider}&id=${encodeURIComponent(candidate.id)}`
    );
    const body = (await response.json().catch(() => ({}))) as Lookup['body'];
    return { ok: response.ok, body };
  } catch {
    return { ok: false, body: { error: 'Could not reach the music service.' } };
  }
}

/** Adds an artist by name only, for someone not on streaming yet. */
async function addByName(name: string): Promise<{ id: string } | { error: string }> {
  try {
    const token = await getAccessToken();
    const response = await fetch('/api/workspace/artists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    const payload = (await response.json().catch(() => ({}))) as { artist?: { id?: string }; error?: string };
    if (!response.ok || !payload.artist?.id) return { error: payload.error || 'Could not add the artist.' };
    return { id: payload.artist.id };
  } catch {
    return { error: 'Could not add the artist.' };
  }
}

/**
 * Adding an artist starts with a search (2026-10-30, #882, founder approved
 * mock docs/mocks/catalogue-import). Pick the profile, look at what comes with
 * it, then one tap adds the artist with their photo and the music they put out
 * before Urganize. A one-time bring-in (#890): new songs come through
 * rollouts, never pulled in later. Opened with `artistId`, the same steps bring
 * older songs onto an artist already on the roster.
 */
export function AddArtistDialog({
  initialQuery = '',
  artistId = null,
  artistName = null,
  onClose,
}: {
  initialQuery?: string;
  /** A roster artist to link the profile to, instead of adding a new one. */
  artistId?: string | null;
  artistName?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const linking = Boolean(artistId);
  const [phase, setPhase] = useState<Phase>('search');
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<ImportArtistCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<ImportArtistCandidate | null>(null);
  const [onto, setOnto] = useState<RosterArtist | null>(null);
  const [releases, setReleases] = useState<ImportRelease[] | null>(null);
  const [saving, setSaving] = useState(false);
  // A profile that looks like someone already on the roster ("Babyboy Dorian"
  // and "Dorian", #865) waits here for the answer.
  const [asking, setAsking] = useState<{ candidate: ImportArtistCandidate; matches: RosterArtist[] } | null>(null);
  const searchSeq = useRef(0);
  const roster = useArtistRosterStore((state) => state.artists);
  const loadRoster = useArtistRosterStore((state) => state.load);

  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);
  useEffect(() => {
    captureAnalyticsEvent({ name: 'artist_import_opened', properties: { from: linking ? 'artist' : 'artists' } });
  }, [linking]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Search as they type, after a short pause. The latest request wins.
  useEffect(() => {
    if (phase !== 'search') return;
    const q = query.trim();
    if (q.length < 2) {
      setCandidates(null);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/artist-import/search?q=${encodeURIComponent(q)}`);
        const payload = (await response.json().catch(() => ({}))) as { artists?: ImportArtistCandidate[]; error?: string };
        if (seq !== searchSeq.current) return;
        setError(response.ok ? '' : payload.error || 'Could not search right now.');
        setCandidates(response.ok ? payload.artists ?? [] : []);
      } catch {
        if (seq === searchSeq.current) {
          setError('Could not search right now.');
          setCandidates([]);
        }
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, phase]);

  const check = (candidate: ImportArtistCandidate, ontoArtist: RosterArtist | null) => {
    setAsking(null);
    setError('');
    setPicked(candidate);
    setOnto(ontoArtist);
    setReleases(null);
    setPhase('check');
    void lookupReleases(candidate).then((lookup) => setReleases(lookup.ok ? lookup.body.releases ?? [] : []));
  };

  const choose = (candidate: ImportArtistCandidate) => {
    if (linking) {
      check(candidate, null);
      return;
    }
    const matches = findRosterMatches(candidate.name, roster);
    if (matches.length === 0) {
      check(candidate, null);
      return;
    }
    setAsking({ candidate, matches });
    captureAnalyticsEvent({ name: 'artist_import_match_asked', properties: { matches: matches.length } });
  };

  const add = async () => {
    if (!picked) return;
    setSaving(true);
    setError('');
    const targetId = artistId ?? onto?.id;
    const saved = await saveArtistImport({
      provider: picked.provider,
      id: picked.id,
      name: picked.name,
      artistId: targetId ?? undefined,
    });
    if (!saved.ok) {
      setSaving(false);
      setError(saved.message);
      return;
    }
    captureAnalyticsEvent({
      name: 'artist_import_saved',
      properties: {
        provider: picked.provider,
        added: saved.added,
        created_artist: saved.createdArtist,
        onto_match: Boolean(onto),
      },
    });
    await loadRoster({ force: true });
    onClose();
    if (!linking && saved.artistId) router.push(artistHref(saved.artistId));
  };

  const addNameOnly = async () => {
    const name = query.trim();
    if (!name) return;
    setSaving(true);
    setError('');
    const result = await addByName(name);
    if ('error' in result) {
      setSaving(false);
      setError(result.error);
      return;
    }
    captureAnalyticsEvent({ name: 'artist_added_by_name', properties: {} });
    await loadRoster({ force: true });
    onClose();
    router.push(artistHref(result.id));
  };

  if (typeof document === 'undefined') return null;

  const summary = releases ? describeImportedMusic(releases) : null;
  // The button says what it brings: "Add Dorian and 14 releases" (#890).
  const count = releases && releases.length > 0 ? ` and ${releases.length} ${releases.length === 1 ? 'release' : 'releases'}` : '';
  const addLabel = linking
    ? releases && releases.length > 0
      ? `Bring in ${releases.length} ${releases.length === 1 ? 'release' : 'releases'}`
      : `Link to ${artistName ?? 'this artist'}`
    : onto
      ? `Add to ${onto.name}`
      : `Add ${picked?.name ?? 'artist'}${count}`;

  return createPortal(
    <div
      className={`fixed inset-x-0 top-0 ${DIALOG_Z} flex h-[100dvh] items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-artist-title"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-stroke-default bg-bg-elevated p-5 pb-7 shadow-xl sm:rounded-2xl sm:p-6"
      >
        {phase === 'search' ? (
          <>
            <h2 id="add-artist-title" className="font-display text-2xl text-content-primary">
              {linking ? `Bring in ${artistName ?? 'their'}’s older songs` : 'Add an artist'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-content-secondary">
              {linking
                ? 'Pick their profile to bring in what they released before Urganize.'
                : 'Find them on streaming to bring in what they released before Urganize.'}
            </p>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Artist name"
              aria-label="Artist name"
              autoComplete="off"
              autoFocus
              maxLength={80}
              className="mt-4 block w-full rounded-xl border border-stroke-control bg-bg-base px-3.5 py-2.5 text-base text-content-primary placeholder:text-content-tertiary outline-none transition-colors duration-fast ease-standard focus:border-brand"
            />
            <div className="mt-2 space-y-1" aria-live="polite">
              {searching && !candidates ? <p className="px-2 py-2 text-sm text-content-tertiary">Searching…</p> : null}
              {candidates && candidates.length === 0 && !searching && !error ? (
                <p className="px-2 py-2 text-sm text-content-secondary">No profile found for that name. Check the spelling.</p>
              ) : null}
              {candidates?.map((candidate) => {
                const open =
                  asking?.candidate.provider === candidate.provider && asking.candidate.id === candidate.id ? asking : null;
                return (
                  <div key={`${candidate.provider}-${candidate.id}`} className={`rounded-xl ${open ? 'bg-bg-hover' : ''}`}>
                    <button
                      type="button"
                      onClick={() => choose(candidate)}
                      aria-expanded={open ? true : undefined}
                      className="motion-press group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-fast ease-standard hover:bg-bg-hover"
                    >
                      {candidate.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote photo, shown only while choosing
                        <img src={candidate.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-full bg-bg-surface object-cover" />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-surface text-sm font-semibold text-content-secondary">
                          {initials(candidate.name)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-content-primary">{candidate.name}</span>
                        <span className="block truncate text-xs text-content-secondary">
                          {[candidate.genre, formatFans(candidate.followers)].filter(Boolean).join(' · ') || 'Artist profile'}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        Choose
                      </span>
                    </button>
                    {open ? (
                      <MatchQuestion
                        matches={open.matches}
                        onNew={() => check(candidate, null)}
                        onAdd={(artist) => check(candidate, artist)}
                      />
                    ) : null}
                  </div>
                );
              })}
              {error ? (
                <p role="alert" className="px-2 text-sm text-status-error">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stroke-subtle pt-4">
              {!linking && query.trim().length >= 2 ? (
                <p className="text-[13px] text-content-secondary">
                  Not on streaming yet?{' '}
                  <button
                    type="button"
                    onClick={() => void addNameOnly()}
                    disabled={saving}
                    className="motion-focus font-semibold text-brand hover:underline underline-offset-2 disabled:opacity-50"
                  >
                    Add &ldquo;{query.trim()}&rdquo; by name
                  </button>
                </p>
              ) : (
                <span />
              )}
              <button type="button" onClick={onClose} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </>
        ) : null}

        {phase === 'check' && picked ? (
          <>
            <div className="flex items-center gap-4">
              {picked.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote photo; the save copies it into our storage
                <img src={picked.imageUrl} alt="" className="h-[72px] w-[72px] shrink-0 rounded-full bg-bg-surface object-cover" />
              ) : (
                <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-bg-surface text-xl font-semibold text-content-secondary">
                  {initials(picked.name)}
                </span>
              )}
              <div className="min-w-0">
                <h2 id="add-artist-title" className="truncate font-display text-2xl text-content-primary">
                  {picked.name}
                </h2>
                <p className="truncate text-sm text-content-secondary">
                  {[picked.genre, formatFans(picked.followers)].filter(Boolean).join(' · ') ||
                    (picked.provider === 'deezer' ? 'On Deezer' : 'On Apple Music')}
                </p>
              </div>
            </div>

            {releases === null ? (
              <div className="mt-4 space-y-3" aria-busy="true">
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map((key) => (
                    <span key={key} className="h-16 w-16 animate-pulse rounded-md bg-bg-hover" />
                  ))}
                </div>
                <p className="text-sm text-content-tertiary">Looking for their releases…</p>
              </div>
            ) : (
              <>
                {releases.length > 0 ? (
                  <div className="mt-4 flex gap-2" aria-hidden="true">
                    {releases.slice(0, COVERS_IN_STRIP).map((release) => (
                      <div key={`${release.provider}-${release.sourceId}`} className="w-16 shrink-0">
                        <Cover release={release} />
                      </div>
                    ))}
                    {releases.length > COVERS_IN_STRIP ? (
                      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-bg-hover text-[13px] font-semibold text-content-secondary">
                        +{releases.length - COVERS_IN_STRIP}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-content-secondary">
                    No releases came up for them. You can still add them.
                  </p>
                )}
                {summary && releases.length > 0 ? (
                  <dl className="mt-4 grid grid-cols-3 gap-2">
                    <Fact value={String(releases.length)} label={releases.length === 1 ? 'release' : 'releases'} />
                    <Fact value={summary.latest ?? 'Not dated'} label="latest" />
                    <Fact value={summary.first ?? 'Not dated'} label="first" />
                  </dl>
                ) : null}
              </>
            )}


            {error ? (
              <p role="alert" className="mt-3 text-sm text-status-error">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPhase('search');
                  setError('');
                }}
                disabled={saving}
                className={secondaryButton}
              >
                Back
              </button>
              <button type="button" onClick={() => void add()} disabled={saving || releases === null} className={primaryButton}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {addLabel}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-bg-hover px-3 py-2.5">
      <dt className="sr-only">{label}</dt>
      <dd className="text-[17px] font-semibold leading-6 tabular-nums text-content-primary">{value}</dd>
      <dd className="text-xs text-content-secondary">{label}</dd>
    </div>
  );
}

/**
 * The question under a picked profile that looks like a roster artist:
 * "Add these to Dorian?" (#865). One add button per match, so two look-alikes
 * on the roster are both offered.
 */
function MatchQuestion({
  matches,
  onNew,
  onAdd,
}: {
  matches: RosterArtist[];
  onNew: () => void;
  onAdd: (artist: RosterArtist) => void;
}) {
  const single = matches.length === 1 ? matches[0] : null;
  return (
    <div className="mx-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-stroke-subtle py-3">
      {single ? <ProfileFace name={single.name} photoUrl={single.photoUrl} size={28} /> : null}
      <p className="min-w-0 flex-1 text-sm text-content-primary">
        {single ? (
          <>
            Is this <span className="font-semibold">{single.name}</span>?
          </>
        ) : (
          'Is this one of your artists?'
        )}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onNew}
          className="motion-press inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-surface hover:text-content-primary"
        >
          New artist
        </button>
        {matches.map((artist) => (
          <button
            key={artist.id}
            type="button"
            onClick={() => onAdd(artist)}
            autoFocus={artist === matches[0]}
            className="motion-press inline-flex min-h-9 items-center rounded-full bg-brand px-3.5 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90"
          >
            Yes, {artist.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Mounted once by the shell; shows the dialog while the shell store has it open. */
export function AddArtistHost() {
  const request = useShellStore((state) => state.addArtist);
  const close = useShellStore((state) => state.closeAddArtist);
  if (!request) return null;
  return (
    <AddArtistDialog
      key={`${request.artistId ?? 'new'}-${request.query}`}
      initialQuery={request.query}
      artistId={request.artistId}
      artistName={request.artistName}
      onClose={close}
    />
  );
}
