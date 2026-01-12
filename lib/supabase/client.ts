import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Type definitions matching your database schema
export type Profile = {
  id: string;
  name: string;
  email: string;
  role: 'artist' | 'manager' | 'artist-manager';
  created_at: string;
  updated_at: string;
};

export type DbRelease = {
  id: string;
  user_id: string;
  title: string;
  artist_name: string;
  type: 'single' | 'ep' | 'album';
  status: 'draft' | 'in-progress' | 'ready' | 'released';
  release_date?: string;
  cover_art?: string;
  created_at: string;
  updated_at: string;
};

export type DbTask = {
  id: string;
  release_id: string;
  user_id: string;
  title: string;
  description?: string;
  phase: 'pre-production' | 'production' | 'promotion' | 'distribution';
  status: 'pending' | 'completed';
  due_date?: string;
  is_system_generated: boolean;
  order?: number;
  created_at: string;
  updated_at: string;
};

export type DbFile = {
  id: string;
  release_id: string;
  user_id: string;
  name: string;
  category: 'audio' | 'stems' | 'artwork' | 'licenses' | 'contracts';
  size: number;
  storage_path: string;
  mime_type?: string;
  created_at: string;
};

// Helper function to handle Supabase errors
export function handleSupabaseError(error: any): string {
  if (error?.message) {
    // User-friendly error messages
    if (error.message.includes('duplicate key')) {
      return 'This email is already registered';
    }
    if (error.message.includes('Invalid login credentials')) {
      return 'Invalid email or password';
    }
    if (error.message.includes('Email not confirmed')) {
      return 'Please verify your email before logging in';
    }
    return error.message;
  }
  return 'An unexpected error occurred';
}