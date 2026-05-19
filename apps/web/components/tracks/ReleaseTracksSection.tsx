'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AudioPlayer, Button } from '@urganize/ui';
import { PaywallGate } from '@/components/billing/PaywallGate';
import { EmptyState } from '@/components/shared/EmptyState';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { SectionCard } from '@/components/shared/SectionCard';
import { SqlSetupNotice } from '@/components/shared/SqlSetupNotice';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Toast } from '@/components/shared/Toast';
import { TrackShareLinksModal } from '@/components/tracks/TrackShareLinksModal';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { supabase } from '@/lib/supabase/client';
import {
  formatTrackDuration,
  formatTrackFileSize,
  type Track,
  type TrackApiError,
  type TrackListResponse,
  type TrackResponse,
  type TrackStatus,
  type TrackUploadResponse,
} from '@/lib/tracks';

type ReleaseTracksSectionProps = {
  releaseId: string;
  releaseTitle: string;
  artistName: string;
};

type UploadTask = {
  id: string;
  fileName: string;
  progress: number;
  status: 'analyzing' | 'uploading' | 'done' | 'error';
  error: string;
};

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

type AudioMetadata = {
  durationSeconds: number | null;
  waveformData: number[] | null;
};

function buildWaveformData(channelData: Float32Array, points = 72): number[] | null {
  if (!channelData.length || points <= 0) {
    return null;
  }

  const blockSize = Math.max(1, Math.floor(channelData.length / points));
  const waveform: number[] = [];

  for (let index = 0; index < points; index += 1) {
    const start = index * blockSize;
    const end = Math.min(channelData.length, start + blockSize);
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(channelData[sampleIndex] || 0));
    }

    waveform.push(peak);
  }

  const maxPeak = Math.max(...waveform, 0);
  if (maxPeak <= 0) {
    return null;
  }

  return waveform.map((value) => Number((value / maxPeak).toFixed(4)));
}

async function extractDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      audio.removeAttribute('src');
      audio.load();
    };

    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? Math.round(audio.duration) : null;
      cleanup();
      resolve(duration);
    };

    audio.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

async function extractWaveform(file: File): Promise<number[] | null> {
  const AudioContextConstructor =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
        null
      : null;

  if (!AudioContextConstructor) {
    return null;
  }

  const audioContext = new AudioContextConstructor();

  try {
    const buffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    return buildWaveformData(channelData);
  } catch {
    return null;
  } finally {
    await audioContext.close().catch(() => null);
  }
}

async function extractAudioMetadata(file: File): Promise<AudioMetadata> {
  const [durationSeconds, waveformData] = await Promise.all([
    extractDuration(file),
    extractWaveform(file),
  ]);

  return {
    durationSeconds,
    waveformData,
  };
}

function getStatusTone(status: TrackStatus): 'neutral' | 'warning' | 'success' {
  if (status === 'ready') {
    return 'success';
  }

  if (status === 'processing') {
    return 'warning';
  }

  return 'neutral';
}

function getUploadStatusLabel(task: UploadTask): string {
  if (task.status === 'analyzing') {
    return 'Analyzing';
  }

  if (task.status === 'uploading') {
    return `Uploading ${Math.round(task.progress)}%`;
  }

  if (task.status === 'done') {
    return 'Uploaded';
  }

  return 'Error';
}

function readJsonSafely<T>(value: string): Partial<T & TrackApiError> {
  try {
    return JSON.parse(value) as Partial<T & TrackApiError>;
  } catch {
    return {};
  }
}

export function ReleaseTracksSection({
  releaseId,
  releaseTitle,
  artistName,
}: ReleaseTracksSectionProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [schemaSql, setSchemaSql] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [savingTrackId, setSavingTrackId] = useState<string | null>(null);
  const [shareTrack, setShareTrack] = useState<Track | null>(null);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token || '';
    if (!accessToken) {
      throw new Error('Session expired. Please sign in again.');
    }

    return accessToken;
  }, []);

  const loadTracks = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }

    setError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/releases/${releaseId}/tracks`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        TrackListResponse & TrackApiError
      >;

      if (!response.ok) {
        if (response.status === 501 && payload.sql) {
          setSchemaSql(payload.sql);
          setTracks([]);
          return;
        }

        throw new Error(payload.error || 'Could not load tracks.');
      }

      setTracks(Array.isArray(payload.tracks) ? payload.tracks : []);
      setSchemaSql('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load tracks.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [getAccessToken, releaseId]);

  useEffect(() => {
    void loadTracks(true);
  }, [loadTracks]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const activeUploadCount = useMemo(
    () => uploadTasks.filter((task) => task.status === 'analyzing' || task.status === 'uploading').length,
    [uploadTasks]
  );

  const updateUploadTask = useCallback((taskId: string, nextPartial: Partial<UploadTask>) => {
    setUploadTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, ...nextPartial } : task))
    );
  }, []);

  const uploadFileWithProgress = useCallback(
    async (file: File, position: number, taskId: string): Promise<Track> => {
      updateUploadTask(taskId, { status: 'analyzing', progress: 6, error: '' });
      const metadata = await extractAudioMetadata(file);

      const accessToken = await getAccessToken();
      const formData = new FormData();
      formData.set('file', file);
      formData.set('releaseId', releaseId);
      formData.set('title', file.name.replace(/\.[^.]+$/, ''));
      formData.set('position', String(position));
      if (metadata.durationSeconds !== null) {
        formData.set('durationSeconds', String(metadata.durationSeconds));
      }
      if (metadata.waveformData) {
        formData.set('waveformData', JSON.stringify(metadata.waveformData));
      }

      return new Promise<Track>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/tracks/upload');
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) {
            updateUploadTask(taskId, { status: 'uploading', progress: 30 });
            return;
          }

          updateUploadTask(taskId, {
            status: 'uploading',
            progress: Math.max(12, (event.loaded / event.total) * 100),
          });
        };

        xhr.onerror = () => {
          reject(new Error('Could not upload track.'));
        };

        xhr.onload = () => {
          const payload = readJsonSafely<TrackUploadResponse>(xhr.responseText);
          if (xhr.status < 200 || xhr.status >= 300 || !payload.track) {
            reject(new Error(payload.error || 'Could not upload track.'));
            return;
          }

          resolve(payload.track as Track);
        };

        xhr.send(formData);
      });
    },
    [getAccessToken, releaseId, updateUploadTask]
  );

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) {
        return;
      }

      const tasks = files.map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        fileName: file.name,
        progress: 0,
        status: 'analyzing' as const,
        error: '',
      }));

      setUploadTasks((current) => [...tasks, ...current]);

      const results = await Promise.allSettled(
        files.map((file, index) => {
          captureAnalyticsEvent({
            name: 'track_upload_started',
            properties: {
              release_id: releaseId,
              file_type: file.type || file.name.split('.').pop() || 'unknown',
              file_size_mb: Number((file.size / (1024 * 1024)).toFixed(2)),
            },
          });

          return uploadFileWithProgress(file, tracks.length + index + 1, tasks[index].id)
            .then((track) => {
              updateUploadTask(tasks[index].id, { status: 'done', progress: 100 });
              return track;
            })
            .catch((uploadError) => {
              captureAnalyticsEvent({
                name: 'track_upload_failed',
                properties: {
                  release_id: releaseId,
                  error:
                    uploadError instanceof Error ? uploadError.message : 'Could not upload track.',
                },
              });
              updateUploadTask(tasks[index].id, {
                status: 'error',
                progress: 100,
                error: uploadError instanceof Error ? uploadError.message : 'Could not upload track.',
              });
              throw uploadError;
            });
        })
      );

      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - successCount;

      if (successCount > 0) {
        await loadTracks(false);
        setToast({
          message:
            failedCount > 0
              ? `${successCount} track${successCount === 1 ? '' : 's'} uploaded, ${failedCount} failed.`
              : `${successCount} track${successCount === 1 ? '' : 's'} uploaded.`,
          tone: failedCount > 0 ? 'error' : 'success',
        });
      } else {
        setToast({ message: 'No tracks were uploaded.', tone: 'error' });
      }
    },
    [loadTracks, releaseId, tracks.length, updateUploadTask, uploadFileWithProgress]
  );

  const persistTrackUpdate = useCallback(
    async (trackId: string, body: Record<string, unknown>): Promise<Track> => {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/tracks/${trackId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        TrackResponse & TrackApiError
      >;

      if (!response.ok || !payload.track) {
        throw new Error(payload.error || 'Could not update track.');
      }

      return payload.track;
    },
    [getAccessToken]
  );

  const commitTrackTitle = useCallback(
    async (track: Track) => {
      const nextTitle = editingTitle.trim();
      setEditingTrackId(null);
      setEditingTitle('');

      if (!nextTitle || nextTitle === track.title) {
        return;
      }

      setSavingTrackId(track.id);
      setError('');

      try {
        const updatedTrack = await persistTrackUpdate(track.id, { title: nextTitle });
        setTracks((current) =>
          current.map((entry) => (entry.id === track.id ? updatedTrack : entry))
        );
        setToast({ message: 'Track title updated.', tone: 'success' });
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update track.');
      } finally {
        setSavingTrackId(null);
      }
    },
    [editingTitle, persistTrackUpdate]
  );

  const handleDeleteTrack = useCallback(
    async (track: Track) => {
      if (!window.confirm(`Delete "${track.title}" and revoke all of its share links?`)) {
        return;
      }

      setSavingTrackId(track.id);
      setError('');

      try {
        const accessToken = await getAccessToken();
        const response = await fetch(`/api/tracks/${track.id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const payload = (await response.json().catch(() => ({}))) as Partial<TrackApiError>;
        if (!response.ok) {
          throw new Error(payload.error || 'Could not delete track.');
        }

        setTracks((current) => current.filter((entry) => entry.id !== track.id));
        setToast({ message: 'Track deleted.', tone: 'success' });
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : 'Could not delete track.');
      } finally {
        setSavingTrackId(null);
      }
    },
    [getAccessToken]
  );

  const reorderTracks = useCallback(
    async (draggedId: string, targetId: string) => {
      if (draggedId === targetId) {
        return;
      }

      const currentTracks = [...tracks];
      const draggedIndex = currentTracks.findIndex((track) => track.id === draggedId);
      const targetIndex = currentTracks.findIndex((track) => track.id === targetId);

      if (draggedIndex < 0 || targetIndex < 0) {
        return;
      }

      const [draggedTrack] = currentTracks.splice(draggedIndex, 1);
      currentTracks.splice(targetIndex, 0, draggedTrack);
      const previousPositionById = new Map(tracks.map((track) => [track.id, track.position]));

      const nextTracks = currentTracks.map((track, index) => ({
        ...track,
        position: index + 1,
      }));

      setTracks(nextTracks);
      setDraggedTrackId(null);

      try {
        const updates = nextTracks
          .filter((track) => track.position !== previousPositionById.get(track.id))
          .map((track) => persistTrackUpdate(track.id, { position: track.position }));

        await Promise.all(updates);
        setToast({ message: 'Track order updated.', tone: 'success' });
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update track order.');
        await loadTracks(false);
      }
    },
    [loadTracks, persistTrackUpdate, tracks]
  );

  return (
    <>
      <SectionCard
        className="sm:p-7"
        data-onboarding-target="tracks"
        data-ph-capture-attribute-section="tracks"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Tracks</p>
            <h2 className="mt-2 text-3xl tracking-tight text-content-primary">
              Upload masters and share them privately.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-content-secondary">
              Drag final audio into this release, preview it with waveform playback, and send private listen links to the people who need to hear it.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusBadge label={`${tracks.length} tracks`} size="sm" />
            <StatusBadge label={releaseTitle} size="sm" />
            <StatusBadge label={artistName || 'Artist'} size="sm" />
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
          {error ? (
            <p className="rounded-[22px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
              {error}
            </p>
          ) : null}
          {schemaSql ? (
            <SqlSetupNotice
              title="Tracks tables still need to be created"
              description="Run this SQL once in Supabase, including the private storage bucket insert, then reload the release page."
              sql={schemaSql}
            />
          ) : null}
        </div>

        <PaywallGate>
          {({ requireAccess }) => (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragOver(false);
                if (event.dataTransfer.files?.length) {
                  void requireAccess(() => handleFiles(event.dataTransfer.files));
                }
              }}
              className={`mt-6 rounded-[28px] border border-dashed p-6 transition ${
                isDragOver
                  ? 'border-brand/40 bg-brand-muted/35'
                  : 'border-stroke-default bg-bg-elevated/70'
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-lg font-semibold text-content-primary">
                    Drop `.mp3`, `.wav`, `.aiff`, or `.flac` files here
                  </p>
                  <p className="mt-2 text-sm text-content-secondary">
                    Each upload gets analyzed for duration and waveform first, then stored privately for controlled stakeholder listening.
                  </p>
                </div>

                <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-brand/20 bg-brand px-5 py-3 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover">
                  Select audio files
                  <input
                    type="file"
                    multiple
                    accept=".mp3,.wav,.aiff,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/aiff,audio/x-aiff,audio/flac,audio/x-flac"
                    className="sr-only"
                    onChange={(event) => {
                      const files = event.target.files;
                      if (files?.length) {
                        void requireAccess(() => handleFiles(files));
                      }

                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </PaywallGate>

        {uploadTasks.length > 0 ? (
          <div className="mt-5 rounded-[28px] border border-stroke-default bg-bg-elevated/70 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-content-primary">Upload queue</h3>
                <p className="mt-1 text-sm text-content-secondary">
                  {activeUploadCount > 0
                    ? `${activeUploadCount} upload${activeUploadCount === 1 ? '' : 's'} in progress`
                    : 'Recent upload activity'}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {uploadTasks.map((task) => (
                <div key={task.id} className="rounded-[22px] border border-stroke-subtle bg-bg-base/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-content-primary">{task.fileName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-content-tertiary">
                        {getUploadStatusLabel(task)}
                      </p>
                    </div>
                    {task.error ? (
                      <span className="text-xs text-status-error">{task.error}</span>
                    ) : null}
                  </div>
                  <ProgressBar value={task.progress} className="mt-3" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          {isLoading && !hasLoadedOnce ? (
            <div className="space-y-3 rounded-[28px] border border-stroke-default bg-bg-elevated/70 p-5">
              <div className="h-4 w-24 rounded-full skeleton-shimmer" />
              <div className="h-10 w-2/5 rounded-[18px] skeleton-shimmer" />
              <div className="h-4 w-1/3 rounded-full skeleton-shimmer" />
            </div>
          ) : tracks.length === 0 ? (
            <EmptyState
              title="No tracks uploaded yet"
              description="Upload the first master to create a private listen link."
            />
          ) : (
            <div className="space-y-4">
              {tracks.map((track) => (
                <article
                  key={track.id}
                  draggable
                  onDragStart={() => setDraggedTrackId(track.id)}
                  onDragEnd={() => setDraggedTrackId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedTrackId) {
                      void reorderTracks(draggedTrackId, track.id);
                    }
                  }}
                  className={`rounded-[28px] border border-stroke-default bg-bg-elevated/70 p-4 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.4)] transition ${
                    draggedTrackId === track.id ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Drag to reorder ${track.title}`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stroke-default bg-bg-base text-content-tertiary"
                        >
                          ↕
                        </button>

                        {editingTrackId === track.id ? (
                          <input
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            onBlur={() => void commitTrackTitle(track)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void commitTrackTitle(track);
                              }

                              if (event.key === 'Escape') {
                                setEditingTrackId(null);
                                setEditingTitle('');
                              }
                            }}
                            className="input h-12 max-w-[320px] rounded-[18px]"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTrackId(track.id);
                              setEditingTitle(track.title);
                            }}
                            className="truncate text-left text-2xl text-content-primary transition hover:text-brand"
                          >
                            {track.title}
                          </button>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge label={`Track ${track.position}`} size="sm" />
                        <StatusBadge label={track.status} tone={getStatusTone(track.status)} size="sm" />
                        <StatusBadge label={formatTrackDuration(track.durationSeconds)} size="sm" />
                        <StatusBadge label={formatTrackFileSize(track.fileSize)} size="sm" />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setShareTrack(track)}
                      >
                        Share
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => void handleDeleteTrack(track)}
                        isLoading={savingTrackId === track.id}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4">
                    {track.previewUrl ? (
                      <AudioPlayer
                        src={track.previewUrl}
                        title={track.title}
                        waveformData={track.waveformData}
                        durationSeconds={track.durationSeconds}
                        compact
                      />
                    ) : (
                      <div className="rounded-[22px] border border-stroke-subtle bg-bg-base/60 p-4 text-sm text-content-secondary">
                        Track preview is not available yet.
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {shareTrack ? (
        <TrackShareLinksModal track={shareTrack} onClose={() => setShareTrack(null)} />
      ) : null}
    </>
  );
}
