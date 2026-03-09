# Launch Readiness Checklist

Date: February 27, 2026
Scope: Auth, onboarding, create plan, dashboard, settings, edit plan, review, payments, mobile UX polish.

## 1) Critical User Flows
- [ ] New user can sign up with Google or email and reach dashboard without dead-ends.
- [ ] Existing Google-first user sees Google path first; email login remains hidden until explicit reveal.
- [ ] Existing email-first user can sign in directly with email/password.
- [ ] Auth callback routes never leave user in infinite loading state.
- [ ] Logout works from dashboard, onboarding, and settings.

## 2) Onboarding Reliability
- [ ] Onboarding progress step persists server-side and resumes after refresh or app close.
- [ ] Draft onboarding inputs persist locally per user and release.
- [ ] Draft clears correctly after onboarding completion.
- [ ] "Create new plan" flow re-enters onboarding at intended step and does not overwrite unrelated plan drafts.
- [ ] Skip/continue actions always move to a valid step.

## 3) Dashboard and Plan Management
- [ ] Dashboard empty state has clear CTA and no broken actions.
- [ ] Create-plan inserts release and profile safely; rollback is handled on partial failure.
- [ ] Plan list renders correctly on mobile and desktop.
- [ ] Plan detail supports editing title, artist name, and target date.
- [ ] Save states and error states are visible and actionable.

## 4) Settings and Account UX
- [ ] Profile update reflects immediately after save.
- [ ] Password reset path validates and reports mismatch/weak password clearly.
- [ ] Notification toggles persist by user id.
- [ ] Theme toggle persists across reloads and applies before hydration.
- [ ] Delete account flow requires explicit confirmation text and handles session expiry gracefully.

## 5) Billing and Payments
- [ ] Individual plans: monthly (8,000), 8 months (57,600), yearly (80,000).
- [ ] Group plans support 5+ seats and paid extra seats.
- [ ] Split contribution mode correctly calculates due-now amount.
- [ ] Metadata sent to Paystack is complete (`plan`, `payment_mode`, `team_size`, `seats_paid_now`).
- [ ] Payment callback handles missing references, failures, and retries.
- [ ] Verification endpoint enforces expected amount and plan consistency.
- [ ] Duplicate reference verification is idempotent.
- [ ] Subscription expiry dates map correctly to plan durations.
- [ ] Webhook signature is validated before processing.

## 6) Mobile UX and Error Prevention
- [ ] All key pages are usable at 320px width without clipped controls.
- [ ] Primary actions stay reachable above keyboard on auth/onboarding screens.
- [ ] Form inputs include proper `type`, `autocomplete`, and disabled/loading states.
- [ ] Inline errors are visible near related actions and not only in console.
- [ ] Loading skeletons use theme tokens and are visually consistent.

## 7) Visual Polish
- [ ] Dark-first aesthetic remains tasteful in both dark and light themes.
- [ ] Typography hierarchy is consistent (display for headings, sans for body).
- [ ] Color tokens are used instead of hardcoded black/white in app flows.
- [ ] Motion is subtle and not distracting; reduced-motion users are respected.
- [ ] Brand accents are consistent across auth, onboarding, dashboard, settings, and payment callbacks.

## 8) Release Gates
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes.
- [ ] Manual smoke test on: auth, onboarding resume, create plan, settings billing checkout, payment callback.

## 9) Remaining Integration Work
- [ ] Plug AI API into plan/task generation pipeline.
- [ ] Add retry and fallback messaging for AI generation failures.
- [ ] Log AI request/response metadata for support diagnostics (without storing sensitive user content unnecessarily).
