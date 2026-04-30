'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { CommandCenterData, ExecutionRelease, ReleasePipelineState } from '@/lib/execution-types';
import { calculateOverallReadiness } from '@/lib/release-execution';
import { useActivityStore } from '@/stores/useActivityStore';
import { useTaskStore } from '@/stores/useTaskStore';

type ReleaseStore = {
  releases: ExecutionRelease[];
  isLoading: boolean;
  error: string;
  loadCommandCenter: () => Promise<CommandCenterData | null>;
  createRelease: (title: string, state?: ReleasePipelineState) => Promise<ExecutionRelease | null>;
  updateReleaseState: (releaseId: string, state: ReleasePipelineState) => Promise<void>;
};

const getAccessToken = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
};

export const useReleaseStore = create<ReleaseStore>((set, get) => ({
  releases: [],
  isLoading: false,
  error: '',
  loadCommandCenter: async () => {
    set({ isLoading: true, error: '' });
    const accessToken = await getAccessToken();
    if (!accessToken) {
      set({ isLoading: false, error: 'Session expired. Please sign in again.' });
      return null;
    }

    const response = await fetch('/api/command-center', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<CommandCenterData> & { error?: string };
    if (!response.ok || !Array.isArray(payload.releases)) {
      set({ isLoading: false, error: payload.error || 'Could not load Command Center.' });
      return null;
    }

    useTaskStore.getState().setTasks((payload.tasks || []) as CommandCenterData['tasks']);
    useActivityStore.getState().setActivity(payload.activity || []);
    set({ releases: payload.releases, isLoading: false, error: '' });
    return payload as CommandCenterData;
  },
  createRelease: async (title, state = 'idea') => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      set({ error: 'Session expired. Please sign in again.' });
      return null;
    }

    const response = await fetch('/api/releases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title,
        artistName: 'New Artist',
        releaseDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10),
        state,
        source: 'dashboard',
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { releaseId?: string; release?: { title?: string; artistName?: string; releaseDate?: string | null }; error?: string };
    if (!response.ok || !payload.releaseId) {
      set({ error: payload.error || 'Could not create release.' });
      return null;
    }

    const release: ExecutionRelease = {
      id: payload.releaseId,
      title: payload.release?.title || title,
      artistName: payload.release?.artistName || 'New Artist',
      releaseDate: payload.release?.releaseDate || null,
      description: null,
      status: 'draft',
      state,
      readinessScore: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((current) => ({ releases: [release, ...current.releases], error: '' }));
    useActivityStore.getState().addLocalActivity({
      releaseId: release.id,
      taskId: null,
      actorName: 'You',
      action: 'created_release',
      message: `Created ${release.title}`,
    });
    return release;
  },
  updateReleaseState: async (releaseId, state) => {
    const release = get().releases.find((candidate) => candidate.id === releaseId);
    if (!release) return;

    const readinessScore = calculateOverallReadiness(useTaskStore.getState().tasksForRelease(releaseId));
    const accessToken = await getAccessToken();
    if (!accessToken) {
      set({ error: 'Session expired. Please sign in again.' });
      return;
    }

    const response = await fetch(`/api/releases/${releaseId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title: release.title,
        artistName: release.artistName,
        releaseDate: release.releaseDate || new Date().toISOString().slice(0, 10),
        description: release.description || '',
        status: release.status,
        state,
        readinessScore,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      set({ error: payload.error || 'Could not update release state.' });
      return;
    }

    set((current) => ({
      releases: current.releases.map((candidate) =>
        candidate.id === releaseId ? { ...candidate, state, readinessScore, updatedAt: new Date().toISOString() } : candidate
      ),
      error: '',
    }));
    useActivityStore.getState().addLocalActivity({
      releaseId,
      taskId: null,
      actorName: 'You',
      action: 'advanced_state',
      message: `Moved ${release.title} to ${state.replace(/_/g, ' ')}`,
    });
  },
}));
