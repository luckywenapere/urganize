import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FileState, ReleaseFile, FileCategory } from '@/types';

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      files: [],

      addFile: (fileData) => {
        const newFile: ReleaseFile = {
          ...fileData,
          id: Date.now().toString() + Math.random(),
          uploadedAt: new Date(),
        };

        set((state) => ({
          files: [...state.files, newFile],
        }));
      },

      deleteFile: (id) => {
        set((state) => ({
          files: state.files.filter((file) => file.id !== id),
        }));
      },

      getFilesByRelease: (releaseId) => {
        return get().files.filter((file) => file.releaseId === releaseId);
      },

      getFilesByCategory: (releaseId, category) => {
        return get().files.filter(
          (file) => file.releaseId === releaseId && file.category === category
        );
      },
    }),
    {
      name: 'file-storage',
    }
  )
);

// Helper to check if release has required audio file
export const hasRequiredAudioFile = (releaseId: string, files: ReleaseFile[]) => {
  return files.some(
    (file) => file.releaseId === releaseId && file.category === 'audio'
  );
};
