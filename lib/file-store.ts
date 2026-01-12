import { create } from 'zustand';
import { supabase, type DbFile } from './supabase/client';
import type { ReleaseFile, FileCategory } from '@/types';

interface FileState {
  files: ReleaseFile[];
  isLoading: boolean;
  fetchFiles: () => Promise<void>;
  fetchFilesByRelease: (releaseId: string) => Promise<void>;
  addFile: (file: Omit<ReleaseFile, 'id' | 'uploadedAt'>) => Promise<string>;
  deleteFile: (id: string) => Promise<void>;
  getFilesByRelease: (releaseId: string) => ReleaseFile[];
  getFilesByCategory: (releaseId: string, category: FileCategory) => ReleaseFile[];
}

// Helper to convert DB format to app format
function dbToFile(db: DbFile): ReleaseFile {
  return {
    id: db.id,
    releaseId: db.release_id,
    name: db.name,
    category: db.category,
    size: db.size,
    url: db.storage_path,
    uploadedBy: db.user_id,
    uploadedAt: new Date(db.created_at),
  };
}

// Helper to convert app format to DB format
function fileToDb(file: Partial<ReleaseFile> & { releaseId?: string; uploadedBy?: string }): any {
  const db: any = {};
  
  if (file.releaseId) db.release_id = file.releaseId;
  if (file.uploadedBy) db.user_id = file.uploadedBy;
  if (file.name) db.name = file.name;
  if (file.category) db.category = file.category;
  if (file.size) db.size = file.size;
  if (file.url) db.storage_path = file.url;
  
  return db;
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  isLoading: false,

  fetchFiles: async () => {
    set({ isLoading: true });
    
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch files:', error);
      set({ isLoading: false });
      return;
    }

    const files = (data || []).map(dbToFile);
    set({ files, isLoading: false });
  },

  fetchFilesByRelease: async (releaseId: string) => {
    set({ isLoading: true });
    
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('release_id', releaseId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch files for release:', error);
      set({ isLoading: false });
      return;
    }

    const releaseFiles = (data || []).map(dbToFile);
    
    // Update only files for this release
    set((state) => ({
      files: [
        ...state.files.filter(f => f.releaseId !== releaseId),
        ...releaseFiles
      ],
      isLoading: false,
    }));
  },

  addFile: async (file) => {
    const dbFile = fileToDb(file);
    
    const { data, error } = await supabase
      .from('files')
      .insert([dbFile])
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('No data returned from insert');

    const newFile = dbToFile(data);
    
    set((state) => ({
      files: [newFile, ...state.files],
    }));

    return newFile.id;
  },

  deleteFile: async (id) => {
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
    }));
  },

  getFilesByRelease: (releaseId) => {
    return get().files.filter((f) => f.releaseId === releaseId);
  },

  getFilesByCategory: (releaseId, category) => {
    return get().files.filter(
      (f) => f.releaseId === releaseId && f.category === category
    );
  },
}));

// Helper to check if release has required audio file
export const hasRequiredAudioFile = (releaseId: string, files: ReleaseFile[]) => {
  return files.some(
    (file) => file.releaseId === releaseId && file.category === 'audio'
  );
};