// Matches supabase/migrations/20260713_add_roadmap_feature_voting.sql's
// feature_idea_status enum and the roadmap_ideas_public view's columns.

export type RoadmapIdeaStatus =
  | 'pending'
  | 'under_consideration'
  | 'planned'
  | 'in_progress'
  | 'shipped'
  | 'declined';

/** Public statuses shown as columns on the board, in pipeline order. */
export const PUBLIC_ROADMAP_STATUSES: readonly RoadmapIdeaStatus[] = [
  'under_consideration',
  'planned',
  'in_progress',
  'shipped',
];

/**
 * Statuses that appear in the ranked voting list (PostHog-style): the open
 * candidates plus committed-but-not-done work, all ranked together by votes.
 * `shipped` is intentionally excluded -- it goes in the muted "Shipped"
 * footer strip and, canonically, the /changelog -- so it never competes with
 * or dilutes the live voting signal.
 */
export const BOARD_STATUSES: readonly RoadmapIdeaStatus[] = [
  'under_consideration',
  'planned',
  'in_progress',
];

/** Every status an admin can move an idea into from the board row control. */
export const ADMIN_STATUS_OPTIONS: readonly RoadmapIdeaStatus[] = [
  'under_consideration',
  'planned',
  'in_progress',
  'shipped',
  'declined',
];

export const ROADMAP_STATUS_LABELS: Record<RoadmapIdeaStatus, string> = {
  pending: 'Pending review',
  under_consideration: 'Under consideration',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Delivered',
  declined: 'Declined',
};

export type RoadmapIdea = {
  id: string;
  title: string;
  description: string | null;
  status: RoadmapIdeaStatus;
  submitted_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  vote_count: number;
  has_voted: boolean;
};
