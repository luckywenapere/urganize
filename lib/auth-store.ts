import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthState, User, UserRole } from '@/types';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        // Mock authentication - replace with real API call
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const mockUser: User = {
          id: '1',
          email,
          name: email.split('@')[0],
          role: 'artist-manager',
          createdAt: new Date(),
        };

        set({ user: mockUser, isAuthenticated: true });
      },

      signup: async (email: string, password: string, name: string, role: UserRole) => {
        // Mock signup - replace with real API call
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const mockUser: User = {
          id: Date.now().toString(),
          email,
          name,
          role,
          createdAt: new Date(),
        };

        set({ user: mockUser, isAuthenticated: true });
      },

      logout: () => {
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
