# Urganize

Urganize is a Next.js App Router product for music campaign execution.
Current scope is:

- Supabase auth (email/password + Google OAuth)
- Guided onboarding that creates/updates a campaign plan (`release`)
- Task execution loop (`ai_tasks`) with feedback/proof submission
- Plan dashboard + timeline pacing + next-step generation/custom entry
- Billing/settings with Paystack checkout + payment verification

## Documentation

- Product Requirements Document (MVP): [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md)
- DB migration for canonical artist profile name: [`docs/DB_MIGRATION_ARTIST_NAME.md`](docs/DB_MIGRATION_ARTIST_NAME.md)

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS
- Supabase (Auth, Postgres, Storage)
- Zustand (`lib/auth-store.ts`) for auth/session state
- Paystack (`react-paystack`) for checkout

## Product Flow

1. User lands on `/` and is redirected to `/auth` or `/dashboard`.
2. Auth supports Google and email/password, with provider hints via `/api/auth/providers`.
3. After auth, `AppShell` may show `PostAuthScreen` onboarding.
4. Onboarding creates or resumes a plan and drives step progression in `release_profiles.setup_step`.
5. A first task is created in `ai_tasks`, user executes it, and submits structured feedback + optional proof.
6. User continues from `/dashboard`, each plan page, and `/dashboard/plans/[planId]/next-step`.
7. Billing and subscription management happen in `/settings` (Paystack + trial + account actions).

## Main Routes

- `/auth` - Login/signup (Google + email)
- `/auth/callback` - OAuth callback session handling
- `/auth/forgot-password`, `/auth/reset-password` - Password reset flow
- `/dashboard` - Plans list with active/archived filters and delete modal
- `/dashboard/plans/[planId]` - Plan dashboard, metrics, timeline pace, edit basics
- `/dashboard/plans/[planId]/next-step` - Add/generate the next task step, mark plan complete
- `/settings` - Profile, password, notifications, billing, theme toggle, delete account
- `/payment/callback` - Paystack verification result screen

## API Endpoints

- `POST /api/auth/providers` - Detect whether an email uses Google provider
- `POST /api/trial/start` - Start one-time 10-day free trial
- `GET /api/payments/verify?reference=...` - Verify Paystack transaction and upsert subscription
- `POST /api/plans/[planId]/delete` - Hard-delete a plan and related data
- `POST /api/account/delete-now` - Immediate account and data deletion
- `POST /api/webhooks/paystack` - Signature-validated webhook receiver (currently lightweight ack)

## Required Environment Variables

Add these to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=
PAYSTACK_SECRET_KEY=

# AI generation via local Ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b

# Optional (fallbacks to service role key if unset)
TRIAL_CLAIMS_SALT=
```

## Data Model (Current Usage)

Core tables used by runtime code:

- `profiles`
  - includes `artist_name` (canonical artist profile name for artist-role accounts)
- `releases`
- `release_profiles`
- `ai_tasks`
- `subscriptions`
- `payments`
- `artist_profiles` (read/write in onboarding/settings)

Optional tables (deleted if present during plan delete):

- `plan_feedback`
- `release_assets`
- `files`

Storage bucket used:

- `proofs` (task proof uploads)

## Run Locally

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## Current Architectural Notes

- `app/layout.tsx` is client-side and mounts `AppShell`; it checks auth state and conditionally renders onboarding.
- `lib/subscription-access.ts` currently returns active access for all users (stub implementation).
- Dashboard and plan detail pages use short-lived localStorage caches for perceived speed.
- `types/index.ts` contains legacy domain types and is not the main source of truth for current runtime behavior.

## Known Gaps / TODOs

- Paystack webhook route validates signature but does not yet reconcile data (verification is handled by callback endpoint).
- Subscription access helper is hardcoded to active; tighten with real status checks from `subscriptions`.
- `.env.example` is outdated and does not yet list Supabase/Paystack variables used by code.
- No automated test suite yet.

## Repository Map

```text
app/
  api/                          # Server route handlers
  auth/                         # Auth, callback, password reset pages
  dashboard/                    # Plans list, plan page, next-step page
  payment/callback/             # Payment verification UI
  settings/                     # Profile, billing, security, account deletion
components/
  onboarding/                   # Post-auth onboarding step UI
  billing/                      # Subscription paywall UI
  dashboard/                    # Virtualized plan list
lib/
  supabase/client.ts            # Supabase client + DB-adjacent TS types
  auth-store.ts                 # Zustand auth/session logic
  billing.ts                    # Plan pricing and metadata helpers
  subscription-access.ts        # Access helper (currently stubbed)
```

## Support Chat (Tawk.to)

A floating support chat widget is mounted in the dashboard via `apps/web/components/support/SupportChat.tsx`. It:

- Renders a custom bottom-right FAB (matches the in-app design) and hides Tawk's default bubble.
- Opens the Tawk chat panel on click, with live chat when an agent is online and ticket-style messaging when offline.
- Identifies the visitor (name, email, user id, role) so chat history persists across sessions.
- Shows an unread-message badge on the FAB.
- Only mounts on authenticated, non-public routes (same gate as the help menu).

### Required environment variables

Add to `apps/web/.env.local` and to the deployment environment (e.g. Vercel):

```bash
NEXT_PUBLIC_TAWK_PROPERTY_ID=
NEXT_PUBLIC_TAWK_WIDGET_ID=
```

If either value is missing, the widget renders nothing — the rest of the app keeps working.

### Where to get the Tawk.to values

1. Sign up for a free account at https://www.tawk.to.
2. Create a property for Urganize. Tawk auto-creates a default chat widget under it.
3. In the Tawk dashboard go to **Administration → Channels → Chat Widget**, then open **Direct Chat Link**. The link looks like:
   ```
   https://tawk.to/chat/<PROPERTY_ID>/<WIDGET_ID>
   ```
   The first segment is `NEXT_PUBLIC_TAWK_PROPERTY_ID`, the second is `NEXT_PUBLIC_TAWK_WIDGET_ID`.
4. Recommended dashboard settings:
   - **Appearance**: dark theme + brand color to match the app.
   - **File uploads**: enable in Chat Widget settings (used for proof/screenshot attachments).
   - **Offline form**: enable so messages submitted while no agent is online become tickets.
   - Leave the default Tawk bubble enabled — the app hides it at runtime and renders its own FAB.
5. If the deployment uses a Content Security Policy, allowlist `https://embed.tawk.to`, `https://*.tawk.to`, and `wss://*.tawk.to`.
