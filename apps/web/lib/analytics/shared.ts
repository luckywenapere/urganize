import type { Profile } from '@/lib/supabase/client';

/**
 * Audit findings before the PostHog integration:
 * 1. `apps/web/package.json` already included `@vercel/analytics`, but no Mixpanel/PostHog/Segment/Amplitude/Hotjar/FullStory/LogRocket SDKs were installed.
 * 2. The app already had a lightweight local helper at `apps/web/lib/analytics.ts` that stored a small event log in `localStorage`, plus legacy call sites in settings and billing.
 * 3. `apps/web/.env.example` and `apps/web/.env.local` only exposed `NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS`; no PostHog keys or hosts were configured yet.
 * 4. Third-party analytics were not injected via `<Script>` tags. The active shell mounted optional Vercel Analytics from `components/app/AppShell.tsx`, while `app/layout.tsx` only injected the theme bootstrap script.
 * 5. Because Windows cannot have both `lib/analytics.ts` and `lib/analytics/events.ts`, the old file-based helper was replaced with a folder-based analytics entrypoint.
 * 6. The first PostHog pass mixed browser and server helpers in one module; the production build now keeps shared event types here, browser capture in `client.ts`, and `posthog-node` server capture in `server.ts`.
 */

type EmptyAnalyticsProperties = Record<string, never>;

export type ReleaseCreatedSource = 'onboarding' | 'dashboard' | 'empty_state';
export type TaskCreatedSource = 'quick_create' | 'inline' | 'detail_panel' | 'onboarding';

export interface AnalyticsEventPropertiesMap {
  onboarding_started: EmptyAnalyticsProperties;
  onboarding_role_selected: { role: 'artist' | 'manager' | 'label' | 'other' };
  onboarding_release_created: {
    release_id: string;
    has_release_date: boolean;
  };
  onboarding_step_skipped: { step: number };
  onboarding_completed: { time_to_complete_seconds: number };
  onboarding_abandoned: { step: number };
  onboarding_spotlight_shown: { step: number; target_selector: string };
  onboarding_spotlight_skipped: { step: number };
  onboarding_task_created_during_flow: { release_id: string; task_id: string };
  onboarding_invite_sent_during_flow: EmptyAnalyticsProperties;
  onboarding_completion_screen_shown: {
    release_created: boolean;
    task_created: boolean;
    invite_sent: boolean;
  };
  release_created: { release_id: string; source: ReleaseCreatedSource };
  release_opened: { release_id: string };
  release_date_set: { release_id: string };
  release_deleted: { release_id: string };
  playbook_step_completed: {
    release_id: string;
    step_id: string;
    step_title: string;
    is_custom: boolean;
  };
  playbook_step_uncompleted: { release_id: string; step_id: string };
  playbook_step_added: { release_id: string };
  playbook_step_deleted: { release_id: string; was_default: boolean };
  playbook_reordered: { release_id: string };
  playbook_defaults_restored: { release_id: string };
  task_created: {
    release_id: string | null;
    has_assignee: boolean;
    has_due_date: boolean;
    priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
    source: TaskCreatedSource;
  };
  task_status_changed: {
    task_id: string;
    from_status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
    to_status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
  };
  task_assigned: { task_id: string; assigned_to_self: boolean };
  task_completed: { task_id: string; release_id: string | null; days_until_due: number | null };
  task_overdue_viewed: { task_id: string; days_overdue: number };
  team_member_invited: { role: 'owner' | 'admin' | 'member' | 'guest' };
  task_comment_added: { task_id: string };
  task_view_switched: { view: 'kanban' | 'list' };
  feature_discovered: { feature: string };
  empty_state_cta_clicked: { feature: string; cta_label: string };
  next_action_banner_clicked: { release_id: string; action: string };
  next_action_banner_dismissed: { release_id: string; action: string };
  signup_completed: Record<string, unknown>;
  artist_created: Record<string, unknown>;
  pricing_validation_submitted: Record<string, unknown>;
  trial_started: Record<string, unknown>;
  trial_converted: Record<string, unknown>;
  // URG-178: free core + paid tier gating.
  gated_feature_attempted: {
    flag: 'catalogView' | 'chappiAssistant' | 'fileManagement' | 'crossReleaseInsights';
    surface: string;
  };
  free_to_paid_conversion: { plan: string | null };
  time_to_first_release: { seconds_since_signup: number };
  time_to_first_completed_task: { seconds_since_signup: number };
}

export type AnalyticsEventName = keyof AnalyticsEventPropertiesMap;

export type AnalyticsEvent = {
  [Name in AnalyticsEventName]: {
    name: Name;
    properties: AnalyticsEventPropertiesMap[Name];
  };
}[AnalyticsEventName];

export type StoredAnalyticsEvent = {
  id: string;
  name: string;
  userId: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
};

export type AnalyticsIdentity = Pick<Profile, 'id' | 'email' | 'name' | 'role' | 'created_at'> & {
  onboarding_role?: Profile['onboarding_role'];
};

export function getPostHogProjectKey(): string {
  const preferredKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (preferredKey) {
    return preferredKey;
  }

  return process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() || '';
}

export function createPostHogEvent<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventPropertiesMap[Name]
): AnalyticsEvent {
  return {
    name,
    properties,
  } as AnalyticsEvent;
}
