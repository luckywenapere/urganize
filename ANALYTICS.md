# Analytics

Urganize uses PostHog for product analytics, session replays, autocapture, rage-click detection, and manually typed product events inside `apps/web`.

## Environment

Set these values for the web app:

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_your_project_key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

`NEXT_PUBLIC_POSTHOG_KEY` is used by both the browser SDK and the server-side capture helper in Next.js routes.

## Implementation Notes

- Browser bootstrap lives in `apps/web/components/providers/PostHogProvider.tsx`
- Manual App Router pageviews live in `apps/web/components/providers/PostHogPageView.tsx`
- Typed event definitions and helpers live in `apps/web/lib/analytics/events.ts`
- Server-side capture helpers live in `apps/web/lib/posthog.ts`
- Sensitive areas use `data-ph-no-capture`
- Section grouping for autocapture uses `data-ph-capture-attribute-section`

## Recommended PostHog Dashboard Funnels

### Activation Funnel

Event sequence:

1. `onboarding_started`
2. `onboarding_role_selected`
3. `onboarding_release_created`
4. `onboarding_completed`

Suggested breakdowns:

- `role`
- `has_release_date`
- `has_cover_art`

Suggested cohorts:

- `role = artist`
- `role = manager`
- `role = label`

### Track Share Funnel

Event sequence:

1. `track_upload_completed`
2. `track_share_link_created`
3. `track_listen_page_opened`
4. `track_played`

Suggested breakdowns:

- `has_expiry`
- `release_id`

Suggested cohorts:

- Users with at least one release created in the last 30 days
- Users whose role is `manager` or `label`

### Pre-Save Funnel

Event sequence:

1. `presave_campaign_created`
2. `presave_link_copied`
3. `presave_email_submitted`

Suggested breakdowns:

- `has_cover_art`
- `has_streaming_links`
- `campaign_id`

Suggested cohorts:

- `role = artist`
- users who completed onboarding

### Feature Adoption Funnel

Event sequence:

1. `release_created`
2. `playbook_step_completed`
3. `track_upload_completed`
4. `presave_campaign_created`
5. `folder_item_added`

Suggested breakdowns:

- `source`
- `role`
- `item_type`

Suggested cohorts:

- releases created from `source = onboarding`
- releases created from `source = empty_state`

## Verification Checklist

After deployment, verify in PostHog Live Events:

1. `$pageview` appears on every client-side route change
2. `identify` resolves users by email and role
3. Session recordings are visible for authenticated sessions
4. Server-side events appear for listen hits, CSV exports, and pre-save submissions
