'use client';

import { useEffect, useRef, useState } from 'react';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import {
  describeCadence,
  type ImportArtistCandidate,
  type ImportRelease,
} from '@/lib/artist-import/providers';
import {
  addPendingImport,
  readPendingImports,
  writePendingImports,
  type PendingArtistImport,
} from '@/lib/artist-import/pending';

type Phase = 'search' | 'pulling' | 'added' | 'nudge';

const REVEAL_MS = 220;
const MAX_REVEAL_MS = 2600;
/** Covers drawn on screen; the count still runs to the full catalogue. */
const MAX_COVERS_SHOWN = 12;

const primaryButton =
  'motion-press inline-flex min-h-12 items-center justify-center rounded-full bg-content-primary px-6 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'motion-press inline-flex min-h-12 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-6 text-sm font-medium text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50';

function formatFans(value: number | null): string {
  if (value === null) return '';
  if (value >= 1_000_000) return `${(Math.round(value / 100_000) / 10).toString()}M fans`;
  if (value >= 1000) return `${(Math.round(value / 100) / 10).toString()}K fans`;
  return `${value} fans`;
}

function kindLabel(kind: ImportRelease['kind']): string {
  return kind === 'ep' ? 'EP' : kind === 'album' ? 'Album' : 'Single';
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

function Cover({ release }: { release: ImportRelease }) {
  const [failed, setFailed] = useState(false);
  if (release.coverUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote covers, never optimised or stored
      <img
        src={release.coverUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="aspect-square w-full rounded-lg bg-bg-surface object-cover"
      />
    );
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-bg-surface text-lg font-semibold text-content-secondary">
      {release.title.charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * "Who is the artist?" (2026-10-26). Type a name, pick the profile, watch the
 * releases arrive, then "Add another artist?". Runs BEFORE the account exists:
 * it only reads public catalogues, and the picked artists wait in
 * localStorage until the hand-off saves them (lib/artist-import/pending.ts).
 *
 * This step owns its own buttons (the wizard's footer is hidden for it), and
 * every path out of it is skippable.
 */
export function OnboardingArtistImportStep({
  canPlanNext,
  onBack,
  onDone,
  onPlanNext,
}: {
  /** True for "Nothing planned yet": the last screen can turn into a rollout. */
  canPlanNext: boolean;
  onBack: () => void;
  onDone: () => void;
  /** Make the next release of this artist the rollout, then move on. */
  onPlanNext: (artistName: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('search');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<ImportArtistCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<ImportArtistCandidate | null>(null);
  const [releases, setReleases] = useState<ImportRelease[]>([]);
  const [shown, setShown] = useState(0);
  const [added, setAdded] = useState<PendingArtistImport[]>([]);
  const searchSeq = useRef(0);

  useEffect(() => {
    setAdded(readPendingImports());
    captureAnalyticsEvent({ name: 'onboarding_artist_import_viewed', properties: {} });
  }, []);

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

  const pick = async (candidate: ImportArtistCandidate) => {
    setError('');
    setPicked(candidate);
    setReleases([]);
    setShown(0);
    setPhase('pulling');
    captureAnalyticsEvent({
      name: 'onboarding_artist_picked',
      properties: { provider: candidate.provider },
    });
    try {
      const response = await fetch(
        `/api/artist-import/releases?provider=${candidate.provider}&id=${encodeURIComponent(candidate.id)}`
      );
      const payload = (await response.json().catch(() => ({}))) as { releases?: ImportRelease[]; error?: string };
      if (!response.ok) {
        setError(payload.error || 'Could not bring in the releases.');
        setPhase('search');
        return;
      }
      const found = payload.releases ?? [];
      setReleases(found);
      if (found.length === 0) setShown(0);
      const next = addPendingImport(readPendingImports(), {
        provider: candidate.provider,
        id: candidate.id,
        name: candidate.name,
        count: found.length,
      });
      writePendingImports(next);
      setAdded(next);
      captureAnalyticsEvent({
        name: 'onboarding_artist_imported',
        properties: { provider: candidate.provider, releases: found.length },
      });
    } catch {
      setError('Could not bring in the releases.');
      setPhase('search');
    }
  };

  const finished = releases.length > 0 ? shown >= releases.length : true;
  const cadence = picked ? describeCadence(releases) : null;
  const nudgeLine = cadence
    ? `${picked?.name ?? 'This artist'} last released ${cadence.latestTitle} ${
        cadence.monthsSince <= 0 ? 'this month' : cadence.monthsSince === 1 ? '1 month ago' : `${cadence.monthsSince} months ago`
      }.`
    : null;

  const addAnother = () => {
    setPhase('search');
    setQuery('');
    setCandidates(null);
    setPicked(null);
    setReleases([]);
    setShown(0);
  };

  const endOfImports = () => {
    // The nudge is only for someone with no rollout planned, and only when the
    // dates say something. Anyone else just moves on.
    if (canPlanNext && nudgeLine) setPhase('nudge');
    else onDone();
  };

  if (phase === 'search') {
    return (
      <div className="mt-5">
        <p className="text-sm leading-relaxed text-content-secondary">
          {added.length > 0
            ? 'Type another name. We find their profile and bring in their releases.'
            : 'Type a name. We find their profile and bring in their releases.'}
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
              No profile found for that name. Check the spelling, or skip this and add the artist later.
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
        {added.length > 0 ? (
          <p className="mt-4 text-sm text-content-secondary">
            Added so far: {added.map((item) => item.name).join(', ')}.
          </p>
        ) : null}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onBack} className={secondaryButton}>
            Back
          </button>
          {added.length > 0 ? (
            <button type="button" onClick={endOfImports} className={primaryButton}>
              That is everyone
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                captureAnalyticsEvent({ name: 'onboarding_artist_import_skipped', properties: {} });
                onDone();
              }}
              className={secondaryButton}
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'pulling') {
    return (
      <div className="mt-5">
        <p className="text-sm text-content-secondary" aria-live="polite">
          {releases.length === 0 && !error
            ? `Bringing in ${picked?.name ?? 'the artist'}…`
            : `Found ${shown} ${shown === 1 ? 'release' : 'releases'}${finished ? '' : '…'}`}
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
        {releases.length > MAX_COVERS_SHOWN && shown >= MAX_COVERS_SHOWN ? (
          <p className="mt-3 text-sm text-content-secondary">
            and {releases.length - MAX_COVERS_SHOWN} more.
          </p>
        ) : null}
        {releases.length === 0 && finished && !error && picked ? (
          <p className="mt-4 text-sm text-content-secondary">
            No releases came up for {picked.name}. The artist is still added, and you can plan their next one.
          </p>
        ) : null}
        <div className="mt-7 flex justify-end">
          <button
            type="button"
            onClick={() => setPhase('added')}
            disabled={releases.length > 0 && !finished}
            className={primaryButton}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'added') {
    const total = added.reduce((sum, item) => sum + item.count, 0);
    return (
      <div className="mt-5">
        <p className="text-base font-semibold text-content-primary">
          {picked?.name ?? 'The artist'} is in
        </p>
        <p className="mt-1 text-sm text-content-secondary">
          {total === 0
            ? 'No releases yet. You can edit anything later.'
            : `${total} ${total === 1 ? 'release' : 'releases'} will be in your catalogue once your account is ready. You can edit any of them later.`}
        </p>
        <div className="mt-4 grid grid-cols-8 gap-1.5" aria-hidden="true">
          {releases.slice(0, 16).map((release) => (
            <div key={`${release.provider}-${release.sourceId}`} className="min-w-0">
              <Cover release={release} />
            </div>
          ))}
        </div>
        <h3 className="mt-6 text-lg font-semibold text-content-primary">Add another artist?</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={addAnother} className={secondaryButton}>
            Add another artist
          </button>
          <button type="button" onClick={endOfImports} className={primaryButton}>
            That is everyone
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <p className="text-sm text-content-secondary">{nudgeLine}</p>
      <div className="mt-4 rounded-xl bg-bg-surface px-4 py-3.5">
        <p className="text-sm font-semibold text-content-primary">
          {cadence?.usualGapMonths
            ? `Their releases usually land every ${cadence.usualGapMonths} ${cadence.usualGapMonths === 1 ? 'month' : 'months'}.`
            : 'Plan what comes next.'}
        </p>
        <p className="mt-1 text-sm text-content-secondary">
          Plan the next one now so the team knows what to do and when.
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            captureAnalyticsEvent({ name: 'onboarding_artist_plan_next', properties: {} });
            onPlanNext(picked?.name ?? added[added.length - 1]?.name ?? '');
          }}
          className={primaryButton}
        >
          Plan the next release
        </button>
        <button type="button" onClick={onDone} className={secondaryButton}>
          Not now
        </button>
      </div>
    </div>
  );
}
