import { create } from 'zustand';
import { supabase, type Release } from './supabase/client';

interface ReleaseState {
  releases: Release[];
  isLoading: boolean;
  fetchReleases: () => Promise<void>;
  addRelease: (release: Omit<Release, 'id' | 'created_at' | 'updated_at'>) => Promise<Release>;
  updateRelease: (id: string, updates: Partial<Release>) => Promise<void>;
  deleteRelease: (id: string) => Promise<void>;
}

export const useReleaseStore = create<ReleaseState>((set, get) => ({
  releases: [],
  isLoading: false,

  fetchReleases: async () => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('releases')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch releases:', error);
      set({ isLoading: false });
      return;
    }

    set({ releases: data || [], isLoading: false });
  },

  addRelease: async (release) => {
    const { data, error } = await supabase
      .from('releases')
      .insert([release])
      .select()
      .single();

    if (error) throw error;

    set((state) => ({
      releases: [data, ...state.releases],
    }));

    return data;
  },

  updateRelease: async (id, updates) => {
    const { error } = await supabase
      .from('releases')
      .update(updates)
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      releases: state.releases.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    }));
  },

  deleteRelease: async (id) => {
    const { error } = await supabase
      .from('releases')
      .delete()
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      releases: state.releases.filter((r) => r.id !== id),
    }));
  },
}));