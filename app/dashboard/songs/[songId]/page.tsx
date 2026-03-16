'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import {
  SONG_ROLE_OPTIONS,
  emptySongAdministrative,
  emptySongContributor,
  emptySongNotes,
  emptySongPublishing,
  emptySongProduction,
  normalizeSongAdministrative,
  normalizeSongContributor,
  normalizeSongContributors,
  normalizeSongFormInput,
  normalizeSongNotes,
  normalizeSongProduction,
  normalizeSongPublishing,
  toSongFormInput,
  validateSongContributor,
  validateSongFormInput,
  type SongAdministrative,
  type SongContributor,
  type SongFormInput,
  type SongNotes,
  type SongProduction,
  type SongPublishing,
  type SongRecord,
} from '@/lib/song-library';

type ReleaseOption = {
  id: string;
  label: string;
};

type SongDetailResponse = {
  detail?: {
    song: SongRecord;
    contributors: SongContributor[];
    publishing: SongPublishing;
    production: SongProduction;
    administrative: SongAdministrative;
    notes: SongNotes;
    linkedReleases?: Array<{
      id: string;
      title: string;
      label: string;
    }>;
  };
  releaseOptions?: ReleaseOption[];
  error?: string;
};

const SAVE_DEBOUNCE_MS = 650;

const getAccessToken = async (): Promise<string> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
};

function MetadataSection({
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-[28px] border border-stroke-default bg-bg-surface/95 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.25)]">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6"
      >
        <div>
          <p className="text-lg font-semibold text-content-primary">{title}</p>
          <p className="mt-1 text-sm text-content-secondary">{summary}</p>
        </div>
        <span className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs text-content-secondary">
          {isOpen ? 'Collapse' : 'Expand'}
        </span>
      </button>
      {isOpen ? <div className="border-t border-stroke-default px-5 py-5 sm:px-6">{children}</div> : null}
    </section>
  );
}

export default function SongMetadataPage() {
  const router = useRouter();
  const params = useParams<{ songId: string }>();
  const songId = Array.isArray(params?.songId) ? params.songId[0] : params?.songId;
  const { user, isLoading: authLoading } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [releaseOptions, setReleaseOptions] = useState<ReleaseOption[]>([]);
  const [song, setSong] = useState<SongRecord | null>(null);
  const [linkedReleases, setLinkedReleases] = useState<Array<{ id: string; title: string; label: string }>>([]);
  const [songForm, setSongForm] = useState<SongFormInput>(toSongFormInput(null));
  const [contributors, setContributors] = useState<SongContributor[]>([]);
  const [publishing, setPublishing] = useState<SongPublishing>(emptySongPublishing);
  const [production, setProduction] = useState<SongProduction>(emptySongProduction);
  const [administrative, setAdministrative] = useState<SongAdministrative>(emptySongAdministrative);
  const [notes, setNotes] = useState<SongNotes>(emptySongNotes);
  const [showContributorModal, setShowContributorModal] = useState(false);
  const [contributorDraft, setContributorDraft] = useState<SongContributor>(emptySongContributor());
  const [contributorError, setContributorError] = useState('');

  const didHydrateRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSong = useCallback(async () => {
    if (!songId) {
      setError('Song not found.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/songs/${songId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as SongDetailResponse;
      if (!response.ok || !payload.detail) {
        throw new Error(payload.error || 'Could not load song metadata.');
      }

      setSong(payload.detail.song);
      setLinkedReleases(payload.detail.linkedReleases || []);
      setSongForm(toSongFormInput(payload.detail.song));
      setContributors(payload.detail.contributors || []);
      setPublishing(payload.detail.publishing || emptySongPublishing);
      setProduction(payload.detail.production || emptySongProduction);
      setAdministrative(payload.detail.administrative || emptySongAdministrative);
      setNotes(payload.detail.notes || emptySongNotes);
      setReleaseOptions(payload.releaseOptions || []);
      didHydrateRef.current = true;
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load song metadata.');
    } finally {
      setIsLoading(false);
    }
  }, [songId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadSong();
  }, [authLoading, loadSong, router, user]);

  const saveSong = useCallback(async () => {
    if (!songId || !didHydrateRef.current) return;

    const normalizedSong = normalizeSongFormInput(songForm);
    const songValidationError = validateSongFormInput(normalizedSong);
    if (songValidationError) {
      setSaveState('error');
      setError(songValidationError);
      return;
    }

    const invalidContributor = normalizeSongContributors(contributors).find((item) => validateSongContributor(item));
    if (invalidContributor) {
      setSaveState('error');
      setError(validateSongContributor(invalidContributor));
      return;
    }

    setIsSaving(true);
    setSaveState('saving');
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/songs/${songId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          song: normalizedSong,
          contributors: normalizeSongContributors(contributors),
          publishing: normalizeSongPublishing(publishing),
          production: normalizeSongProduction(production),
          administrative: normalizeSongAdministrative(administrative),
          notes: normalizeSongNotes(notes),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not save song metadata.');
      }

      setSaveState('saved');
      setSong((current) =>
        current
          ? {
              ...current,
              songTitle: normalizedSong.songTitle,
              primaryArtist: normalizedSong.primaryArtist,
              projectOrRelease: normalizedSong.projectOrRelease,
              releaseId: normalizedSong.releaseId,
              featuredArtists: normalizedSong.featuredArtistsText
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
              isrc: normalizedSong.isrc,
              duration: normalizedSong.duration,
              genre: normalizedSong.genre,
              language: normalizedSong.language,
              updatedAt: new Date().toISOString(),
            }
          : current
      );
    } catch (saveError: any) {
      setSaveState('error');
      setError(saveError?.message || 'Could not save song metadata.');
    } finally {
      setIsSaving(false);
    }
  }, [administrative, contributors, notes, production, publishing, songForm, songId]);

  useEffect(() => {
    if (!didHydrateRef.current || isLoading) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void saveSong();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [administrative, contributors, isLoading, notes, production, publishing, saveSong, songForm]);

  const saveIndicator = useMemo(() => {
    if (saveState === 'saving' || isSaving) return 'Saving changes...';
    if (saveState === 'saved') return 'All changes saved';
    if (saveState === 'error') return 'Save issue';
    return 'Ready';
  }, [isSaving, saveState]);

  const addContributor = () => {
    const normalized = normalizeSongContributor(contributorDraft);
    const validationError = validateSongContributor(normalized);
    if (validationError) {
      setContributorError(validationError);
      return;
    }

    setContributors((current) => [
      ...current,
      {
        ...normalized,
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        songId: songId || '',
      },
    ]);
    setContributorDraft(emptySongContributor());
    setContributorError('');
    setShowContributorModal(false);
  };

  if (isLoading || authLoading) {
    return (
      <LoadingScreen
        variant="detail"
        eyebrow="Song Metadata"
        title="Loading your metadata sheet"
        description="Pulling together credits, publishing, production, and admin details for this song."
      />
    );
  }

  if (!user || !song) return null;

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1160px] px-4 pb-8 pt-20 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-4 border-b border-stroke-default pb-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <div className="text-sm text-content-secondary">
              <span className="font-medium text-content-primary">Dashboard</span>
              <span className="mx-2 text-content-tertiary">|</span>
              <span>Song Library</span>
            </div>
            <h1 className="mt-3 text-[clamp(2.2rem,5vw,3.8rem)] tracking-tight text-content-primary">
              {songForm.songTitle || 'Untitled song'}
            </h1>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-content-secondary">
              <span><span className="font-medium text-content-primary">Primary Artist:</span> {songForm.primaryArtist || 'Not set'}</span>
              <span><span className="font-medium text-content-primary">ISRC:</span> {songForm.isrc || 'Not set'}</span>
              <span><span className="font-medium text-content-primary">Duration:</span> {songForm.duration || 'Not set'}</span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <span className="rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-center text-sm text-content-secondary sm:py-2">
              {saveIndicator}
            </span>
            <Link
              href="/dashboard/songs"
              className="w-full rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
            >
              Back to library
            </Link>
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,360px)]">
          <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.25)] sm:p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Metadata Overview</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Song title</span>
                <input value={songForm.songTitle} onChange={(event) => setSongForm((current) => ({ ...current, songTitle: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Primary artist</span>
                <input value={songForm.primaryArtist} onChange={(event) => setSongForm((current) => ({ ...current, primaryArtist: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Featured artists</span>
                <input value={songForm.featuredArtistsText} onChange={(event) => setSongForm((current) => ({ ...current, featuredArtistsText: event.target.value }))} placeholder="Comma-separated" className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Associated release</span>
                <select value={songForm.releaseId} onChange={(event) => setSongForm((current) => ({ ...current, releaseId: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand">
                  <option value="">No linked release</option>
                  {releaseOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Project or release label</span>
                <input value={songForm.projectOrRelease} onChange={(event) => setSongForm((current) => ({ ...current, projectOrRelease: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">ISRC</span>
                <input value={songForm.isrc} onChange={(event) => setSongForm((current) => ({ ...current, isrc: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Duration</span>
                <input value={songForm.duration} onChange={(event) => setSongForm((current) => ({ ...current, duration: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Genre</span>
                <input value={songForm.genre} onChange={(event) => setSongForm((current) => ({ ...current, genre: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Language</span>
                <input value={songForm.language} onChange={(event) => setSongForm((current) => ({ ...current, language: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
              </label>
            </div>
          </div>

          <aside className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.25)] sm:p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Library Status</p>
            <div className="mt-4 space-y-3 text-sm text-content-secondary">
              <p><span className="font-medium text-content-primary">Contributors:</span> {contributors.length}</p>
              <p><span className="font-medium text-content-primary">Last updated:</span> {new Date(song.updatedAt).toLocaleString()}</p>
              <p><span className="font-medium text-content-primary">Linked release:</span> {songForm.projectOrRelease || 'Not linked'}</p>
            </div>
            {linkedReleases.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {linkedReleases.map((release) => (
                  <Link
                    key={release.id}
                    href={`/dashboard/plans/${release.id}`}
                    className="inline-flex rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover"
                  >
                    {release.title}
                  </Link>
                ))}
              </div>
            ) : null}
            <button type="button" onClick={() => { setContributorDraft(emptySongContributor()); setContributorError(''); setShowContributorModal(true); }} className="mt-5 w-full rounded-full bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover">
              Add Contributor
            </button>
          </aside>
        </section>

        <div className="mt-8 space-y-5">
          <MetadataSection title="Credits" summary="Keep every contributor, role, and credit line organized in one table.">
            {contributors.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-stroke-default bg-bg-elevated/70 px-5 py-8 text-sm text-content-secondary">
                No contributors added yet. Add the writers, artists, producers, and engineers involved in this song.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-stroke-default text-sm">
                  <thead className="bg-bg-elevated/80 text-left text-content-tertiary">
                    <tr>
                      <th className="px-4 py-3 font-medium">Contributor</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">PRO</th>
                      <th className="px-4 py-3 font-medium">IPI</th>
                      <th className="px-4 py-3 font-medium">Split %</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke-default bg-bg-surface/90">
                    {contributors.map((contributor) => (
                      <tr key={contributor.id}>
                        <td className="px-4 py-3 text-content-primary">
                          <div className="min-w-[220px] space-y-2">
                            <input value={contributor.legalName} onChange={(event) => setContributors((current) => current.map((item) => item.id === contributor.id ? { ...item, legalName: event.target.value } : item))} placeholder="Legal name" className="w-full rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2 outline-none focus:border-brand" />
                            <input value={contributor.creditedName} onChange={(event) => setContributors((current) => current.map((item) => item.id === contributor.id ? { ...item, creditedName: event.target.value } : item))} placeholder="Credited name" className="w-full rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2 outline-none focus:border-brand" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-content-secondary">
                          <select value={contributor.role} onChange={(event) => setContributors((current) => current.map((item) => item.id === contributor.id ? { ...item, role: event.target.value as SongContributor['role'] } : item))} className="min-w-[170px] rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2 outline-none focus:border-brand">
                            {SONG_ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-content-secondary"><input value={contributor.email} onChange={(event) => setContributors((current) => current.map((item) => item.id === contributor.id ? { ...item, email: event.target.value } : item))} placeholder="Email" className="min-w-[180px] rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2 outline-none focus:border-brand" /></td>
                        <td className="px-4 py-3 text-content-secondary"><input value={contributor.proAffiliation} onChange={(event) => setContributors((current) => current.map((item) => item.id === contributor.id ? { ...item, proAffiliation: event.target.value } : item))} placeholder="PRO" className="min-w-[130px] rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2 outline-none focus:border-brand" /></td>
                        <td className="px-4 py-3 text-content-secondary"><input value={contributor.ipiNumber} onChange={(event) => setContributors((current) => current.map((item) => item.id === contributor.id ? { ...item, ipiNumber: event.target.value } : item))} placeholder="IPI" className="min-w-[130px] rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2 outline-none focus:border-brand" /></td>
                        <td className="px-4 py-3 text-content-secondary"><input value={contributor.splitPercentage} onChange={(event) => setContributors((current) => current.map((item) => item.id === contributor.id ? { ...item, splitPercentage: event.target.value } : item))} placeholder="0" className="min-w-[90px] rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2 outline-none focus:border-brand" /></td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setContributors((current) => current.filter((item) => item.id !== contributor.id))} className="rounded-full border border-status-error/25 bg-status-error/10 px-3 py-2 text-xs font-semibold text-status-error hover:bg-status-error/15">
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </MetadataSection>

          <MetadataSection title="Publishing Details" summary="Capture songwriter, composer, publisher, and split information.">
            <div className="grid gap-4 sm:grid-cols-2">
              {([['Songwriter', 'songwriter'], ['Composer', 'composer'], ['Publisher', 'publisher'], ['PRO affiliation', 'proAffiliation'], ['IPI / CAE number', 'ipiNumber'], ['Ownership split', 'ownershipSplit']] as Array<[string, keyof SongPublishing]>).map(([label, key]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1.5 block text-content-secondary">{label}</span>
                  <input value={publishing[key]} onChange={(event) => setPublishing((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
                </label>
              ))}
            </div>
          </MetadataSection>

          <MetadataSection title="Production Details" summary="Keep the technical production details accessible for final delivery and credits.">
            <div className="grid gap-4 sm:grid-cols-2">
              {([['Producer', 'producer'], ['Mixing engineer', 'mixingEngineer'], ['Mastering engineer', 'masteringEngineer'], ['Recording studio', 'recordingStudio'], ['Recording date', 'recordingDate']] as Array<[string, keyof SongProduction]>).map(([label, key]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1.5 block text-content-secondary">{label}</span>
                  <input type={key === 'recordingDate' ? 'date' : 'text'} value={production[key]} onChange={(event) => setProduction((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
                </label>
              ))}
            </div>
          </MetadataSection>

          <MetadataSection title="Administrative Metadata" summary="Store the operational metadata that teams and distributors keep asking for.">
            <div className="grid gap-4 sm:grid-cols-2">
              {([['Copyright owner', 'copyrightOwner'], ['Label', 'label'], ['Distributor', 'distributor'], ['UPC', 'upc'], ['Territory restrictions', 'territoryRestrictions']] as Array<[string, keyof SongAdministrative]>).map(([label, key]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1.5 block text-content-secondary">{label}</span>
                  <input value={administrative[key]} onChange={(event) => setAdministrative((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
                </label>
              ))}
            </div>
          </MetadataSection>

          <MetadataSection title="Notes" summary="Keep internal notes and any extra metadata that should stay attached to the song.">
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Internal notes</span>
                <textarea value={notes.internalNotes} onChange={(event) => setNotes((current) => ({ ...current, internalNotes: event.target.value }))} rows={5} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Additional metadata</span>
                <textarea value={notes.additionalMetadata} onChange={(event) => setNotes((current) => ({ ...current, additionalMetadata: event.target.value }))} rows={5} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" />
              </label>
            </div>
          </MetadataSection>
        </div>
      </div>

      {showContributorModal ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-[28px] border border-stroke-default bg-bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.3)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Add Contributor</p>
                <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Attach contributor metadata</h2>
                <p className="mt-2 text-sm text-content-secondary">
                  Add the contributor once here, then keep their credit details attached to the song permanently.
                </p>
              </div>
              <button type="button" onClick={() => setShowContributorModal(false)} className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary">
                Close
              </button>
            </div>

            {contributorError ? (
              <p className="mt-5 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                {contributorError}
              </p>
            ) : null}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm"><span className="mb-1.5 block text-content-secondary">Legal name</span><input value={contributorDraft.legalName} onChange={(event) => setContributorDraft((current) => ({ ...current, legalName: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" /></label>
              <label className="block text-sm"><span className="mb-1.5 block text-content-secondary">Credited name</span><input value={contributorDraft.creditedName} onChange={(event) => setContributorDraft((current) => ({ ...current, creditedName: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" /></label>
              <label className="block text-sm"><span className="mb-1.5 block text-content-secondary">Role</span><select value={contributorDraft.role} onChange={(event) => setContributorDraft((current) => ({ ...current, role: event.target.value as SongContributor['role'] }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand">{SONG_ROLE_OPTIONS.map((role) => (<option key={role} value={role}>{role}</option>))}</select></label>
              <label className="block text-sm"><span className="mb-1.5 block text-content-secondary">Email</span><input value={contributorDraft.email} onChange={(event) => setContributorDraft((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" /></label>
              <label className="block text-sm"><span className="mb-1.5 block text-content-secondary">PRO affiliation</span><input value={contributorDraft.proAffiliation} onChange={(event) => setContributorDraft((current) => ({ ...current, proAffiliation: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" /></label>
              <label className="block text-sm"><span className="mb-1.5 block text-content-secondary">IPI number</span><input value={contributorDraft.ipiNumber} onChange={(event) => setContributorDraft((current) => ({ ...current, ipiNumber: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" /></label>
              <label className="block text-sm"><span className="mb-1.5 block text-content-secondary">Split percentage</span><input value={contributorDraft.splitPercentage} onChange={(event) => setContributorDraft((current) => ({ ...current, splitPercentage: event.target.value }))} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" /></label>
              <label className="block text-sm sm:col-span-2"><span className="mb-1.5 block text-content-secondary">Notes</span><textarea value={contributorDraft.notes} onChange={(event) => setContributorDraft((current) => ({ ...current, notes: event.target.value }))} rows={4} className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand" /></label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowContributorModal(false)} className="w-full rounded-full border border-stroke-default bg-bg-elevated px-4 py-3 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2">
                Cancel
              </button>
              <button type="button" onClick={addContributor} className="w-full rounded-full bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover sm:w-auto sm:py-2">
                Add contributor
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
