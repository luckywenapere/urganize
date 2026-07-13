import { supabase } from '@/lib/supabase/client';
import type { RoadmapIdea, RoadmapIdeaStatus } from './types';

const IDEAS_VIEW = 'roadmap_ideas_public';
const VOTES_TABLE = 'feature_votes';
const IDEAS_TABLE = 'feature_ideas';

/**
 * Reads the public board via roadmap_ideas_public, which already applies RLS
 * row-visibility (hides pending/declined unless you're the submitter or
 * admin) and exposes accurate vote_count + your own has_voted flag.
 */
export async function listIdeas(): Promise<{ ideas: RoadmapIdea[]; error: string | null }> {
  const { data, error } = await supabase
    .from(IDEAS_VIEW)
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return { ideas: [], error: error.message };
  return { ideas: (data ?? []) as RoadmapIdea[], error: null };
}

/**
 * Submits a new idea. RLS forces submitted_by = auth.uid() and status =
 * 'pending' server-side regardless of what's sent here -- this is just the
 * client-side shape.
 */
export async function submitIdea(input: {
  title: string;
  description?: string;
  userId: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from(IDEAS_TABLE).insert({
    title: input.title.trim(),
    description: input.description?.trim() || null,
    submitted_by: input.userId,
    status: 'pending',
  });

  return { error: error?.message ?? null };
}

/** Casts a vote. RLS rejects this if the idea isn't yet public/votable or if
 * the (idea, user) pair already exists (unique constraint). */
export async function castVote(ideaId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from(VOTES_TABLE).insert({ idea_id: ideaId, user_id: userId });
  return { error: error?.message ?? null };
}

/** Removes a vote (unvote toggle). */
export async function removeVote(ideaId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from(VOTES_TABLE)
    .delete()
    .eq('idea_id', ideaId)
    .eq('user_id', userId);
  return { error: error?.message ?? null };
}

/**
 * Admin-only status transition. RLS's is_roadmap_admin() check is the real
 * gate -- a non-admin calling this gets a normal rejected-update error, not a
 * crash, since no rows match the USING clause.
 */
export async function updateIdeaStatus(
  ideaId: string,
  status: RoadmapIdeaStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase.from(IDEAS_TABLE).update({ status }).eq('id', ideaId);
  return { error: error?.message ?? null };
}
