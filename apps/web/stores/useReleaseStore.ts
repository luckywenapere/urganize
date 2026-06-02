'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { CommandCenterData, ExecutionRelease, ExecutionTask } from '@/lib/execution-types';
import { useActivityStore } from '@/stores/useActivityStore';
import { useTaskStore } from '@/stores/useTaskStore';

type ReleaseStore = {
  releases: ExecutionRelease[];
  todaysDirective: ExecutionTask | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: string;
  loadCommandCenter: () => Promise<CommandCenterData | null>;
  createRelease: (title: string) => Promise<ExecutionRelease | null>;
};

const getAccessToken = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
};

export const useReleaseStore = create<ReleaseStore>((set, get) => ({
  releases: [],
  todaysDirective: null,
  isInitialLoading: false,
  isRefreshing: false,
  error: '',
  loadCommandCenter: async () => {
    const hasData = get().releases.length > 0;
    if (!hasData) {
      set({ isInitialLoading: true, error: '' });
    } else {
      set({ isRefreshing: true, error: '' });
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      set({ isInitialLoading: false, isRefreshing: false, error: 'Session expired. Please sign in again.' });
      return null;
    }

    const response = await fetch('/api/command-center', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<CommandCenterData> & { error?: string };
    if (!response.ok || !Array.isArray(payload.releases)) {
      set({ isInitialLoading: false, isRefreshing: false, error: payload.error || 'Could not load releases.' });
      return null;
    }

    useTaskStore.getState().setTasks((payload.tasks || []) as CommandCenterData['tasks']);
    useActivityStore.getState().setActivity(payload.activity || []);
    set({ releases: payload.releases, todaysDirective: payload.todaysDirective || null, isInitialLoading: false, isRefreshing: false, error: '' });
    return payload as CommandCenterData;
  },
  createRelease: async (title) => {
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
        // No artistName: server uses the workspace's artist when the
        // NEXT_PUBLIC_FEATURE_WORKSPACE flag is on (Phase 3), and falls back
        // to the legacy default-artist path when the flag is off.
        releaseDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10),
        source: 'dashboard',
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { releaseId?: string; release?: { title?: string; artistId?: string; artistName?: string; releaseDate?: string | null }; error?: string };
    if (!response.ok || !payload.releaseId) {
      set({ error: payload.error || 'Could not create release.' });
      return null;
    }

    const release: ExecutionRelease = {
      id: payload.releaseId,
      title: payload.release?.title || title,
      artistId: payload.release?.artistId || '',
      artistName: payload.release?.artistName || 'New Artist',
      releaseDate: payload.release?.releaseDate || null,
      description: null,
      status: 'draft',
      state: 'idea',
      readinessScore: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerUserId: '',
      metadata: {},
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
}));
