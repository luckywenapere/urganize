'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { CreditsMetadataSection } from '@/components/credits/CreditsMetadataSection';
import { LoadingScreen } from '@urganize/ui';
import {
  getChecklistProgress,
  groupChecklistByStage,
  TIMELINE_STAGE_LABELS,
  type TimelineStage,
} from '@/lib/release-checklist';
import type { ReleaseSongSummary } from '@/lib/release-songs';

type ReleaseRow = {
  id: string;
  title: string;
  artist_name: string;
  status: 'draft' | 'in-progress' | 'ready' | 'released';
  release_date: string | null;
  type: string | null;
  created_at: string;
};

type ReleaseTaskRow = {
  id: string;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  status: 'current' | 'pending' | 'completed';
  order_index: number | null;
};

type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  timelineStage: TimelineStage;
  recommendedTiming: string;
  completed: boolean;
};

type ReleaseTimelineStage =
  | 'Strategy'
  | 'Distribution'
  | 'Marketing'
  | 'Release Week'
  | 'Release Day'
  | 'Post Release';

const RELEASE_TIMELINE_STAGES: ReleaseTimelineStage[] = [
  'Strategy',
  'Distribution',
  'Marketing',
  'Release Week',
  'Release Day',
  'Post Release',
];

const stageByIndex = (index: number): TimelineStage => {
  if (index <= 4) return '12_weeks_before';
  if (index <= 7) return '8_weeks_before';
  if (index <= 10) return '6_weeks_before';
  if (index <= 13) return '4_weeks_before';
  if (index <= 15) return '2_weeks_before';
  if (index <= 18) return 'release_week';
  if (index <= 21) return 'release_day';
  return 'post_release';
};

const extractRecommendedTiming = (value: string | null | undefined, stage: TimelineStage): string => {
  const message = String(value || '').trim();
  if (message.toLowerCase().startsWith('recommended timing:')) {
    return message.slice('recommended timing:'.length).trim() || TIMELINE_STAGE_LABELS[stage];
  }
  return message || TIMELINE_STAGE_LABELS[stage];
};

const parseReleaseDateAsLocalDay = (value: string): Date => {
  const normalized = String(value || '').trim();
  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(normalized);
};

const resolveCurrentTimelineStage = (releaseDate: string | null | undefined): ReleaseTimelineStage => {
  if (!releaseDate) return 'Strategy';

  const target = parseReleaseDateAsLocalDay(releaseDate);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  if (!Number.isFinite(target.getTime())) return 'Strategy';

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Post Release';
  if (diffDays === 0) return 'Release Day';
  if (diffDays <= 7) return 'Release Week';
  if (diffDays <= 42) return 'Marketing';
  if (diffDays <= 56) return 'Distribution';
  return 'Strategy';
};

export default function ReleaseChecklistPage() {
  const router = useRouter();
  const params = useParams<{ planId: string }>();
  const planId = Array.isArray(params?.planId) ? params.planId[0] : params?.planId;
  const { user, isLoading: authLoading } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [release, setRelease] = useState<ReleaseRow | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [releaseSongs, setReleaseSongs] = useState<ReleaseSongSummary[]>([]);
  const [availableSongs, setAvailableSongs] = useState<ReleaseSongSummary[]>([]);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [songSearch, setSongSearch] = useState('');
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [isSavingSongs, setIsSavingSongs] = useState(false);

  const completedTasks = useMemo(() => checklist.filter((item) => item.completed).length, [checklist]);
  const progress = useMemo(() => getChecklistProgress(checklist.length, completedTasks), [checklist.length, completedTasks]);
  const remainingTasks = Math.max(checklist.length - completedTasks, 0);
  const groupedChecklist = useMemo(() => groupChecklistByStage(checklist), [checklist]);
  const currentTimelineStage = useMemo(
    () => resolveCurrentTimelineStage(release?.release_date),
    [release?.release_date]
  );
  const filteredAvailableSongs = useMemo(() => {
    const query = songSearch.trim().toLowerCase();
    if (!query) return availableSongs;
    return availableSongs.filter((song) =>
      [song.songTitle, song.primaryArtist, song.isrc].join(' ').toLowerCase().includes(query)
    );
  }, [availableSongs, songSearch]);
  const tracklistSongs = useMemo(
    () => [...releaseSongs].sort((a, b) => Number(a.trackNumber || 0) - Number(b.trackNumber || 0)),
    [releaseSongs]
  );

  const loadRelease = useCallback(async () => {
    if (!user?.id || !planId) return;
    if (!hasLoadedOnce && !release && checklist.length === 0) {
      setIsLoading(true);
    }
    setError('');

    try {
      const [{ data: releaseData, error: releaseError }, { data: taskData, error: taskError }] = await Promise.all([
        supabase
          .from('releases')
          .select('id,title,artist_name,status,release_date,type,created_at')
          .eq('id', planId)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('ai_tasks')
          .select('id,title,description,why_it_matters,status,order_index')
          .eq('release_id', planId)
          .order('order_index', { ascending: true }),
      ]);

      if (releaseError) throw releaseError;
      if (taskError) throw taskError;
      if (!releaseData) throw new Error('Release not found.');

      const taskRows = (taskData || []) as ReleaseTaskRow[];
      setRelease(releaseData as ReleaseRow);
      setChecklist(
        taskRows.map((task, index) => {
          const orderIndex = task.order_index ?? index;
          const timelineStage = stageByIndex(orderIndex);
          return {
            id: task.id,
            title: task.title,
            description: String(task.description || '').trim(),
            timelineStage,
            recommendedTiming: extractRecommendedTiming(task.why_it_matters, timelineStage),
            completed: task.status === 'completed',
          };
        })
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (accessToken) {
        const songsResponse = await fetch(`/api/plans/${planId}/songs`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        });
        const songsPayload = (await songsResponse.json().catch(() => ({}))) as {
          songs?: {
            attached?: ReleaseSongSummary[];
            available?: ReleaseSongSummary[];
          };
          error?: string;
        };
        if (!songsResponse.ok) {
          throw new Error(songsPayload.error || 'Could not load release songs.');
        }
        setReleaseSongs(songsPayload.songs?.attached || []);
        setAvailableSongs(songsPayload.songs?.available || []);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load release checklist.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [checklist.length, hasLoadedOnce, planId, release, user?.id]);

  const addSongsToRelease = async () => {
    if (!planId || selectedSongIds.length === 0 || isSavingSongs) return;
    setIsSavingSongs(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/plans/${planId}/songs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ songIds: selectedSongIds }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not attach songs.');
      }

      setSelectedSongIds([]);
      setSongSearch('');
      setShowSongPicker(false);
      await loadRelease();
    } catch (songError: any) {
      setError(songError?.message || 'Could not attach songs.');
    } finally {
      setIsSavingSongs(false);
    }
  };

  const removeSongFromRelease = async (songId: string) => {
    if (!planId || isSavingSongs) return;
    setIsSavingSongs(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/plans/${planId}/songs/${songId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not remove song.');
      }
      await loadRelease();
    } catch (songError: any) {
      setError(songError?.message || 'Could not remove song.');
    } finally {
      setIsSavingSongs(false);
    }
  };

  const reorderSongs = async (songId: string, direction: 'up' | 'down') => {
    if (!planId || isSavingSongs) return;
    const orderedIds = tracklistSongs.map((song) => song.songId);
    const currentIndex = orderedIds.findIndex((id) => id === songId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= orderedIds.length) return;

    const nextOrderedIds = [...orderedIds];
    const [moved] = nextOrderedIds.splice(currentIndex, 1);
    nextOrderedIds.splice(targetIndex, 0, moved);

    setIsSavingSongs(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/plans/${planId}/songs`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderedSongIds: nextOrderedIds }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not update track order.');
      }
      await loadRelease();
    } catch (songError: any) {
      setError(songError?.message || 'Could not update track order.');
    } finally {
      setIsSavingSongs(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    if (!planId) {
      setError('Release not found.');
      setIsLoading(false);
      return;
    }
    void loadRelease();
  }, [authLoading, loadRelease, planId, router, user]);

  const toggleTask = async (taskId: string, completed: boolean) => {
    if (!user?.id || !planId || isSaving) return;
    setIsSaving(taskId);
    setError('');

    try {
      const nextStatus = completed ? 'pending' : 'completed';
      const { error: updateError } = await supabase
        .from('ai_tasks')
        .update({
          status: nextStatus,
          completed_at: completed ? null : new Date().toISOString(),
        })
        .eq('id', taskId)
        .eq('release_id', planId);

      if (updateError) throw updateError;

      setChecklist((current) =>
        current.map((item) => (item.id === taskId ? { ...item, completed: !completed } : item))
      );
    } catch (toggleError: any) {
      setError(toggleError?.message || 'Could not update task status.');
    } finally {
      setIsSaving(null);
    }
  };

  if (isLoading || authLoading) {
    return (
      <LoadingScreen
        variant="detail"
        eyebrow="Release Checklist"
        title="Loading your release plan"
        description="Arranging the timeline, progress, and task sequence for this release."
      />
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[980px] px-4 pb-8 pt-20 sm:px-8 sm:py-10">
        <div className="border-b border-stroke-default pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="text-sm text-content-secondary">
              <span className="font-medium text-content-primary">Dashboard</span>
              <span className="mx-2 text-content-tertiary">|</span>
              <span>Releases</span>
            </div>
            <Link
              href="/dashboard"
              className="w-full rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-center text-sm text-content-secondary transition hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        <section className="border-b border-stroke-default py-8">
          <h1 className="text-[clamp(2.2rem,5vw,3.6rem)] tracking-tight text-content-primary">
            {release?.title || 'Release Checklist'}
          </h1>
          <div className="mt-3 space-y-1 text-sm text-content-secondary">
            <p>
              <span className="font-medium text-content-primary">Artist:</span>{' '}
              {release?.artist_name || 'Unknown artist'}
            </p>
            {release?.release_date ? (
              <p>
                <span className="font-medium text-content-primary">Release Date:</span>{' '}
                {new Date(release.release_date).toLocaleDateString()}
              </p>
            ) : null}
            {release?.type ? (
              <p>
                <span className="font-medium text-content-primary">Release Type:</span>{' '}
                {release.type}
              </p>
            ) : null}
          </div>
        </section>

        {error && (
          <p className="mt-6 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </p>
        )}

        <section className="border-b border-stroke-default py-8">
          <div>
            <p className="text-sm font-medium text-content-primary">Release Readiness</p>
            <p className="mt-2 text-[clamp(1.6rem,3vw,2.3rem)] font-semibold tracking-tight text-content-primary">
              {progress}% Ready to Drop
            </p>
            <div className="mt-4 h-5 overflow-hidden rounded-full border border-stroke-default bg-bg-overlay">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-content-secondary">
              <span className="font-medium text-content-primary">{progress}%</span>
              {' '}
              • {completedTasks} completed • {remainingTasks} remaining
            </p>
          </div>
        </section>

        <section className="border-b border-stroke-default py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-content-primary">Songs in This Release</p>
              <p className="mt-2 text-sm text-content-secondary">
                Keep releases connected to real song metadata by attaching songs from your library.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSongPicker((current) => !current)}
              className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              {showSongPicker ? 'Close Song Picker' : 'Add Songs'}
            </button>
          </div>

          {tracklistSongs.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-stroke-default bg-bg-elevated/70 px-5 py-8 text-sm text-content-secondary">
              <p className="font-medium text-content-primary">No songs attached yet.</p>
              <p className="mt-2">Add songs from your library to keep this release connected to real song metadata.</p>
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-[24px] border border-stroke-default bg-bg-surface/95">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-stroke-default text-sm">
                  <thead className="bg-bg-elevated/80 text-left text-content-tertiary">
                    <tr>
                      <th className="px-4 py-3 font-medium">Song</th>
                      <th className="px-4 py-3 font-medium">ISRC</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="px-4 py-3 font-medium">Contributors</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke-default bg-bg-surface/90">
                    {tracklistSongs.map((song, index) => (
                      <tr key={song.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-content-primary">{song.songTitle}</p>
                          <p className="mt-1 text-content-secondary">{song.primaryArtist}</p>
                        </td>
                        <td className="px-4 py-3 text-content-secondary">{song.isrc || 'Not added'}</td>
                        <td className="px-4 py-3 text-content-secondary">{song.duration || 'Not added'}</td>
                        <td className="px-4 py-3 text-content-secondary">{song.contributorCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void reorderSongs(song.songId, 'up')}
                              disabled={isSavingSongs || index === 0}
                              className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-40"
                            >
                              Move Up
                            </button>
                            <button
                              type="button"
                              onClick={() => void reorderSongs(song.songId, 'down')}
                              disabled={isSavingSongs || index === tracklistSongs.length - 1}
                              className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-40"
                            >
                              Move Down
                            </button>
                            <Link
                              href={`/dashboard/songs/${song.songId}`}
                              className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover"
                            >
                              Open Song
                            </Link>
                            <button
                              type="button"
                              onClick={() => void removeSongFromRelease(song.songId)}
                              disabled={isSavingSongs}
                              className="rounded-full border border-status-error/25 bg-status-error/10 px-3 py-2 text-xs font-semibold text-status-error hover:bg-status-error/15 disabled:opacity-60"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showSongPicker ? (
            <div className="mt-5 rounded-[24px] border border-stroke-subtle bg-bg-elevated/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Attach Songs</p>
              <h3 className="mt-2 text-lg font-semibold text-content-primary">Select songs from your library</h3>
              <input
                value={songSearch}
                onChange={(event) => setSongSearch(event.target.value)}
                placeholder="Search by song title, artist, or ISRC"
                className="mt-4 w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
              />
              <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                {availableSongs.length === 0 ? (
                  <p className="rounded-[20px] border border-dashed border-stroke-default bg-bg-surface px-4 py-4 text-sm text-content-secondary">
                    No songs in your library.
                  </p>
                ) : filteredAvailableSongs.length === 0 ? (
                  <p className="rounded-[20px] border border-stroke-subtle bg-bg-surface px-4 py-4 text-sm text-content-secondary">
                    No songs match this search.
                  </p>
                ) : (
                  filteredAvailableSongs.map((song) => {
                    const isSelected = selectedSongIds.includes(song.songId);
                    return (
                      <label
                        key={song.songId}
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
                            setSelectedSongIds((current) =>
                              event.target.checked
                                ? [...current, song.songId]
                                : current.filter((id) => id !== song.songId)
                            )
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
              <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSongIds([]);
                    setSongSearch('');
                    setShowSongPicker(false);
                  }}
                  className="w-full rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void addSongsToRelease()}
                  disabled={selectedSongIds.length === 0 || isSavingSongs}
                  className="w-full rounded-full bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60 sm:w-auto sm:py-2"
                >
                  {isSavingSongs ? 'Saving...' : `Attach ${selectedSongIds.length || ''} Song${selectedSongIds.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="border-b border-stroke-default py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-content-primary">Tracklist</p>
              <p className="mt-2 text-sm text-content-secondary">
                Automatically generated from attached songs.
              </p>
            </div>
            <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-xs text-content-secondary">
              {tracklistSongs.length} tracks
            </span>
          </div>

          {tracklistSongs.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-stroke-default bg-bg-elevated/70 px-5 py-8 text-sm text-content-secondary">
              <p className="font-medium text-content-primary">No songs attached yet.</p>
              <p className="mt-2">Add songs from your library to generate a proper tracklist and keep this release connected to song metadata.</p>
            </div>
          ) : (
            <div className="mt-5 rounded-[24px] border border-stroke-default bg-bg-surface/95">
              <div className="divide-y divide-stroke-default">
                {tracklistSongs.map((song, index) => (
                  <div key={song.id} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                      <p className="font-semibold text-content-primary">
                        {song.trackNumber || index + 1}. {song.songTitle}
                      </p>
                      <p className="mt-1 text-sm text-content-secondary">
                        {song.primaryArtist}{song.isrc ? ` · ISRC ${song.isrc}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-content-secondary">{song.duration || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="border-b border-stroke-default py-8">
          <div>
            <p className="text-sm font-medium text-content-primary">Current Stage</p>
            <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-2 text-sm">
              <div className="flex min-w-max items-center gap-2">
              {RELEASE_TIMELINE_STAGES.map((stage, index) => {
                const isActive = stage === currentTimelineStage;
                return (
                  <div key={stage} className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1.5 transition ${
                        isActive
                          ? 'bg-brand text-content-inverse'
                          : 'border border-stroke-default bg-bg-surface text-content-secondary'
                      }`}
                    >
                      {isActive ? stage.toUpperCase() : stage}
                    </span>
                    {index < RELEASE_TIMELINE_STAGES.length - 1 ? (
                      <span className="text-content-tertiary">→</span>
                    ) : null}
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        </section>

        <section className="py-8">
          <div className="space-y-10">
            {groupedChecklist.map((group) => (
              <section key={group.stage} className="border-b border-stroke-default pb-8 last:border-b-0 last:pb-0">
                <div className="mb-5">
                  <p className="text-lg font-semibold uppercase tracking-[0.12em] text-content-primary">
                    {group.label}
                  </p>
                </div>
                <div className="space-y-3">
                  {group.items.map((task) => (
                    <label
                      key={task.id}
                      className={`flex cursor-pointer items-start gap-4 rounded-[20px] border px-4 py-4 transition active:scale-[0.995] ${
                        task.completed
                          ? 'border-brand/30 bg-brand-muted/45'
                          : 'border-stroke-default bg-bg-surface hover:bg-bg-hover/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => void toggleTask(task.id, task.completed)}
                        disabled={isSaving === task.id}
                        className="mt-1 h-5 w-5 rounded border-stroke-default"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-base font-semibold ${task.completed ? 'text-content-primary line-through' : 'text-content-primary'}`}>
                          {task.title}
                        </p>
                        <p className="mt-1.5 text-sm text-content-secondary">{task.description}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-content-tertiary">
                          {task.recommendedTiming}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        {planId ? <CreditsMetadataSection planId={planId} /> : null}
      </div>
    </main>
  );
}

