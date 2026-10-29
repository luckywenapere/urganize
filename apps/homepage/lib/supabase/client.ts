import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Points at the SAME Supabase project apps/web uses (shared auth.users pool)
// -- see supabase/migrations/20260713_add_roadmap_feature_voting.sql. This is
// a SEPARATE client instance with its own session (localStorage is
// origin-scoped, so urganize.app and team.urganize.app never share a session
// -- no SSO, by design). Never point these env vars at a different project.
//
// Lazily constructed (unlike apps/web's equivalent, which throws eagerly at
// import time): apps/web always has these vars set, but here they're optional
// -- only needed when NEXT_PUBLIC_FEATURE_ROADMAP is on. An eager throw broke
// `next build`'s static prerender of /roadmap/auth/callback (a 'use client'
// page Next still evaluates in Node at build time) whenever the vars are
// unset, which is the common case for every environment that hasn't turned
// the roadmap on yet. The proxy defers construction until a property is
// actually accessed -- which only happens inside browser-only effects/handlers
// in this feature's components, never during prerendering.
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (same project as apps/web) and restart the dev server.'
    );
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
