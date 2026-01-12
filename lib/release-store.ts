import { create } from 'zustand';
import { supabase, type DbRelease } from './supabase/client';
import type { Release } from '@/types';

// Helper to convert DB format to app format
function dbToRelease(db: DbRelease): Release {
  return {
    id: db.id,
    userId: db.user_id,
    title: db.title,
    artistName: db.artist_name,
    type: db.type,
    status: db.status,
    releaseDate: db.release_date ? new Date(db.release_date) : undefined,
    coverArt: db.cover_art,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  };
}

// Helper to convert app format to DB format
function releaseToDb(release: Partial<Release> & { userId?: string }): any {
  const db: any = {};
  
  if (release.userId) db.user_id = release.userId;
  if (release.title) db.title = release.title;
  if (release.artistName) db.artist_name = release.artistName;
  if (release.type) db.type = release.type;
  if (release.status) db.status = release.status;
  if (release.releaseDate !== undefined) {
    db.release_date = release.releaseDate instanceof Date 
      ? release.releaseDate.toISOString().split('T')[0]
      : release.releaseDate;
  }
  if (release.coverArt !== undefined) db.cover_art = release.coverArt;
  
  return db;
}

interface ReleaseState {
  releases: Release[];
  isLoading: boolean;
  fetchReleases: () => Promise<void>;
  addRelease: (release: Omit<Release, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
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

    const releases = (data || []).map(dbToRelease);
    set({ releases, isLoading: false });
  },

  addRelease: async (release) => {
    const dbRelease = releaseToDb(release);
    
    const { data, error } = await supabase
      .from('releases')
      .insert([dbRelease])
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('No data returned from insert');

    const newRelease = dbToRelease(data);
    
    set((state) => ({
      releases: [newRelease, ...state.releases],
    }));

    return newRelease.id;
  },

  updateRelease: async (id, updates) => {
    const dbUpdates = releaseToDb(updates);
    dbUpdates.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from('releases')
      .update(dbUpdates)
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      releases: state.releases.map((r) =>
        r.id === id ? { ...r, ...updates, updatedAt: new Date() } : r
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