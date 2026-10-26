'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { saveArtistImport, type SavedImport } from '@/lib/artist-import/client';
import type { ImportArtistCandidate, ImportRelease } from '@/lib/artist-import/providers';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { Cover, formatFans, initials, kindLabel } from './ImportParts';

type Phase = 'search' | 'pulling' | 'done';
type Lookup = { ok: boolean; body: { releases?: ImportRelease[]; error?: string } };

const DIALOG_Z = 'z-[220]';
const REVEAL_MS = 220;
const MAX_REVEAL_MS = 2600;
const MAX_COVERS_SHOWN = 12;

const primaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full bg-content-primary px-5 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
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
    return { ok: false, body: { error: 'Could not bring in the releases.' } };
  }
}

/**
 * Import releases for an account that already exists (2026-10-26, founder
 * approved the mock). Same flow as the onboarding step, but it saves at once:
 * pick the profile, watch the covers arrive, and the server writes the artist
 * and their catalogue. An artist already on the roster by that name gets the
 * releases added to them, never a second copy.
 */
export function ImportReleasesDialog({
  initialQuery = '',
  from,
  onClose,
}: {
  initialQuery?: string;
  from: 'artists' | 'artist';
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('search');
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<ImportArtistCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<ImportArtistCandidate | null>(null);
  const [releases, setReleases] = useState<ImportRelease[]>([]);
  const [shown, setShown] = useState(0);
  const [result, setResult] = useState<SavedImport | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const searchSeq = useRef(0);
  const loadRoster = useArtistRosterStore((state) => state.load);

  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    captureAnalyticsEvent({ name: 'artist_import_opened', properties: { from } });
  }, [from]);
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
        const payload = (await response.json().catch(() => ({}))) as {
          artists?: ImportArtistCandidate[];
          error?: string;
        };
        if (seq !== searchSeq.current) return;
        if (!response.ok) {
          setError(payload.error || 'Could not search right now.');
          setCandidates([]);
        } else {
          setError('');
          setCandidates(payload.artists ?? []);
        }
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

  // The covers appear one by one. Capped, so a long catalogue never drags.
  useEffect(() => {
    if (phase !== 'pulling' || releases.length === 0) return;
    const step = Math.max(40, Math.min(REVEAL_MS, Math.floor(MAX_REVEAL_MS / releases.length)));
    const timer = window.setInterval(() => {
      setShown((current) => {
        if (current + 1 >= releases.length) window.clearInterval(timer);
        return Math.min(releases.length, current + 1);
      });
    }, step);
    return () => window.clearInterval(timer);
  }, [phase, releases]);

  const finishedReveal = releases.length > 0 ? shown >= releases.length : result !== null;
  useEffect(() => {
    if (phase === 'pulling' && result?.ok && finishedReveal) {
      const timer = window.setTimeout(() => setPhase('done'), 600);
      return () => window.clearTimeout(timer);
    }
  }, [phase, result, finishedReveal]);

  const pick = async (candidate: ImportArtistCandidate) => {
    setError('');
    setPicked(candidate);
    setReleases([]);
    setShown(0);
    setResult(null);
    setPhase('pulling');
    // The covers come from the public lookup so they can arrive on screen; the
    // save is separate and pulls the releases again on the server.
    const [lookup, saved] = await Promise.all([
      lookupReleases(candidate),
      saveArtistImport({ provider: candidate.provider, id: candidate.id, name: candidate.name }),
    ]);
    if (!saved.ok) {
      setError(saved.message);
      setPhase('search');
      return;
    }
    setReleases(lookup.ok ? (lookup.body.releases ?? []) : []);
    setResult(saved);
    setSavedCount((current) => current + 1);
    void loadRoster({ force: true });
    captureAnalyticsEvent({
      name: 'artist_import_saved',
      properties: { provider: candidate.provider, added: saved.added, created_artist: saved.createdArtist },
    });
  };

  const addAnother = () => {
    setPhase('search');
    setQuery('');
    setCandidates(null);
    setPicked(null);
    setReleases([]);
    setShown(0);
    setResult(null);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-x-0 top-0 ${DIALOG_Z} flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-releases-title"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-stroke-default bg-bg-elevated p-5 shadow-xl sm:p-6"
      >
        {phase === 'search' ? (
          <>
            <h2 id="import-releases-title" className="font-display text-xl font-semibold text-content-primary">
              Import past rollouts
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-content-secondary">
              Type an artist name. We find their profile and bring in what they have put out.
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
              className="mt-4 block w-full rounded-xl border border-stroke-control bg-bg-elevated px-3 py-2.5 text-base text-content-primary placeholder:text-content-tertiary outline-none transition-colors duration-fast ease-standard focus:border-brand"
            />
            <div className="mt-3 space-y-2" aria-live="polite">
              {searching && !candidates ? <p className="text-sm text-content-tertiary">Searching…</p> : null}
              {candidates && candidates.length === 0 && !searching && !error ? (
                <p className="text-sm text-content-secondary">
                  No profile found for that name. Check the spelling and try again.
                </p>
              ) : null}
              {candidates?.map((candidate) => (
                <button
                  key={`${candidate.provider}-${candidate.id}`}
                  type="button"
                  onClick={() => void pick(candidate)}
                  className="motion-press flex w-full items-center gap-3 rounded-xl border border-stroke-default bg-bg-surface px-3 py-2.5 text-left transition-colors duration-fast ease-standard hover:border-stroke-strong hover:bg-bg-hover"
                >
                  {candidate.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote photo, never optimised or stored
                    <img src={candidate.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-full bg-bg-elevated object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-sm font-semibold text-content-secondary">
                      {initials(candidate.name)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-content-primary">{candidate.name}</span>
                    <span className="block truncate text-xs text-content-secondary">
                      {[formatFans(candidate.followers), candidate.genre].filter(Boolean).join(' · ') || 'Artist profile'}
                    </span>
                  </span>
                </button>
              ))}
              {error ? (
                <p role="alert" className="text-sm text-status-error">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className={secondaryButton}>
                {savedCount > 0 ? 'Done' : 'Cancel'}
              </button>
            </div>
          </>
        ) : null}

        {phase === 'pulling' ? (
          <>
            <h2 id="import-releases-title" className="font-display text-xl font-semibold text-content-primary">
              Bringing in {picked?.name ?? 'the artist'}
            </h2>
            <p className="mt-1.5 text-sm text-content-secondary" aria-live="polite">
              {releases.length === 0 && !result
                ? 'Looking for their releases…'
                : `Found ${shown} ${shown === 1 ? 'release' : 'releases'}${finishedReveal ? '' : '…'}`}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {releases.slice(0, Math.min(shown, MAX_COVERS_SHOWN)).map((release) => (
                <div key={`${release.provider}-${release.sourceId}`} className="min-w-0">
                  <Cover release={release} />
                  <p className="mt-1.5 truncate text-xs font-semibold text-content-primary">{release.title}</p>
                  <p className="truncate text-xs text-content-secondary">
                    {kindLabel(release.kind)}
                    {release.releaseDate ? `, ${release.releaseDate.slice(0, 4)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {phase === 'done' && result?.ok ? (
          <>
            <h2 id="import-releases-title" className="font-display text-xl font-semibold text-content-primary">
              {result.artistName} is in
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-content-secondary">
              {result.added > 0
                ? `${result.added} ${result.added === 1 ? 'release' : 'releases'} added to the catalogue.`
                : result.total > 0
                  ? 'Their catalogue was already up to date.'
                  : 'No releases came up for them.'}{' '}
              {result.createdArtist ? 'They are on your roster now.' : 'Already on your roster, so no duplicate artist.'}
            </p>
            <div className="mt-4 grid grid-cols-8 gap-1.5" aria-hidden="true">
              {releases.slice(0, 16).map((release) => (
                <div key={`${release.provider}-${release.sourceId}`} className="min-w-0">
                  <Cover release={release} />
                </div>
              ))}
            </div>
            <h3 className="mt-5 text-base font-semibold text-content-primary">Add another artist?</h3>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={addAnother} className={secondaryButton}>
                Add another artist
              </button>
              <button type="button" onClick={onClose} className={primaryButton}>
                Done
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/** The button that opens the dialog; owns its open state so any page can drop it in. */
export function ImportReleasesButton({
  from,
  initialQuery,
  className,
  children,
}: {
  from: 'artists' | 'artist';
  initialQuery?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open ? <ImportReleasesDialog from={from} initialQuery={initialQuery} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
