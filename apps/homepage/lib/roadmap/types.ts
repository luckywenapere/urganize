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

export const ROADMAP_STATUS_LABELS: Record<RoadmapIdeaStatus, string> = {
  pending: 'Pending review',
  under_consideration: 'Under consideration',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
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
