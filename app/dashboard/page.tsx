'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { getSubscriptionAccess } from '@/lib/subscription-access';
import { SubscriptionPaywall } from '@/components/billing/SubscriptionPaywall';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { buildReleaseChecklist, formatDateInput, getChecklistProgress } from '@/lib/release-checklist';

type ReleaseRow = {
  id: string;
  title: string;
  artist_name: string;
  created_at: string;
  status: 'draft' | 'in-progress' | 'ready' | 'released';
  release_date: string | null;
  type: string | null;
};

type ReleaseCard = ReleaseRow & {
  totalTasks: number;
  completedTasks: number;
  progress: number;
};

type ArtistOption = {
  id: string;
  name: string;
};

type SongLibraryOption = {
  id: string;
  songTitle: string;
  primaryArtist: string;
  isrc: string;
  duration?: string;
  contributorCount: number;
};

type ReleaseFormState = {
  title: string;
  artistName: string;
  releaseDate: string;
  releaseType: string;
  selectedSongIds: string[];
  songSearch: string;
};

const DEFAULT_RELEASE_FORM = (): ReleaseFormState => ({
  title: '',
  artistName: '',
  releaseDate: formatDateInput(new Date()),
  releaseType: 'single',
  selectedSongIds: [],
  songSearch: '',
});

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [releasePendingDelete, setReleasePendingDelete] = useState<ReleaseCard | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [hasSubscriptionAccess, setHasSubscriptionAccess] = useState<boolean | null>(null);
  const [releases, setReleases] = useState<ReleaseCard[]>([]);
  const [form, setForm] = useState<ReleaseFormState>(DEFAULT_RELEASE_FORM);
  const [artistOptions, setArtistOptions] = useState<ArtistOption[]>([]);
  const [isLoadingArtists, setIsLoadingArtists] = useState(true);
  const [songLibraryOptions, setSongLibraryOptions] = useState<SongLibraryOption[]>([]);
  const [isLoadingSongs, setIsLoadingSongs] = useState(true);

  const sortedReleases = useMemo(
    () =>
      [...releases].sort((a, b) => {
        const left = new Date(a.release_date || a.created_at).getTime();
        const right = new Date(b.release_date || b.created_at).getTime();
        return left - right;
      }),
    [releases]
  );

  const filteredSongLibraryOptions = useMemo(() => {
    const query = form.songSearch.trim().toLowerCase();
    if (!query) return songLibraryOptions;
    return songLibraryOptions.filter((song) =>
      [song.songTitle, song.primaryArtist, song.isrc].join(' ').toLowerCase().includes(query)
    );
  }, [form.songSearch, songLibraryOptions]);
  const selectedSongsPreview = useMemo(
    () =>
      form.selectedSongIds
        .map((songId) => songLibraryOptions.find((song) => song.id === songId))
        .filter(Boolean) as SongLibraryOption[],
    [form.selectedSongIds, songLibraryOptions]
  );

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    if (!hasLoadedOnce && releases.length === 0) {
      setIsLoading(true);
    }
    setError('');

    try {
      const entitlement = await getSubscriptionAccess(user.id);
      setHasSubscriptionAccess(entitlement.hasAccess);
      if (!entitlement.hasAccess) return;

      const { data: releasesData, error: releasesError } = await supabase
        .from('releases')
        .select('id,title,artist_name,created_at,status,release_date,type')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (releasesError) throw releasesError;

      const releaseRows = (releasesData || []) as ReleaseRow[];
      if (releaseRows.length === 0) {
        setReleases([]);
        return;
      }

      const releaseIds = releaseRows.map((release) => release.id);
      const { data: tasksData, error: tasksError } = await supabase
        .from('ai_tasks')
        .select('release_id,status')
        .in('release_id', releaseIds);

      if (tasksError) throw tasksError;

      const taskRows = (tasksData || []) as Array<{ release_id: string; status: string }>;
      const counts = new Map<string, { total: number; completed: number }>();

      for (const row of taskRows) {
        const current = counts.get(row.release_id) || { total: 0, completed: 0 };
        current.total += 1;
        if (row.status === 'completed') current.completed += 1;
        counts.set(row.release_id, current);
      }

      setReleases(
        releaseRows.map((release) => {
          const current = counts.get(release.id) || { total: 0, completed: 0 };
          return {
            ...release,
            totalTasks: current.total,
            completedTasks: current.completed,
            progress: getChecklistProgress(current.total, current.completed),
          };
        })
      );
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load releases.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [hasLoadedOnce, releases.length, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadDashboard();
  }, [authLoading, loadDashboard, router, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    let cancelled = false;

    const loadArtistOptions = async () => {
      setIsLoadingArtists(true);

      try {
        if (user.role === 'artist') {
          const ownArtistName = String(user.artist_name || '').trim();
          const nextOptions = ownArtistName ? [{ id: user.id, name: ownArtistName }] : [];
          if (!cancelled) {
            setArtistOptions(nextOptions);
            setForm((current) => ({
              ...current,
              artistName: nextOptions[0]?.name || '',
            }));
          }
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token || '';
        if (!accessToken) {
          throw new Error('Session expired. Please sign in again.');
        }

        const response = await fetch('/api/managed-artists', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as {
          artists?: Array<{ id: string; name: string }>;
          error?: string;
        };

        if (!response.ok) {
          if (response.status === 403) {
            if (!cancelled) {
              setArtistOptions([]);
              setForm((current) => ({ ...current, artistName: '' }));
            }
            return;
          }
          throw new Error(payload.error || 'Could not load artists.');
        }

        const nextOptions = Array.isArray(payload.artists)
          ? payload.artists
              .filter((artist) => typeof artist?.id === 'string' && typeof artist?.name === 'string')
              .map((artist) => ({ id: artist.id, name: artist.name.trim() }))
              .filter((artist) => artist.name)
          : [];

        if (!cancelled) {
          setArtistOptions(nextOptions);
          setForm((current) => {
            const hasCurrentSelection = nextOptions.some((artist) => artist.name === current.artistName);
            return {
              ...current,
              artistName: hasCurrentSelection ? current.artistName : nextOptions[0]?.name || '',
            };
          });
        }
      } catch (artistLoadError: any) {
        if (!cancelled) {
          setArtistOptions([]);
          setForm((current) => ({ ...current, artistName: '' }));
          setError((current) => current || artistLoadError?.message || 'Could not load artists.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingArtists(false);
        }
      }
    };

    void loadArtistOptions();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    let cancelled = false;

    const loadSongOptions = async () => {
      setIsLoadingSongs(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token || '';
        if (!accessToken) {
          throw new Error('Session expired. Please sign in again.');
        }

        const response = await fetch('/api/songs', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as {
          songs?: SongLibraryOption[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || 'Could not load songs.');
        }

        if (!cancelled) {
          setSongLibraryOptions(Array.isArray(payload.songs) ? payload.songs : []);
        }
      } catch (songLoadError: any) {
        if (!cancelled) {
          setSongLibraryOptions([]);
          setError((current) => current || songLoadError?.message || 'Could not load songs.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSongs(false);
        }
      }
    };

    void loadSongOptions();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const handleCreateRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || isCreating) return;

    const title = form.title.trim();
    const artistName = form.artistName.trim();
    const releaseDate = form.releaseDate.trim();
    const releaseType = form.releaseType.trim();

    if (!title || !artistName || !releaseDate) {
      setError('Release title, artist selection, and release date are required.');
      return;
    }

    if (!artistOptions.some((artist) => artist.name === artistName)) {
      setError('Select an artist from your saved account artists before creating a release.');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const { data: release, error: releaseError } = await supabase
        .from('releases')
        .insert({
          user_id: user.id,
          title,
          artist_name: artistName,
          status: 'in-progress',
          release_date: releaseDate,
          type: releaseType || null,
        })
        .select('id,title,artist_name,created_at,status,release_date,type')
        .single();

      if (releaseError || !release) {
        throw releaseError || new Error('Could not create release.');
      }

      const checklist = buildReleaseChecklist(releaseDate);
      const { error: profileError } = await supabase.from('release_profiles').upsert(
        {
          release_id: release.id,
          setup_step: 6,
          setup_completed: true,
          hard_deadline: releaseDate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'release_id' }
      );
      if (profileError) throw profileError;

      const { error: deleteExistingTasksError } = await supabase.from('ai_tasks').delete().eq('release_id', release.id);
      if (deleteExistingTasksError) throw deleteExistingTasksError;

      const { error: tasksError } = await supabase.from('ai_tasks').insert(
        checklist.map((task, index) => ({
          release_id: release.id,
          user_id: user.id,
          title: task.title,
          description: task.description,
          why_it_matters: `Recommended timing: ${task.recommendedTiming}`,
          input_type: 'text',
          status: 'pending',
          phase: task.phase,
          order_index: index,
        }))
      );
      if (tasksError) throw tasksError;

      if (form.selectedSongIds.length > 0) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token || '';
        if (!accessToken) throw new Error('Session expired. Please sign in again.');

        const attachResponse = await fetch(`/api/plans/${release.id}/songs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ songIds: form.selectedSongIds }),
        });

        const attachPayload = (await attachResponse.json().catch(() => ({}))) as { error?: string };
        if (!attachResponse.ok) {
          throw new Error(attachPayload.error || 'Could not attach songs to the release.');
        }
      }

      setForm(DEFAULT_RELEASE_FORM());
      await loadDashboard();
      router.push(`/dashboard/plans/${release.id}`);
    } catch (createError: any) {
      setError(createError?.message || 'Could not create release.');
    } finally {
      setIsCreating(false);
    }
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setReleasePendingDelete(null);
    setDeleteConfirmText('');
  };

  const confirmDeleteRelease = async () => {
    if (!releasePendingDelete || !user?.id || isDeleting) return;

    setIsDeleting(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token || '';
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`/api/plans/${releasePendingDelete.id}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          confirmationText: deleteConfirmText,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not delete release.');
      }

      setReleasePendingDelete(null);
      setDeleteConfirmText('');
      await loadDashboard();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Could not delete release.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <LoadingScreen
        variant="dashboard"
        eyebrow="Dashboard"
        title="Loading your releases"
        description="Preparing your release checklist dashboard and saved plans."
      />
    );
  }

  if (hasSubscriptionAccess === false) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[760px] px-6 py-12">
          <SubscriptionPaywall title="Start your release checklist workflow" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1100px] px-4 pb-8 pt-20 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Dashboard</p>
            <h1 className="mt-2 text-[clamp(2.4rem,6vw,4.2rem)] tracking-tight text-content-primary">Release Execution</h1>
            <p className="mt-3 max-w-2xl text-sm text-content-secondary">
              Create a release, generate the standard checklist automatically, and track completion from planning through post-release.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Link href="/dashboard/releases/new" className="w-full rounded-full bg-brand px-4 py-3 text-center text-sm font-semibold text-content-inverse hover:bg-brand-hover sm:w-auto sm:py-2">
              New Release
            </Link>
            <Link href="/settings" className="w-full rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2">
              Account
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </p>
        )}

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <form onSubmit={handleCreateRelease} className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] sm:p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Create New Release</p>
            <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Start a professional rollout</h2>
            <p className="mt-2 text-sm text-content-secondary">
              Enter the release basics, attach songs from your library, and Urganize will generate the full timeline-based checklist automatically.
            </p>

            <div className="mt-6 space-y-4">
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Release Title</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 text-content-primary outline-none focus:border-brand"
                  placeholder="e.g. Midnight Echo"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-content-secondary">Artist Name</span>
                <select
                  value={form.artistName}
                  onChange={(event) => setForm((current) => ({ ...current, artistName: event.target.value }))}
                  disabled={isLoadingArtists || artistOptions.length === 0}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 text-content-primary outline-none focus:border-brand"
                >
                  <option value="">
                    {isLoadingArtists ? 'Loading artists...' : artistOptions.length === 0 ? 'No saved artists available' : 'Select artist'}
                  </option>
                  {artistOptions.map((artist) => (
                    <option key={artist.id} value={artist.name}>
                      {artist.name}
                    </option>
                  ))}
                </select>
                {artistOptions.length === 0 && !isLoadingArtists ? (
                  <p className="mt-2 text-xs text-content-tertiary">
                    Add artists in <Link href="/settings" className="underline hover:text-content-primary">Settings</Link> before creating a release.
                  </p>
                ) : null}
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1.5 block text-content-secondary">Release Date</span>
                  <input
                    type="date"
                    value={form.releaseDate}
                    onChange={(event) => setForm((current) => ({ ...current, releaseDate: event.target.value }))}
                    className="min-w-0 w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 text-content-primary outline-none focus:border-brand"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-content-secondary">Release Type</span>
                  <select
                    value={form.releaseType}
                    onChange={(event) => setForm((current) => ({ ...current, releaseType: event.target.value }))}
                    className="min-w-0 w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 text-content-primary outline-none focus:border-brand"
                  >
                    <option value="single">Single</option>
                    <option value="ep">EP</option>
                    <option value="album">Album</option>
                  </select>
                </label>
              </div>

              <div className="rounded-[24px] border border-stroke-subtle bg-bg-elevated/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-[26rem]">
                    <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Attach Songs</p>
                    <h3 className="mt-2 text-lg font-semibold text-content-primary">Build releases using songs already stored in your library</h3>
                    <p className="mt-2 text-sm text-content-secondary">
                      Select songs from your metadata library to keep this release connected to real song information.
                    </p>
                  </div>
                  <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-xs text-content-secondary">
                    {form.selectedSongIds.length} selected
                  </span>
                </div>

                {songLibraryOptions.length === 0 && !isLoadingSongs ? (
                  <div className="mt-4 rounded-[20px] border border-dashed border-stroke-default bg-bg-surface px-4 py-5 text-sm text-content-secondary">
                    <p className="font-medium text-content-primary">No songs in your library yet.</p>
                    <p className="mt-2">Create songs in your Song Library, then attach them to releases.</p>
                    <Link href="/dashboard/songs" className="mt-3 inline-flex rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover">
                      Create Song
                    </Link>
                  </div>
                ) : (
                  <>
                    {form.releaseType === 'single' ? (
                      <p className="mt-4 rounded-[18px] border border-stroke-subtle bg-bg-surface px-4 py-3 text-xs text-content-secondary">
                        Singles usually use one song. You can still attach more than one if you need alternate versions later.
                      </p>
                    ) : null}
                    <input
                      value={form.songSearch}
                      onChange={(event) => setForm((current) => ({ ...current, songSearch: event.target.value }))}
                      placeholder="Search songs by title, artist, or ISRC"
                      className="mt-4 w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 text-content-primary outline-none focus:border-brand"
                    />

                    <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                      {isLoadingSongs ? (
                        <p className="rounded-[20px] border border-stroke-subtle bg-bg-surface px-4 py-4 text-sm text-content-secondary">
                          Loading songs...
                        </p>
                      ) : filteredSongLibraryOptions.length === 0 ? (
                        <p className="rounded-[20px] border border-stroke-subtle bg-bg-surface px-4 py-4 text-sm text-content-secondary">
                          No songs match this search yet.
                        </p>
                      ) : (
                        filteredSongLibraryOptions.map((song) => {
                          const isSelected = form.selectedSongIds.includes(song.id);
                          return (
                            <label
                              key={song.id}
                              className={`flex cursor-pointer items-start gap-3 rounded-[20px] border px-4 py-3 transition ${
                                isSelected
                                  ? 'border-brand bg-brand-muted/60'
                                  : 'border-stroke-subtle bg-bg-surface hover:bg-bg-hover/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    selectedSongIds: event.target.checked
                                      ? [...current.selectedSongIds, song.id]
                                      : current.selectedSongIds.filter((id) => id !== song.id),
                                  }))
                                }
                                className="mt-1 h-4 w-4 rounded border-stroke-default"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-content-primary">{song.songTitle}</p>
                                <p className="mt-1 text-sm text-content-secondary">{song.primaryArtist}</p>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-content-tertiary">
                                  <span>{song.isrc ? `ISRC ${song.isrc}` : 'No ISRC yet'}</span>
                                  <span>{song.contributorCount} contributors</span>
                                </div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div className="mt-4 rounded-[20px] border border-stroke-subtle bg-bg-surface px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Selected Order Preview</p>
                        <span className="text-xs text-content-tertiary">
                          Automatically becomes the starting tracklist order
                        </span>
                      </div>
                      {selectedSongsPreview.length === 0 ? (
                        <p className="mt-3 text-sm text-content-secondary">
                          No songs selected yet. Pick one or more songs to attach to this release.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {selectedSongsPreview.map((song, index) => (
                            <div key={song.id} className="flex items-center justify-between gap-3 rounded-[16px] border border-stroke-subtle bg-bg-elevated px-3 py-3 text-sm">
                              <div className="min-w-0">
                                <p className="font-semibold text-content-primary">
                                  {index + 1}. {song.songTitle}
                                </p>
                                <p className="mt-1 text-content-secondary">{song.primaryArtist}</p>
                              </div>
                              <span className="text-xs text-content-tertiary">{song.duration || 'Duration not set'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isCreating || isLoadingArtists || artistOptions.length === 0}
              className="mt-6 w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
            >
              {isCreating ? 'Generating Checklist...' : 'Create New Release'}
            </button>
          </form>

          <section className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Releases</p>
                <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Your rollout checklist library</h2>
              </div>
              <span className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs text-content-secondary">
                {sortedReleases.length} releases
              </span>
            </div>

            {sortedReleases.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-stroke-default bg-bg-elevated px-6 py-10 text-center text-sm text-content-secondary">
                No releases yet. Create your first release to generate the checklist.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {sortedReleases.map((release) => (
                  <div
                    key={release.id}
                    className="rounded-3xl border border-stroke-subtle bg-bg-elevated px-4 py-4 transition hover:-translate-y-[1px] hover:border-stroke-default hover:bg-bg-hover sm:px-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/releases/${release.id}`)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg font-semibold text-content-primary">{release.title}</p>
                            <p className="mt-1 text-sm text-content-secondary">Artist: {release.artist_name}</p>
                            <p className="mt-1 text-sm text-content-secondary">
                              Release Date:{' '}
                              {release.release_date
                                ? new Date(release.release_date).toLocaleDateString()
                                : 'Not set'}
                            </p>
                          </div>
                          <div className="min-w-0 text-left sm:min-w-[130px] sm:text-right">
                            <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">Progress</p>
                            <p className="mt-1 text-2xl font-semibold text-content-primary">{release.progress}%</p>
                          </div>
                        </div>
                        <div className="mt-4 h-2 rounded-full bg-bg-overlay">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${release.progress}%` }} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-content-secondary">
                          <span>
                            {release.completedTasks} completed / {release.totalTasks} total
                          </span>
                          <span>{release.type ? release.type.toUpperCase() : 'RELEASE'}</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReleasePendingDelete(release);
                          setDeleteConfirmText('');
                        }}
                        className="w-full rounded-2xl border border-status-error/35 bg-status-error/10 px-3 py-3 text-xs font-semibold text-status-error hover:bg-status-error/15 sm:w-auto sm:py-2"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
      {releasePendingDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stroke-default bg-bg-surface p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-content-primary">Delete this release?</h2>
            <p className="mt-2 text-sm text-content-secondary">
              This will permanently delete <span className="font-semibold text-content-primary">{releasePendingDelete.title}</span> and all checklist progress.
            </p>
            <p className="mt-3 text-sm text-content-secondary">
              Type <span className="font-semibold text-content-primary">DELETE</span> to confirm.
            </p>
            <input
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-status-error/35 bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-status-error"
              placeholder="DELETE"
            />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="w-full rounded-2xl border border-stroke-default bg-bg-elevated px-4 py-3 text-sm text-content-primary hover:bg-bg-hover disabled:opacity-50 sm:w-auto sm:py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteRelease}
                disabled={isDeleting}
                className="w-full rounded-2xl bg-status-error px-4 py-3 text-sm font-semibold text-content-inverse hover:opacity-90 disabled:opacity-50 sm:w-auto sm:py-2"
              >
                {isDeleting ? 'Deleting...' : 'Delete Release'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
