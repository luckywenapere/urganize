import { createPostHogEvent } from './shared';
import type { AnalyticsEvent, AnalyticsEventName, AnalyticsEventPropertiesMap } from './shared';

export const ONBOARDING_ANALYTICS_EVENT_NAMES = [
  'onboarding_started',
  'onboarding_role_selected',
  'onboarding_release_created',
  'onboarding_step_skipped',
  'onboarding_completed',
  'onboarding_abandoned',
  'onboarding_spotlight_shown',
  'onboarding_spotlight_skipped',
  'onboarding_task_created_during_flow',
  'onboarding_invite_sent_during_flow',
  'onboarding_completion_screen_shown',
  'onboarding_preview_viewed',
  'onboarding_optin_viewed',
  'onboarding_optin_toggled',
  'onboarding_optin_choices',
  'onboarding_referral_invalid',
  'onboarding_paywall_viewed',
  'onboarding_paywall_card_swiped',
  'onboarding_trial_started',
  'onboarding_paywall_chat',
  'onboarding_welcome_viewed',
  'onboarding_welcome_go',
  'onboarding_invite_skipped',
] as const;

export const TASK_ANALYTICS_EVENT_NAMES = [
  'task_created',
  'task_status_changed',
  'task_assigned',
  'task_completed',
  'task_overdue_viewed',
  'team_member_invited',
  'task_comment_added',
  'task_view_switched',
] as const;

export type TaskAnalyticsEventName = (typeof TASK_ANALYTICS_EVENT_NAMES)[number];
export type TaskAnalyticsEvents = Pick<AnalyticsEventPropertiesMap, TaskAnalyticsEventName>;

export { createPostHogEvent, type AnalyticsEvent, type AnalyticsEventName, type AnalyticsEventPropertiesMap };
