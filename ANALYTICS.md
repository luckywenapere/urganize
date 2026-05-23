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

Suggested cohorts:

- `role = artist`
- `role = manager`
- `role = label`

### Feature Adoption Funnel

Event sequence:

1. `release_created`
2. `playbook_step_completed`

Suggested breakdowns:

- `source`
- `role`

Suggested cohorts:

- releases created from `source = onboarding`
- releases created from `source = empty_state`

## Verification Checklist

After deployment, verify in PostHog Live Events:

1. `$pageview` appears on every client-side route change
2. `identify` resolves users by email and role
3. Session recordings are visible for authenticated sessions
4. Server-side events appear for listen hits and CSV exports
