# Two front doors: team.urganize.app and go.urganize.app (2026-10-28, v1.203.0; team since v1.206.3)

**29 Oct, founder call: the main address is team.urganize.app, not my.urganize.app.** my.urganize.app was the main address for one day (v1.203.0 to v1.206.2). It is now an old address like app.urganize.app: it keeps serving the app and hands signed-in people across, because their sessions were saved under my that day. Read every "my.urganize.app" below as team.urganize.app, except where it is named as an old host. `LEGACY_APP_HOSTS` in `lib/app-hosts.ts` lists both old hosts; go.urganize.app now 308s to team. Supabase Site URL, `NEXT_PUBLIC_APP_URL`, the Google origin and the email logo moved to team the same day; the my.urganize.app entries stay.

Founder call, 28 Oct 2026. The product app moves from app.urganize.app to **my.urganize.app**. **go.urganize.app** is a second name for links we hand to other people; Vercel answers it with a 308 to the same path on my.urganize.app. The marketing site stays on urganize.app.

(An earlier session built this as v1.203.0 but it never reached the repo. This is the rebuild, 29 Oct.)

## Where things point

- `apps/web/lib/app-hosts.ts` is the one source: `APP_ORIGIN` (my), `SHARE_ORIGIN` (go), `LEGACY_APP_HOST` (app), `shareOrigin()`, `currentShareOrigin()`.
- Server links follow `NEXT_PUBLIC_APP_URL`, set to `https://my.urganize.app` for Production in Vercel (28 Oct). The canonical fallback in `resolveAppBaseUrl`, the root layout metadata base, `pitch-payments-server` and email `APP_URL` are `APP_ORIGIN`.
- Share links go through `shareOrigin()`, so they print go.urganize.app on a product host and stay as they are on localhost or a preview: team join and curator join links (`buildJoinUrl`, `buildCuratorJoinUrl`), referral links, waitlist `/r/` links, public profiles `/p/`, press kits `/k/`, capture pages, credit links, briefs, curator pages and the pitch kit link. Email invite accept links (`buildInviteUrl`) and links inside our own emails stay on my.
- Phone app: `apps/mobile/App.tsx` loads my.urganize.app from the next shell build. Shells already installed load app.urganize.app and are moved by the handoff below. Any `*.urganize.app` is first party in the shell, so the move stays inside the app.
- Marketing site `APP_ORIGIN` (Login, Start links) is my.urganize.app.

## Why app.urganize.app still serves the app (do not just 308 it)

The Supabase session is in localStorage, and localStorage belongs to one origin. A Vercel 308 from app to my signs everybody out. This was proven live on 28 Oct: the 308 was on for a few minutes and was turned back off.

So the old host keeps serving the app, and the page moves people (`lib/legacy-host-handoff.ts`):

1. An early `<head>` script (`LEGACY_HOST_EARLY_SCRIPT`, first in `app/layout.tsx`) forwards any sign-in link in flight (`/auth/callback`, or a hash with `access_token`, `error` or `error_description`) to the same URL on my.urganize.app, untouched, before supabase-js can store the session on the old host. That covers confirm emails, magic links and Google returns that were started on the old host.
2. `components/app/LegacyHostHandoff.tsx` (mounted in the root layout) runs on the old host only. It reads the session (getSession refreshes it if expired) and goes to `my.urganize.app/auth/handoff?next=<path>#access_token=…&refresh_token=…&type=handoff`. Tokens ride in the hash, never the query, so they are not sent to any server or log.
3. `app/auth/handoff/page.tsx` stores the session with `setSession`, wipes the hash from the address bar, and opens `next` (`isSafeNextPath` only). It is not a sign-in, so it runs none of `/auth/callback`'s sign-up, invite or onboarding steps. No session means `/auth?next=…`.
4. Signed-out visitors go to the same path on my.urganize.app.

Lost in the move: other per-origin browser storage on the old host (theme choice, drafts, cached lists). People pick the theme once more.

Webhooks and API callers (Paystack, Resend, TRM, MCP clients) that were registered with app.urganize.app keep working, because API routes on the old host are not touched by the handoff. Move each one to my.urganize.app at its provider before the old host is ever redirected.

**Retiring the old host:** once traffic on app.urganize.app is near zero and every webhook is moved, set the Vercel domain to a 308 to my.urganize.app and delete the handoff module, component, page and early script.

## Outside the code (done 28 to 29 Oct)

- Vercel project `urganize`: my.urganize.app (Production), go.urganize.app (308 to my), app.urganize.app (Production, no redirect, see above).
- Namecheap DNS: CNAME `my` and `go` to `890bb18ab284a954.vercel-dns-017.com.`
- Supabase: Site URL `https://my.urganize.app`, `https://my.urganize.app/**` added to Redirect URLs (the app.urganize.app entries stay). Auth email templates reinstalled; the logo loads from my.urganize.app.
- Google Cloud OAuth client: add `https://my.urganize.app` to Authorized JavaScript origins. Needs the theurganization@gmail.com account. Google sign-in does not depend on it (Supabase's redirect flow), so it is tidy-up, not a blocker.
- Not checked: PostHog and Clarity domain settings may need my.urganize.app added for recordings and the toolbar.

## Tests

`lib/legacy-host-handoff.test.ts`: share origins per host, the handoff URL (session in hash only, next kept, no loop into /auth/handoff), forwarding sign-in links untouched, and the early script making the same decision as `isAuthReturn`.
