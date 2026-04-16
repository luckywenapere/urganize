# Privacy

Urganize records authenticated product sessions with PostHog session replays for product improvement, onboarding optimization, funnel analysis, and UX debugging.

Operational safeguards:

- Password and payment-style inputs are masked in the PostHog browser init config
- Sensitive sections such as private notes, contact details, and contract details use `data-ph-no-capture`
- Pre-save subscriber emails are never sent as browser analytics properties
- Private server-side analytics events only send campaign, release, track, and folder identifiers needed for aggregate product analysis

This note should be reflected in the product privacy policy or terms shown to users before production rollout.
